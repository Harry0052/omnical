// ── Action Planner ───────────────────────────────────
// Deterministic template-based workflow routing.
// Claude classifies; planner routes to templates.
// Each workflow template declares its required/available inputs,
// expected outputs, and whether TinyFish is needed.

import type {
  CalendarEventRecord,
  ClassificationResult,
  ActionPlan,
  ActionStep,
  WorkflowType,
  EventType,
  IntegrationContext,
  ApprovalMode,
  EnrichmentData,
} from "./types";
import { ActionPlanSchema, validateOrThrow } from "./validation";
import {
  generateGenericTaskPlan,
  genericTaskPlanToSteps,
  buildFallbackGenericSteps,
} from "./generic-planner";
import {
  detectMeetingPlatform,
  buildZoomNoteSteps,
} from "./workflows/zoom-notes";
import { buildSlideDeckSteps } from "./workflows/slide-deck";

// ── Step Builder ─────────────────────────────────────

function step(
  id: string,
  type: ActionStep["type"],
  description: string,
  input: Record<string, unknown> = {},
  dependsOn?: string[],
): ActionStep {
  return { id, type, description, input, dependsOn, status: "pending" };
}

// ── Workflow Metadata ────────────────────────────────
// Each workflow declares what it needs and what it produces.

interface WorkflowSpec {
  requiredInputs: string[];
  expectedOutputs: string[];
  estimatedDurationMs: number;
  buildSteps: (record: CalendarEventRecord, needsTinyFish: boolean, context: IntegrationContext, enrichment?: EnrichmentData) => ActionStep[];
}

// ── Template: Study Guide ────────────────────────────

const studyGuideSpec: WorkflowSpec = {
  requiredInputs: ["title", "startAt"],
  expectedOutputs: ["study_guide"],
  estimatedDurationMs: 30_000,
  buildSteps(record, needsTinyFish, context, enrichment) {
    const steps: ActionStep[] = [];
    const hasLinks = !!record.links?.length;
    const isMinimal = !record.description && !record.location && (!record.attendees || record.attendees.length === 0);

    // ── Determine if TinyFish browser work is needed ──
    // Three paths to TinyFish:
    // 1. Event has links and classification says needsTinyFish
    // 2. Enrichment explicitly suggests TinyFish (e.g., school portal access needed)
    // 3. Title-only academic event with no connected context — escalate to browser
    //    to attempt course portal / Canvas / Blackboard scraping
    const enrichmentSuggestsTinyFish = enrichment?.suggestTinyFish === true;
    const contextIsInsufficient = isMinimal
      && (!enrichment || (enrichment.gatheredContext.emails.length === 0 && enrichment.gatheredContext.slackMessages.length === 0))
      && enrichment?.confidence !== undefined && enrichment.confidence < 0.7;

    const shouldUseTinyFish = (hasLinks && needsTinyFish)
      || enrichmentSuggestsTinyFish
      || (isMinimal && contextIsInsufficient);

    if (hasLinks && shouldUseTinyFish) {
      // Path 1: Browse known links
      steps.push(step("fetch-materials", "tinyfish_browse", "Browse course pages and extract study materials", {
        urls: record.links,
        instructions: `Extract study materials, syllabus content, key topics, and any linked resources from these pages related to: ${record.title}`,
      }));
    } else if (shouldUseTinyFish && !hasLinks) {
      // Path 2/3: No links but TinyFish is needed — search for course materials via browser
      const portalInstructions = enrichment?.tinyFishSuggestion
        ?? `Search for course materials, syllabus, and study resources for: ${record.title}. Try common academic portals (Canvas, Blackboard, university sites). Extract key topics, study guides, and exam preparation materials.`;
      steps.push(step("browse-course-portal", "tinyfish_browse", "Search course portals for study materials via browser", {
        urls: ["https://www.google.com"],
        instructions: portalInstructions,
      }));
    }

    if (context.gmailConnected) {
      steps.push(step("fetch-email-context", "integration_fetch", "Search email for related course materials", {
        type: "gmail",
        query: record.title,
        attendees: record.attendees,
      }));
    }

    const priorStepIds = steps.map((s) => s.id);
    steps.push(step("generate-guide", "claude_generate", "Generate comprehensive study guide", {
      prompt: "study_guide",
      eventTitle: record.title,
      eventDescription: record.description,
    }, priorStepIds.length > 0 ? priorStepIds : undefined));

    steps.push(step("create-artifact", "artifact_create", "Create study guide artifact", {
      artifactType: "study_guide",
    }, ["generate-guide"]));

    return steps;
  },
};

// ── Template: Meeting Research Brief ─────────────────

const meetingResearchSpec: WorkflowSpec = {
  requiredInputs: ["title", "startAt"],
  expectedOutputs: ["meeting_brief"],
  estimatedDurationMs: 20_000,
  buildSteps(record, needsTinyFish, context) {
    const steps: ActionStep[] = [];

    if (context.gmailConnected) {
      steps.push(step("fetch-email-context", "integration_fetch", "Search email for meeting context and prior threads", {
        type: "gmail",
        query: record.title,
        attendees: record.attendees,
      }));
    }

    if (context.slackConnected) {
      steps.push(step("fetch-slack-context", "integration_fetch", "Search Slack for relevant discussions", {
        type: "slack",
        query: record.title,
      }));
    }

    if (record.links?.length && needsTinyFish) {
      steps.push(step("browse-context", "tinyfish_browse", "Browse linked pages for meeting context", {
        urls: record.links,
        instructions: `Gather context for meeting: ${record.title}. Extract agendas, shared documents, relevant information about attendees or topics.`,
      }));
    }

    const priorStepIds = steps.map((s) => s.id);
    steps.push(step("generate-brief", "claude_generate", "Generate meeting research brief", {
      prompt: "meeting_brief",
      eventTitle: record.title,
      eventDescription: record.description,
      attendees: record.attendees,
    }, priorStepIds.length > 0 ? priorStepIds : undefined));

    steps.push(step("create-artifact", "artifact_create", "Create meeting brief artifact", {
      artifactType: "meeting_brief",
    }, ["generate-brief"]));

    return steps;
  },
};

// ── Template: Zoom Note Capture ──────────────────────

const zoomNoteSpec: WorkflowSpec = {
  requiredInputs: ["title", "startAt"],
  expectedOutputs: ["notes"],
  estimatedDurationMs: 15_000,
  buildSteps(record, _needsTinyFish, context) {
    const meetingLink = detectMeetingPlatform(
      record.title, record.description, record.location, record.links,
    );
    return buildZoomNoteSteps(record, meetingLink, context);
  },
};

// ── Template: Slide Deck Generation ──────────────────

const slideDeckSpec: WorkflowSpec = {
  requiredInputs: ["title", "startAt"],
  expectedOutputs: ["slide_content"],
  estimatedDurationMs: 25_000,
  buildSteps(record, needsTinyFish, context) {
    return buildSlideDeckSteps(record, needsTinyFish, context);
  },
};

// ── Template: Registration / RSVP ────────────────────

const registrationSpec: WorkflowSpec = {
  requiredInputs: ["title", "startAt"],
  expectedOutputs: ["action_summary"],
  estimatedDurationMs: 20_000,
  buildSteps(record) {
    const steps: ActionStep[] = [];

    if (record.links?.length) {
      steps.push(step("browse-registration", "tinyfish_browse", "Navigate registration page and gather form details", {
        urls: record.links,
        instructions: `Navigate to the registration/RSVP page for: ${record.title}. Extract form fields, deadlines, and requirements. If possible, complete the registration.`,
      }));
    }

    steps.push(step("generate-summary", "claude_generate", "Generate registration summary and checklist", {
      prompt: "action_summary",
      eventTitle: record.title,
      eventDescription: record.description,
    }, steps.length > 0 ? [steps[0].id] : undefined));

    steps.push(step("create-artifact", "artifact_create", "Create action summary artifact", {
      artifactType: "action_summary",
    }, ["generate-summary"]));

    return steps;
  },
};

// ── Template: Logistics Booking ──────────────────────

const logisticsSpec: WorkflowSpec = {
  requiredInputs: ["title", "startAt", "location"],
  expectedOutputs: ["checklist"],
  estimatedDurationMs: 15_000,
  buildSteps(record, needsTinyFish) {
    const steps: ActionStep[] = [];

    if (needsTinyFish && record.location) {
      steps.push(step("research-logistics", "tinyfish_browse", "Research travel and logistics options", {
        urls: record.links ?? [],
        instructions: `Research logistics for: ${record.title} at ${record.location}. Find directions, parking, nearby amenities, and travel options.`,
      }));
    }

    steps.push(step("generate-checklist", "claude_generate", "Generate logistics checklist", {
      prompt: "checklist",
      eventTitle: record.title,
      eventDescription: record.description,
      location: record.location,
    }, steps.length > 0 ? [steps[0].id] : undefined));

    steps.push(step("create-artifact", "artifact_create", "Create logistics checklist artifact", {
      artifactType: "checklist",
    }, ["generate-checklist"]));

    return steps;
  },
};

// ── Template: Task Prep Bundle ───────────────────────

const taskPrepSpec: WorkflowSpec = {
  requiredInputs: ["title", "startAt"],
  expectedOutputs: ["research_brief"],
  estimatedDurationMs: 25_000,
  buildSteps(record, needsTinyFish, context) {
    const steps: ActionStep[] = [];

    if (context.gmailConnected) {
      steps.push(step("fetch-email-context", "integration_fetch", "Search email for relevant context", {
        type: "gmail",
        query: record.title,
        attendees: record.attendees,
      }));
    }

    if (context.slackConnected) {
      steps.push(step("fetch-slack-context", "integration_fetch", "Search Slack for relevant context", {
        type: "slack",
        query: record.title,
      }));
    }

    if (record.links?.length && needsTinyFish) {
      steps.push(step("browse-resources", "tinyfish_browse", "Browse linked resources for preparation", {
        urls: record.links,
        instructions: `Gather preparation materials for: ${record.title}. Extract key information, requirements, and context.`,
      }));
    }

    const priorStepIds = steps.map((s) => s.id);
    steps.push(step("generate-bundle", "claude_generate", "Generate comprehensive prep bundle", {
      prompt: "prep_bundle",
      eventTitle: record.title,
      eventDescription: record.description,
      attendees: record.attendees,
    }, priorStepIds.length > 0 ? priorStepIds : undefined));

    steps.push(step("create-artifact", "artifact_create", "Create preparation bundle artifact", {
      artifactType: "research_brief",
    }, ["generate-bundle"]));

    return steps;
  },
};

// ── Template: Generic Agent Task ─────────────────────
// Uses Claude to define the plan dynamically.
// Fallback steps are used if Claude planning fails.

const genericAgentSpec: WorkflowSpec = {
  requiredInputs: ["title", "startAt"],
  expectedOutputs: ["generic_output"],
  estimatedDurationMs: 35_000,
  buildSteps(record, needsTinyFish, context) {
    // This is a placeholder — the real steps are built dynamically
    // by planActions() calling generateGenericTaskPlan().
    // These fallback steps are used if that call fails.
    return buildFallbackGenericSteps(
      record,
      {
        eventType: "other",
        actionability: "actionable",
        urgency: "medium",
        actionType: "generic_agent_task",
        needsTinyFish,
        confidence: 0.5,
        reasoning: "Generic fallback",
        missingInputs: [],
        canRunNow: true,
        recommendedExecutionTime: "before_event",
      },
      context,
    );
  },
};

// ── Workflow Registry ────────────────────────────────
// Add new workflows here — no other code changes needed.

const WORKFLOW_REGISTRY: Record<WorkflowType, WorkflowSpec> = {
  study_guide_generation: studyGuideSpec,
  meeting_research_brief: meetingResearchSpec,
  zoom_note_capture: zoomNoteSpec,
  slide_deck_generation: slideDeckSpec,
  registration_or_rsvp: registrationSpec,
  logistics_booking: logisticsSpec,
  task_prep_bundle: taskPrepSpec,
  generic_agent_task: genericAgentSpec,
};

// ── Event Type → Workflow Routing ────────────────────

const EVENT_TYPE_TO_WORKFLOW: Record<EventType, WorkflowType> = {
  study: "study_guide_generation",
  class: "study_guide_generation",
  meeting: "meeting_research_brief",
  interview: "task_prep_bundle",
  presentation: "slide_deck_generation",
  travel: "logistics_booking",
  social: "meeting_research_brief",
  admin: "task_prep_bundle",
  other: "task_prep_bundle",
};

// Fallback workflow when routing can't determine type
const FALLBACK_WORKFLOW: WorkflowType = "task_prep_bundle";

// ── Input Analysis ───────────────────────────────────

function analyzeInputs(
  record: CalendarEventRecord,
  spec: WorkflowSpec,
): { available: string[]; missing: string[] } {
  const available: string[] = [];
  const missing: string[] = [];

  for (const input of spec.requiredInputs) {
    const value = record[input as keyof CalendarEventRecord];
    if (value !== undefined && value !== null && value !== "") {
      available.push(input);
    } else {
      missing.push(input);
    }
  }

  // Check bonus inputs
  if (record.description) available.push("description");
  if (record.location) available.push("location");
  if (record.attendees?.length) available.push("attendees");
  if (record.links?.length) available.push("links");

  return { available, missing };
}

// ── Approval Logic ───────────────────────────────────

export function shouldRequireApproval(
  plan: { requiresTinyFish: boolean },
  approvalMode: ApprovalMode,
): boolean {
  switch (approvalMode) {
    case "auto":
      return false;
    case "approve_all":
      return true;
    case "approve_tinyfish_only":
      return plan.requiresTinyFish;
  }
}

// ── Workflow Resolver ────────────────────────────────

// Confidence threshold: below this, classification's actionType is not trusted
// and we check whether the event type mapping is strong enough.
const TEMPLATE_CONFIDENCE_THRESHOLD = 0.6;

export function resolveWorkflowType(
  classification: ClassificationResult,
): WorkflowType {
  // If Claude explicitly recommended generic_agent_task, use it
  if (classification.actionType === "generic_agent_task") {
    return "generic_agent_task";
  }

  // Prefer Claude's explicit recommendation if confidence is high enough
  if (
    classification.actionType
    && classification.actionType in WORKFLOW_REGISTRY
    && classification.confidence >= TEMPLATE_CONFIDENCE_THRESHOLD
  ) {
    return classification.actionType;
  }

  // Fall back to event type mapping for known types
  const mapped = EVENT_TYPE_TO_WORKFLOW[classification.eventType];
  if (mapped && mapped in WORKFLOW_REGISTRY && classification.eventType !== "other") {
    return mapped;
  }

  // If event type is "other" or confidence is low, use generic agent
  if (
    classification.eventType === "other"
    || classification.confidence < TEMPLATE_CONFIDENCE_THRESHOLD
  ) {
    return "generic_agent_task";
  }

  // Final fallback
  return FALLBACK_WORKFLOW;
}

// ── Public API ───────────────────────────────────────

export function planActions(
  record: CalendarEventRecord,
  classification: ClassificationResult,
  context: IntegrationContext,
  approvalMode: ApprovalMode = "auto",
  enrichment?: EnrichmentData,
): ActionPlan {
  const workflowType = resolveWorkflowType(classification);
  const spec = WORKFLOW_REGISTRY[workflowType];

  // Build steps from template — pass enrichment so templates can escalate to TinyFish
  const steps = spec.buildSteps(record, classification.needsTinyFish, context, enrichment);

  // Analyze inputs
  const { available, missing } = analyzeInputs(record, spec);

  // Also include missing inputs from classification
  const allMissing = [...new Set([...missing, ...classification.missingInputs])];

  // Determine requiresTinyFish from actual plan steps, not just classification
  const planActuallyRequiresTinyFish = steps.some((s) => s.type === "tinyfish_browse");

  const plan: ActionPlan = {
    workflowType,
    steps,
    estimatedDurationMs: spec.estimatedDurationMs,
    requiresApproval: shouldRequireApproval(
      { requiresTinyFish: planActuallyRequiresTinyFish },
      approvalMode,
    ),
    requiresTinyFish: planActuallyRequiresTinyFish,
    requiredInputs: spec.requiredInputs,
    availableInputs: available,
    missingInputs: allMissing,
    expectedOutputs: spec.expectedOutputs,
  };

  // Validate the plan
  return validateOrThrow(ActionPlanSchema, plan);
}

// ── Async Plan (for generic workflows using Claude) ──

export async function planActionsAsync(
  record: CalendarEventRecord,
  classification: ClassificationResult,
  context: IntegrationContext,
  approvalMode: ApprovalMode = "auto",
  enrichment?: EnrichmentData,
): Promise<ActionPlan> {
  const workflowType = resolveWorkflowType(classification);

  // For non-generic workflows, use the synchronous template planner
  if (workflowType !== "generic_agent_task") {
    return planActions(record, classification, context, approvalMode, enrichment);
  }

  // For generic workflows, ask Claude to define the plan
  const spec = WORKFLOW_REGISTRY[workflowType];
  let steps: ActionStep[];

  try {
    const genericPlan = await generateGenericTaskPlan(record, classification, context);
    steps = genericTaskPlanToSteps(genericPlan, context);
  } catch (err) {
    console.error("Generic task planning via Claude failed, using fallback:", err);
    steps = buildFallbackGenericSteps(record, classification, context);
  }

  const { available, missing } = analyzeInputs(record, spec);
  const allMissing = [...new Set([...missing, ...classification.missingInputs])];

  const planActuallyRequiresTinyFish = steps.some((s) => s.type === "tinyfish_browse");

  const plan: ActionPlan = {
    workflowType: "generic_agent_task",
    steps,
    estimatedDurationMs: spec.estimatedDurationMs,
    requiresApproval: shouldRequireApproval(
      { requiresTinyFish: planActuallyRequiresTinyFish },
      approvalMode,
    ),
    requiresTinyFish: planActuallyRequiresTinyFish,
    requiredInputs: spec.requiredInputs,
    availableInputs: available,
    missingInputs: allMissing,
    expectedOutputs: spec.expectedOutputs,
  };

  return validateOrThrow(ActionPlanSchema, plan);
}

// ── Exports for testing ──────────────────────────────

export { WORKFLOW_REGISTRY, EVENT_TYPE_TO_WORKFLOW, FALLBACK_WORKFLOW };
