// ── Pipeline Status Labels ───────────────────────────
// User-facing labels for every pipeline stage and step.
// These are shown in the pipeline drawer and log panel.

import type { PipelineStage, ActionStepType, ServiceName } from "./types";

// ── Stage Labels ────────────────────────────────────

const STAGE_LABELS: Record<PipelineStage, string> = {
  ingested: "Event received",
  classifying: "Omni Cal is analyzing this event",
  classified: "Event analyzed",
  planning: "Claude is figuring out the best workflow",
  planned: "Workflow selected",
  queued: "Queued for execution",
  awaiting_approval: "Waiting for your approval",
  executing: "Running action plan",
  synthesizing: "Turning results into something useful",
  completed: "Your output is ready",
  failed: "Something went wrong",
};

export function getStageLabel(
  stage: PipelineStage,
  context?: { notActionable?: boolean },
): string {
  if (stage === "classified" && context?.notActionable) {
    return "No action needed for this event";
  }
  return STAGE_LABELS[stage] ?? stage;
}

// ── Step Progress Labels ────────────────────────────

export function getStepStartLabel(
  stepType: ActionStepType,
  isReal?: boolean,
): string {
  switch (stepType) {
    case "claude_generate":
      return "Claude is generating content";
    case "tinyfish_browse":
      return isReal ? "TinyFish is working on the live web" : "Simulating web browsing";
    case "integration_fetch":
      return "Gathering context from your apps";
    case "artifact_create":
      return "Creating output artifact";
  }
}

export function getStepCompleteLabel(stepType: ActionStepType): string {
  switch (stepType) {
    case "claude_generate":
      return "Claude finished generating";
    case "tinyfish_browse":
      return "TinyFish returned results";
    case "integration_fetch":
      return "Context gathered";
    case "artifact_create":
      return "Artifact created";
  }
}

export function getStepFailLabel(stepType: ActionStepType): string {
  switch (stepType) {
    case "claude_generate":
      return "Claude encountered an error";
    case "tinyfish_browse":
      return "TinyFish encountered an error";
    case "integration_fetch":
      return "Failed to gather context";
    case "artifact_create":
      return "Failed to create artifact";
  }
}

// ── Service for Step Type ───────────────────────────

export function getServiceForStep(stepType: ActionStepType): ServiceName {
  switch (stepType) {
    case "claude_generate":
      return "claude";
    case "tinyfish_browse":
      return "tinyfish";
    case "integration_fetch":
      return "integration";
    case "artifact_create":
      return "synthesizer";
  }
}

// ── Service Mode Labels ─────────────────────────────

export function getServiceModeLabel(mode: "real" | "mock" | "unavailable"): string {
  switch (mode) {
    case "real":
      return "Live";
    case "mock":
      return "Simulated";
    case "unavailable":
      return "Unavailable";
  }
}
