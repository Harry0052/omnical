// ── Action Plan Executor ─────────────────────────────
// Executes action plan steps in dependency order.

import Anthropic from "@anthropic-ai/sdk";
import type {
  PipelineRun,
  CalendarEventRecord,
  ActionPlan,
  ActionStep,
} from "./types";
import { pipelineStore } from "./index";
import { createTinyFishClient, type ITinyFishClient } from "./tinyfish-client";
import { isConnected } from "../integrations";
import {
  getStepStartLabel,
  getStepCompleteLabel,
  getStepFailLabel,
  getServiceForStep,
} from "./status-labels";

// ── Claude Client ────────────────────────────────────

let claudeClient: Anthropic | null = null;

function getClaudeClient(): Anthropic {
  if (!claudeClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is required");
    claudeClient = new Anthropic({ apiKey });
  }
  return claudeClient;
}

// ── Step Executors ───────────────────────────────────

async function executeClaudeGenerate(
  step: ActionStep,
  record: CalendarEventRecord,
  priorOutputs: Record<string, unknown>,
  enrichment?: import("./types").EnrichmentData,
): Promise<Record<string, unknown>> {
  const client = getClaudeClient();
  const input = step.input as { prompt: string; eventTitle: string; [key: string]: unknown };

  const contextParts = [
    `Task: Generate ${input.prompt} content`,
    `Event: ${input.eventTitle}`,
  ];

  if (input.eventDescription || record.description) {
    contextParts.push(`Description: ${input.eventDescription || record.description}`);
  }
  if (input.attendees) contextParts.push(`Attendees: ${(input.attendees as string[]).join(", ")}`);
  if (input.location || record.location) contextParts.push(`Location: ${input.location || record.location}`);

  // Include enrichment context if available
  if (enrichment) {
    contextParts.push(`\nInferred context: ${enrichment.inferredContext}`);
    if (enrichment.gatheredContext.emails.length > 0) {
      contextParts.push(`\nRelated emails found:`);
      for (const email of enrichment.gatheredContext.emails.slice(0, 5)) {
        contextParts.push(`  - "${email.subject}" from ${email.from} (${email.date}): ${email.snippet}`);
      }
    }
    if (enrichment.gatheredContext.slackMessages.length > 0) {
      contextParts.push(`\nRelated Slack messages:`);
      for (const msg of enrichment.gatheredContext.slackMessages.slice(0, 5)) {
        contextParts.push(`  - #${msg.channel} ${msg.user}: ${msg.text.slice(0, 200)}`);
      }
    }
  }

  // Include outputs from prior steps
  const priorContext = Object.entries(priorOutputs)
    .map(([stepId, output]) => `[${stepId}]: ${JSON.stringify(output)}`)
    .join("\n\n");

  if (priorContext) {
    contextParts.push(`\nGathered context from prior steps:\n${priorContext}`);
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: contextParts.join("\n") }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const content = textBlock?.type === "text" ? textBlock.text : "";

  return { generatedContent: content, model: response.model };
}

async function executeTinyFishBrowse(
  step: ActionStep,
  tinyFishClient: ITinyFishClient,
  pipelineRunId: string,
): Promise<Record<string, unknown>> {
  const input = step.input as { urls: string[]; instructions: string };
  const results: Record<string, unknown>[] = [];
  const isReal = tinyFishClient.isReal();

  for (const url of (input.urls ?? [])) {
    const taskId = `tf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let hostname: string;
    try { hostname = new URL(url).hostname; } catch { hostname = url; }

    pipelineStore.appendLog(pipelineRunId, {
      timestamp: new Date().toISOString(),
      stage: "executing",
      message: `TinyFish starting browser session for ${url}`,
      service: "tinyfish",
      label: isReal ? `TinyFish navigating to ${hostname}` : `Simulating navigation to ${hostname}`,
      data: { taskId, url, isReal },
    });

    // Use SSE streaming — callbacks fire live during execution
    const result = await tinyFishClient.runTask(
      { id: taskId, url, instructions: input.instructions, timeoutMs: 60_000 },
      // onProgress: log each SSE event as it arrives
      (msg) => {
        pipelineStore.appendLog(pipelineRunId, {
          timestamp: new Date().toISOString(),
          stage: "executing",
          message: `TinyFish: ${msg}`,
          service: "tinyfish",
          label: msg,
          data: { taskId, url },
        });
      },
      // onStreamingUrl: persist immediately when STREAMING_URL event arrives
      (streamUrl) => {
        pipelineStore.update(pipelineRunId, {
          tinyFishStreamingUrl: streamUrl,
          tinyFishRunId: taskId,
        });
        pipelineStore.appendLog(pipelineRunId, {
          timestamp: new Date().toISOString(),
          stage: "executing",
          message: `TinyFish live stream: ${streamUrl}`,
          service: "tinyfish",
          label: "Live browser preview available",
          data: { streamingUrl: streamUrl, taskId },
        });
      },
    );

    // Also persist from result if not already set (fallback path)
    if (result.streamingUrl) {
      pipelineStore.update(pipelineRunId, {
        tinyFishStreamingUrl: result.streamingUrl,
        tinyFishRunId: result.runId ?? taskId,
      });
    }

    results.push({
      url,
      taskId: result.runId ?? taskId,
      status: result.status,
      data: result.extractedData,
      screenshots: result.screenshots ?? [],
      streamingUrl: result.streamingUrl,
      progressMessages: result.progressMessages ?? [],
      error: result.error,
    });

    // Clear streaming URL after task completes
    pipelineStore.update(pipelineRunId, { tinyFishStreamingUrl: null });

    const screenshotInfo = result.screenshots?.length ? ` (${result.screenshots.length} screenshot(s))` : "";
    pipelineStore.appendLog(pipelineRunId, {
      timestamp: new Date().toISOString(),
      stage: "executing",
      message: `TinyFish ${result.status} for ${url}${screenshotInfo}`,
      service: "tinyfish",
      label: result.status === "completed"
        ? `Finished browsing ${hostname}`
        : `TinyFish ${result.status} on ${hostname}`,
      data: {
        taskId: result.runId ?? taskId,
        url,
        status: result.status,
        hasScreenshots: !!result.screenshots?.length,
        hasStreamingUrl: !!result.streamingUrl,
      },
    });
  }

  // Check if any browse actually succeeded
  const anySucceeded = results.some((r) => (r as Record<string, unknown>).status === "completed");
  const allFailed = results.length > 0 && results.every((r) => (r as Record<string, unknown>).status !== "completed");
  const errors = results
    .filter((r) => (r as Record<string, unknown>).error)
    .map((r) => String((r as Record<string, unknown>).error));

  if (allFailed) {
    const errorSummary = errors.length > 0 ? errors.join("; ") : "All browser tasks failed";
    throw new Error(`TinyFish browsing failed: ${errorSummary}`);
  }

  return { browseResults: results, isReal, anySucceeded, partialFailure: !anySucceeded ? false : results.some((r) => (r as Record<string, unknown>).status !== "completed") };
}

async function executeIntegrationFetch(
  step: ActionStep,
  record: CalendarEventRecord,
): Promise<Record<string, unknown>> {
  const input = step.input as { type: string; query: string; attendees?: string[] };
  const userId = "demo-user";

  if (input.type === "gmail" && isConnected(userId, "gmail")) {
    try {
      const { searchForEventContext } = await import("../integrations/gmail");
      const messages = await searchForEventContext(
        userId,
        input.query ?? record.title,
        input.attendees ?? record.attendees ?? [],
      );
      return {
        source: "gmail",
        messages: messages.map((m) => ({
          subject: m.subject,
          from: m.from,
          date: m.date,
          snippet: m.snippet,
        })),
      };
    } catch (err) {
      return { source: "gmail", error: String(err), messages: [] };
    }
  }

  if (input.type === "slack" && isConnected(userId, "slack")) {
    try {
      const { searchMessages } = await import("../integrations/slack");
      const messages = await searchMessages(userId, input.query ?? record.title);
      return {
        source: "slack",
        messages: messages.map((m) => ({
          channel: m.channelName,
          user: m.userName,
          text: m.text,
          timestamp: m.timestamp,
        })),
      };
    } catch (err) {
      return { source: "slack", error: String(err), messages: [] };
    }
  }

  return { source: input.type, messages: [], note: "Integration not connected" };
}

// ── Topological Sort ─────────────────────────────────

function getExecutionOrder(steps: ActionStep[]): ActionStep[][] {
  const remaining = new Map(steps.map((s) => [s.id, s]));
  const completed = new Set<string>();
  const batches: ActionStep[][] = [];

  while (remaining.size > 0) {
    const batch: ActionStep[] = [];

    for (const [id, step] of remaining) {
      const deps = step.dependsOn ?? [];
      if (deps.every((d) => completed.has(d))) {
        batch.push(step);
      }
    }

    if (batch.length === 0) {
      // Circular dependency or unresolvable — log and execute remaining in order
      const unresolvedIds = Array.from(remaining.keys());
      console.warn(`[pipeline:executor] Circular or unresolvable step dependencies detected: ${unresolvedIds.join(", ")}. Executing remaining steps sequentially.`);
      batch.push(...remaining.values());
      remaining.clear();
    }

    for (const step of batch) {
      remaining.delete(step.id);
      completed.add(step.id);
    }

    batches.push(batch);
  }

  return batches;
}

// ── Main Executor ────────────────────────────────────

export async function executeActionPlan(
  run: PipelineRun,
  record: CalendarEventRecord,
  plan: ActionPlan,
): Promise<Record<string, unknown>> {
  const tinyFishClient = createTinyFishClient();
  const isTinyFishReal = tinyFishClient.isReal();
  const enrichment = run.enrichment;
  const stepOutputs: Record<string, unknown> = {};
  const batches = getExecutionOrder(plan.steps);

  for (const batch of batches) {
    for (const step of batch) {
      // Skip artifact_create steps — handled by synthesizer
      if (step.type === "artifact_create") {
        step.status = "completed";
        step.completedAt = new Date().toISOString();
        continue;
      }

      step.status = "running";
      step.startedAt = new Date().toISOString();

      const service = getServiceForStep(step.type);
      const isReal = step.type === "tinyfish_browse" ? isTinyFishReal : undefined;

      // Track TinyFish usage when a browse step starts
      if (step.type === "tinyfish_browse") {
        const currentRun = pipelineStore.get(run.id);
        if (currentRun?.serviceMode) {
          pipelineStore.update(run.id, {
            serviceMode: {
              ...currentRun.serviceMode,
              tinyfishUsage: "active",
              tinyfishUsageReason: isTinyFishReal
                ? `Real browser session started for step "${step.id}"`
                : `Simulated browser session for step "${step.id}" (env vars not configured)`,
            },
          });
        }
      }

      pipelineStore.appendLog(run.id, {
        timestamp: new Date().toISOString(),
        stage: "executing",
        message: `Executing step: ${step.description}`,
        data: { stepId: step.id, stepType: step.type, isReal },
        service,
        label: getStepStartLabel(step.type, isReal),
      });

      try {
        let output: Record<string, unknown>;

        switch (step.type) {
          case "claude_generate":
            output = await executeClaudeGenerate(step, record, stepOutputs, enrichment);
            break;
          case "tinyfish_browse":
            output = await executeTinyFishBrowse(step, tinyFishClient, run.id);
            break;
          case "integration_fetch":
            output = await executeIntegrationFetch(step, record);
            break;
          default:
            output = { note: `Unknown step type: ${step.type}` };
        }

        step.output = output;
        step.status = "completed";
        step.completedAt = new Date().toISOString();
        stepOutputs[step.id] = output;

        // Track TinyFish completion
        if (step.type === "tinyfish_browse") {
          const curRun = pipelineStore.get(run.id);
          if (curRun?.serviceMode) {
            pipelineStore.update(run.id, {
              serviceMode: {
                ...curRun.serviceMode,
                tinyfishUsage: "completed",
                tinyfishUsageReason: isTinyFishReal
                  ? `Real browser work completed for step "${step.id}"`
                  : `Simulated browser work completed for step "${step.id}"`,
              },
            });
          }
        }

        pipelineStore.appendLog(run.id, {
          timestamp: new Date().toISOString(),
          stage: "executing",
          message: `Step completed: ${step.description}`,
          data: { stepId: step.id },
          service,
          label: getStepCompleteLabel(step.type),
        });
      } catch (err) {
        step.status = "failed";
        step.error = err instanceof Error ? err.message : String(err);
        step.completedAt = new Date().toISOString();

        // Track TinyFish failure
        if (step.type === "tinyfish_browse") {
          const curRun = pipelineStore.get(run.id);
          if (curRun?.serviceMode) {
            pipelineStore.update(run.id, {
              serviceMode: {
                ...curRun.serviceMode,
                tinyfishUsage: "failed",
                tinyfishUsageReason: `Browser step "${step.id}" failed: ${step.error}`,
              },
            });
          }
        }

        pipelineStore.appendLog(run.id, {
          timestamp: new Date().toISOString(),
          stage: "executing",
          message: `Step failed: ${step.description} — ${step.error}`,
          data: { stepId: step.id, error: step.error },
          service,
          label: getStepFailLabel(step.type),
        });

        // Check if any downstream steps depend on this one
        const failedId = step.id;
        for (const futureStep of plan.steps) {
          if (futureStep.dependsOn?.includes(failedId) && futureStep.status === "pending") {
            futureStep.status = "skipped";
            futureStep.error = `Skipped: dependency "${failedId}" failed`;
          }
        }
      }
    }
  }

  return stepOutputs;
}
