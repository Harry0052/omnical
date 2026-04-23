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
import { executeWebResearch } from "./web-research";
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

async function executeWebResearchStep(
  step: ActionStep,
  pipelineRunId: string,
): Promise<Record<string, unknown>> {
  const input = step.input as { urls?: string[]; instructions: string; query?: string };
  const taskId = `wr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  pipelineStore.appendLog(pipelineRunId, {
    timestamp: new Date().toISOString(),
    stage: "executing",
    message: `Starting web research: ${input.instructions.slice(0, 100)}`,
    service: "context_engine",
    label: "Researching context via Claude",
    data: { taskId },
  });

  const result = await executeWebResearch(
    {
      id: taskId,
      query: input.query ?? input.instructions,
      urls: input.urls,
      instructions: input.instructions,
    },
    (msg) => {
      pipelineStore.appendLog(pipelineRunId, {
        timestamp: new Date().toISOString(),
        stage: "executing",
        message: msg,
        service: "context_engine",
        label: msg,
        data: { taskId },
      });
    },
  );

  if (result.status === "failed") {
    throw new Error(`Web research failed: ${result.error}`);
  }

  return {
    researchContext: result.synthesizedContext,
    taskId: result.taskId,
    status: result.status,
  };
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

      pipelineStore.appendLog(run.id, {
        timestamp: new Date().toISOString(),
        stage: "executing",
        message: `Executing step: ${step.description}`,
        data: { stepId: step.id, stepType: step.type },
        service,
        label: getStepStartLabel(step.type),
      });

      try {
        let output: Record<string, unknown>;

        switch (step.type) {
          case "claude_generate":
            output = await executeClaudeGenerate(step, record, stepOutputs, enrichment);
            break;
          case "web_research":
            output = await executeWebResearchStep(step, run.id);
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
