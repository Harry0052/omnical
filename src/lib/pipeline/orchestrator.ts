// ── Pipeline Orchestrator ────────────────────────────
// Main coordinator: classify -> plan -> execute -> synthesize.
// Idempotent — one active run per event (with lock).

import type {
  CalendarEventRecord,
  PipelineRun,
  PipelineStage,
  PipelineServiceStatus,
  IntegrationContext,
  ServiceName,
} from "./types";
import {
  eventRecordStore,
  pipelineStore,
  artifactStore,
  settingsStore,
} from "./index";
import { classifyEvent } from "./classify";
import { planActionsAsync } from "./planner";
import { executeActionPlan } from "./executor";
import { synthesizeArtifact } from "./synthesizer";
import { synthesizeStudyGuide } from "./workflows/study-guide";
import { synthesizeZoomNotes } from "./workflows/zoom-notes";
import { synthesizeSlideDeck } from "./workflows/slide-deck";
import { isConnected } from "../integrations";
import { getStageLabel } from "./status-labels";
import { enrichEvent } from "./enrich";

// ── Helpers ──────────────────────────────────────────

function log(
  runId: string,
  stage: PipelineStage,
  message: string,
  opts?: { data?: Record<string, unknown>; service?: ServiceName; label?: string },
) {
  pipelineStore.appendLog(runId, {
    timestamp: new Date().toISOString(),
    stage,
    message,
    data: opts?.data,
    service: opts?.service,
    label: opts?.label,
  });
}

function detectServiceMode(): PipelineServiceStatus {
  return {
    claude: process.env.ANTHROPIC_API_KEY ? "real" : "unavailable",
    tinyfish: (process.env.TINYFISH_API_URL && process.env.TINYFISH_API_KEY) ? "real" : "mock",
    tinyfishUsage: "not_planned",
    tinyfishUsageReason: "No action plan yet",
  };
}

function updateStage(runId: string, stage: PipelineStage) {
  pipelineStore.update(runId, { stage });
}

function getIntegrationContext(): IntegrationContext {
  const userId = "demo-user";
  return {
    googleCalendarConnected: isConnected(userId, "google-calendar"),
    gmailConnected: isConnected(userId, "gmail"),
    slackConnected: isConnected(userId, "slack"),
    googleDocsConnected: isConnected(userId, "google-docs"),
  };
}

// ── Rate Limiting ────────────────────────────────────

function checkRateLimit(userId: string): { allowed: boolean; reason?: string } {
  const settings = settingsStore.get(userId);
  const runs = pipelineStore.listForUser(userId);
  const now = Date.now();

  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const runsLastHour = runs.filter((r) => new Date(r.createdAt).getTime() >= oneHourAgo).length;
  const runsLastDay = runs.filter((r) => new Date(r.createdAt).getTime() >= oneDayAgo).length;

  if (runsLastHour >= settings.rateLimits.maxRunsPerHour) {
    return { allowed: false, reason: `Rate limit: ${runsLastHour}/${settings.rateLimits.maxRunsPerHour} runs in the last hour` };
  }
  if (runsLastDay >= settings.rateLimits.maxRunsPerDay) {
    return { allowed: false, reason: `Rate limit: ${runsLastDay}/${settings.rateLimits.maxRunsPerDay} runs today` };
  }

  return { allowed: true };
}

// ── Run Lock ─────────────────────────────────────────
// Simple lock set to prevent race conditions on concurrent triggers.

const activeLocks = new Set<string>();

// ── Workflow-Specific Synthesis ───────────────────────

async function synthesizeForWorkflow(
  workflowType: string,
  record: CalendarEventRecord,
  runId: string,
  stepOutputs: Record<string, unknown>,
): Promise<import("./types").Artifact> {
  if (workflowType === "study_guide_generation") {
    return synthesizeStudyGuide(record, runId, stepOutputs);
  }
  if (workflowType === "zoom_note_capture") {
    return synthesizeZoomNotes(record, runId, stepOutputs);
  }
  if (workflowType === "slide_deck_generation") {
    return synthesizeSlideDeck(record, runId, stepOutputs);
  }

  // Generic synthesis for other workflows
  const sources: string[] = [];
  for (const [, output] of Object.entries(stepOutputs)) {
    const out = output as Record<string, unknown>;
    if (out.source) sources.push(String(out.source));
    if (out.browseResults) {
      const results = out.browseResults as Array<{ url: string }>;
      for (const r of results) sources.push(r.url);
    }
  }
  return synthesizeArtifact(record, workflowType as import("./types").WorkflowType, runId, stepOutputs, sources);
}

// ── Main Pipeline ────────────────────────────────────

export async function runPipeline(
  eventRecordId: string,
  userId: string,
): Promise<string> {
  // Check settings
  const settings = settingsStore.get(userId);
  if (!settings.enabled) {
    throw new Error("Pipeline is disabled");
  }

  // Check environment
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  // Lock to prevent race condition on concurrent triggers
  if (activeLocks.has(eventRecordId)) {
    const activeRun = pipelineStore.getActiveRun(eventRecordId);
    if (activeRun) return activeRun.id;
    throw new Error("Pipeline trigger is already in progress for this event");
  }

  // Idempotency: return existing active run
  const activeRun = pipelineStore.getActiveRun(eventRecordId);
  if (activeRun) {
    return activeRun.id;
  }

  // Acquire lock
  activeLocks.add(eventRecordId);

  try {
    // Rate limit check
    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) {
      throw new Error(rateCheck.reason);
    }

    // Get the event record
    const record = eventRecordStore.get(eventRecordId);
    if (!record) {
      throw new Error(`Event record not found: ${eventRecordId}`);
    }

    // Create pipeline run with service mode detection
    const now = new Date().toISOString();
    const serviceMode = detectServiceMode();
    const run: PipelineRun = {
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      eventRecordId,
      userId,
      stage: "ingested",
      artifactIds: [],
      createdAt: now,
      updatedAt: now,
      log: [],
      serviceMode,
    };
    pipelineStore.create(run);

    const modeDesc = `Claude: ${serviceMode.claude}, TinyFish: ${serviceMode.tinyfish}`;
    log(run.id, "ingested", `Pipeline started for event: ${record.title} [${modeDesc}]`, {
      service: "system",
      label: getStageLabel("ingested"),
      data: { serviceMode },
    });

    // Run the pipeline stages asynchronously
    executePipelineStages(run.id, record, userId).catch((err) => {
      console.error(`[pipeline:${run.id}] Unhandled error:`, err);
      pipelineStore.update(run.id, {
        stage: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
      log(run.id, "failed", `Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
    });

    return run.id;
  } finally {
    // Release lock after run is created (not after execution)
    activeLocks.delete(eventRecordId);
  }
}

async function executePipelineStages(
  runId: string,
  record: CalendarEventRecord,
  userId: string,
): Promise<void> {
  try {
    // ── Stage 0: Enrich (for minimal events) ──────
    const isMinimal = !record.description && !record.location && (!record.attendees || record.attendees.length === 0);

    if (isMinimal) {
      updateStage(runId, "classifying");
      log(runId, "classifying", `Enriching minimal event: ${record.title}`, {
        service: "claude",
        label: "Claude is understanding this event",
      });

      try {
        const enrichment = await enrichEvent(record, runId);

        // Update the record with enriched data for downstream stages
        if (enrichment.description && !record.description) {
          record = { ...record, description: enrichment.description };
        }

        // Store enrichment context on the run for downstream use
        pipelineStore.update(runId, {
          enrichment: {
            inferredContext: enrichment.inferredContext,
            gatheredContext: enrichment.gatheredContext,
            suggestTinyFish: enrichment.suggestTinyFish,
            tinyFishSuggestion: enrichment.tinyFishSuggestion,
            confidence: enrichment.confidence,
            missingContext: enrichment.missingContext,
          },
        } as Partial<import("./types").PipelineRun>);

        log(runId, "classifying", `Event enriched: ${enrichment.inferredContext.slice(0, 100)}`, {
          service: "claude",
          label: "Event context gathered",
          data: {
            confidence: enrichment.confidence,
            emailsFound: enrichment.gatheredContext.emails.length,
            slackFound: enrichment.gatheredContext.slackMessages.length,
            suggestTinyFish: enrichment.suggestTinyFish,
          },
        });
      } catch (err) {
        // Enrichment failure is non-fatal — continue with classification
        console.error(`[pipeline:${runId}] Enrichment failed (non-fatal):`, err);
        log(runId, "classifying", `Enrichment skipped: ${err instanceof Error ? err.message : String(err)}`, {
          service: "system",
          label: "Continuing without enrichment",
        });
      }
    }

    // ── Stage 1: Classify ──────────────────────────
    updateStage(runId, "classifying");
    log(runId, "classifying", `Classifying event: ${record.title}`, {
      service: "claude",
      label: getStageLabel("classifying"),
    });

    const classification = await classifyEvent(record);

    // Claude call succeeded — confirm service is real
    const currentRun = pipelineStore.get(runId);
    if (currentRun?.serviceMode) {
      pipelineStore.update(runId, {
        serviceMode: { ...currentRun.serviceMode, claude: "real" },
      });
    }

    // Update event record with classification
    eventRecordStore.upsert({
      ...record,
      status: "classified",
      eventType: classification.eventType,
      actionability: classification.actionability,
      confidence: classification.confidence,
      reasoningSummary: classification.reasoning,
      classificationStale: false,
    });

    pipelineStore.update(runId, { classification });
    updateStage(runId, "classified");

    const notActionable = classification.actionability === "not_actionable";
    log(runId, "classified", `Event classified as ${classification.eventType} (${classification.actionability})`, {
      service: "claude",
      label: getStageLabel("classified", { notActionable }),
      data: {
        confidence: classification.confidence,
        urgency: classification.urgency,
        needsTinyFish: classification.needsTinyFish,
      },
    });

    // If not actionable, complete early
    if (notActionable) {
      pipelineStore.update(runId, {
        stage: "completed",
        completedAt: new Date().toISOString(),
      });
      log(runId, "completed", "Event classified as not actionable — no further action needed", {
        service: "system",
        label: "No action needed for this event",
      });
      return;
    }

    // Check if workflow is disabled
    const settings = settingsStore.get(userId);
    if (classification.actionType && settings.disabledWorkflows.includes(classification.actionType)) {
      pipelineStore.update(runId, {
        stage: "completed",
        completedAt: new Date().toISOString(),
      });
      log(runId, "completed", `Workflow ${classification.actionType} is disabled in settings`, {
        service: "system",
        label: "Workflow disabled in settings",
      });
      return;
    }

    // ── Stage 2: Plan ──────────────────────────────
    updateStage(runId, "planning");
    log(runId, "planning", "Generating action plan", {
      service: "claude",
      label: getStageLabel("planning"),
    });

    const integrationContext = getIntegrationContext();
    // Pass enrichment data so the planner can escalate to TinyFish when context is insufficient
    const currentRunForEnrichment = pipelineStore.get(runId);
    const plan = await planActionsAsync(record, classification, integrationContext, settings.approvalMode, currentRunForEnrichment?.enrichment);

    pipelineStore.update(runId, { actionPlan: plan });

    // ── Update TinyFish usage status based on actual plan contents ──
    const hasTinyFishStep = plan.steps.some((s) => s.type === "tinyfish_browse");
    const currentRunForTf = pipelineStore.get(runId);
    if (currentRunForTf?.serviceMode) {
      const tfConfigured = currentRunForTf.serviceMode.tinyfish === "real";
      pipelineStore.update(runId, {
        serviceMode: {
          ...currentRunForTf.serviceMode,
          tinyfishUsage: hasTinyFishStep ? "planned" : "not_planned",
          tinyfishUsageReason: hasTinyFishStep
            ? (tfConfigured ? "TinyFish step planned — will execute with real browser" : "TinyFish step planned — will run in simulated mode (env vars not set)")
            : "No browser work needed for this workflow",
        },
      });
    }

    updateStage(runId, "planned");
    log(runId, "planned", `Plan created: ${plan.workflowType} with ${plan.steps.length} steps`, {
      service: "claude",
      label: getStageLabel("planned"),
      data: {
        workflowType: plan.workflowType,
        stepCount: plan.steps.length,
        requiresTinyFish: plan.requiresTinyFish,
        requiresApproval: plan.requiresApproval,
        missingInputs: plan.missingInputs,
        expectedOutputs: plan.expectedOutputs,
      },
    });

    // Log TinyFish mock warning
    if (plan.requiresTinyFish && !process.env.TINYFISH_API_URL) {
      log(runId, "planned", "TinyFish env vars not set — browser tasks will be simulated", {
        service: "tinyfish",
        label: "TinyFish will run in simulated mode",
      });
    }

    // ── Stage 2b: Approval Gate ────────────────────
    if (plan.requiresApproval) {
      updateStage(runId, "awaiting_approval");
      log(runId, "awaiting_approval", "Plan requires approval before execution. Waiting for user action.", {
        service: "system",
        label: getStageLabel("awaiting_approval"),
        data: {
          reason: plan.requiresTinyFish ? "TinyFish browser automation requires approval" : "User approval mode is set to approve_all",
        },
      });
      // Pipeline pauses here — the /approve endpoint will resume it
      return;
    }

    // ── Stage 2c: Queue ────────────────────────────
    updateStage(runId, "queued");
    log(runId, "queued", "Plan queued for execution", {
      service: "system",
      label: getStageLabel("queued"),
    });

    // ── Stage 3: Execute ───────────────────────────
    await executeAndSynthesize(runId, record, plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pipelineStore.update(runId, {
      stage: "failed",
      error: message,
    });
    eventRecordStore.upsert({
      ...record,
      status: "failed",
    });
    log(runId, "failed", `Pipeline failed: ${message}`, {
      service: "system",
      label: getStageLabel("failed"),
    });
    throw err;
  }
}

// ── Execute + Synthesize (shared by main flow and approval resume) ──

async function executeAndSynthesize(
  runId: string,
  record: CalendarEventRecord,
  plan: import("./types").ActionPlan,
): Promise<void> {
  updateStage(runId, "executing");
  log(runId, "executing", "Executing action plan steps", {
    service: "system",
    label: getStageLabel("executing"),
  });

  const stepOutputs = await executeActionPlan(
    pipelineStore.get(runId)!,
    record,
    plan,
  );

  // ── Stage 4: Synthesize ────────────────────────
  updateStage(runId, "synthesizing");
  log(runId, "synthesizing", `Synthesizing artifact for workflow: ${plan.workflowType}`, {
    service: "synthesizer",
    label: getStageLabel("synthesizing"),
  });

  const artifact = await synthesizeForWorkflow(plan.workflowType, record, runId, stepOutputs);

  // ── Stage 5: Export to Google Docs (if connected) ──
  const userId = "demo-user";
  if (isConnected(userId, "google-docs")) {
    log(runId, "synthesizing", "Exporting to Google Docs via API", {
      service: "integration",
      label: "Creating Google Doc",
    });
    try {
      const { createDocument } = await import("../integrations/google-docs");
      // Map ArtifactType (underscores) to GenerationType (hyphens) for Google Docs
      const typeMap: Record<string, string> = {
        study_guide: "study-guide", meeting_brief: "meeting-notes", notes: "work-notes",
        slide_content: "work-notes", checklist: "prep-summary", action_summary: "prep-summary",
        research_brief: "prep-summary", generic_output: "prep-summary", outline: "work-notes",
      };
      const generatedItem = {
        id: artifact.id,
        userId,
        eventId: record.id,
        type: (typeMap[artifact.type] || "prep-summary") as import("../schema").GenerationType,
        status: "ready" as const,
        title: artifact.title,
        summary: artifact.summary,
        trigger: `Pipeline run ${runId}`,
        sources: artifact.sources,
        confidence: artifact.confidence,
        content: artifact.content,
        createdAt: artifact.createdAt,
      };
      const doc = await createDocument(userId, generatedItem);
      artifact.documentUrl = doc.url;
      artifact.documentId = doc.externalId;
      log(runId, "synthesizing", `Google Doc created: ${doc.url}`, {
        service: "integration",
        label: "Google Doc created",
        data: { documentUrl: doc.url, documentId: doc.externalId },
      });
    } catch (err) {
      // Doc creation failure is non-fatal — artifact still works without it
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[pipeline:${runId}] Google Doc creation failed (non-fatal):`, message);

      // Surface specific failure reason for the user
      let failureReason: string;
      if (message.includes("Not connected")) {
        failureReason = "Google Docs not connected — connect in Integrations to enable automatic doc creation";
      } else if (message.includes("401") || message.includes("403") || message.includes("token")) {
        failureReason = "Google Docs authorization expired — reconnect in Integrations";
      } else if (message.includes("404")) {
        failureReason = "Google Drive folder not found — try reconnecting Google Docs";
      } else {
        failureReason = `Google Doc creation failed: ${message}`;
      }

      log(runId, "synthesizing", `Google Doc not created: ${message}`, {
        service: "integration",
        label: failureReason,
        data: {
          error: message,
          method: "google-docs-api",
          suggestion: "Connect Google Docs in Integrations or check OAuth permissions",
        },
      });
    }
  }

  artifactStore.create(artifact);

  // ── Compute truthful completion status ──────────
  // Check what actually succeeded vs failed in this run
  const completedRun = pipelineStore.get(runId)!;
  const tfUsage = completedRun.serviceMode?.tinyfishUsage;
  const tfFailed = tfUsage === "failed";
  const tfWasPlanned = plan.steps.some((s) => s.type === "tinyfish_browse");
  const stepsWithFailures = plan.steps.filter((s) => s.status === "failed" || s.status === "skipped");
  const hasDocUrl = !!artifact.documentUrl;
  const docWasAttempted = isConnected("demo-user", "google-docs");
  const docFailed = docWasAttempted && !hasDocUrl;

  // Determine final label based on what actually worked
  let completionLabel: string;
  if (stepsWithFailures.length === 0 && hasDocUrl) {
    completionLabel = "Your output is ready — Google Doc created";
  } else if (stepsWithFailures.length === 0 && !docWasAttempted) {
    completionLabel = getStageLabel("completed");
  } else if (tfFailed && docFailed) {
    completionLabel = "Artifact generated (Claude only) — browser actions and Google Doc creation failed";
  } else if (tfFailed) {
    completionLabel = hasDocUrl
      ? "Artifact generated — browser actions failed, Google Doc created"
      : "Artifact generated (Claude only) — browser actions failed";
  } else if (docFailed) {
    completionLabel = tfWasPlanned
      ? "Artifact generated with browser data — Google Doc creation failed"
      : "Artifact generated — Google Doc creation failed";
  } else {
    completionLabel = getStageLabel("completed");
  }

  // Update run with artifact
  pipelineStore.update(runId, {
    artifactIds: [...completedRun.artifactIds, artifact.id],
    stage: "completed",
    completedAt: new Date().toISOString(),
  });

  // Update event record status
  eventRecordStore.upsert({
    ...record,
    status: "completed",
  });

  log(runId, "completed", `Pipeline completed. Artifact created: ${artifact.title}`, {
    service: "system",
    label: completionLabel,
    data: {
      artifactId: artifact.id,
      artifactType: artifact.type,
      confidence: artifact.confidence,
      documentUrl: artifact.documentUrl,
      failedSteps: stepsWithFailures.map((s) => ({ id: s.id, type: s.type, error: s.error })),
      tinyfishUsage: tfUsage,
      googleDocCreated: hasDocUrl,
    },
  });
}

// ── Resume from Approval ─────────────────────────────
// Called by the /approve API route to continue a paused pipeline.

export async function resumePipelineFromApproval(
  runId: string,
  record: CalendarEventRecord,
): Promise<void> {
  const run = pipelineStore.get(runId);
  if (!run || run.stage !== "awaiting_approval") {
    throw new Error(`Cannot resume run ${runId}: not in awaiting_approval stage`);
  }

  if (!run.actionPlan) {
    throw new Error(`Cannot resume run ${runId}: no action plan found`);
  }

  log(runId, "queued", "Approval received. Plan queued for execution.", {
    service: "system",
    label: "Approved — queued for execution",
  });
  updateStage(runId, "queued");

  try {
    await executeAndSynthesize(runId, record, run.actionPlan);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pipelineStore.update(runId, { stage: "failed", error: message });
    eventRecordStore.upsert({ ...record, status: "failed" });
    log(runId, "failed", `Pipeline failed after approval: ${message}`, {
      service: "system",
      label: getStageLabel("failed"),
    });
    throw err;
  }
}
