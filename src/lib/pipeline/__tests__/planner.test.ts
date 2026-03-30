import { describe, it, expect } from "vitest";
import {
  planActions,
  shouldRequireApproval,
  resolveWorkflowType,
  WORKFLOW_REGISTRY,
  EVENT_TYPE_TO_WORKFLOW,
  FALLBACK_WORKFLOW,
} from "../planner";
import type {
  CalendarEventRecord,
  ClassificationResult,
  IntegrationContext,
  WorkflowType,
  EventType,
} from "../types";

// ── Fixtures ─────────────────────────────────────────

function makeRecord(overrides: Partial<CalendarEventRecord> = {}): CalendarEventRecord {
  const now = new Date().toISOString();
  return {
    id: "rec-test",
    source: "manual",
    title: "Test Event",
    startAt: "2026-04-01T09:00:00",
    endAt: "2026-04-01T10:00:00",
    timezone: "America/Chicago",
    status: "classified",
    actionability: "actionable",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    eventType: "meeting",
    actionability: "actionable",
    urgency: "medium",
    actionType: "meeting_research_brief",
    needsTinyFish: false,
    confidence: 0.9,
    reasoning: "Work meeting.",
    missingInputs: [],
    canRunNow: true,
    recommendedExecutionTime: "before_event",
    ...overrides,
  };
}

const defaultContext: IntegrationContext = {
  googleCalendarConnected: false,
  gmailConnected: true,
  slackConnected: true,
  googleDocsConnected: false,
};

const noIntegrations: IntegrationContext = {
  googleCalendarConnected: false,
  gmailConnected: false,
  slackConnected: false,
  googleDocsConnected: false,
};

// ── Workflow Routing ─────────────────────────────────

describe("resolveWorkflowType", () => {
  it("uses classification actionType when provided", () => {
    const result = resolveWorkflowType(makeClassification({
      actionType: "slide_deck_generation",
    }));
    expect(result).toBe("slide_deck_generation");
  });

  it("falls back to eventType mapping when actionType is null", () => {
    const result = resolveWorkflowType(makeClassification({
      actionType: null,
      eventType: "study",
    }));
    expect(result).toBe("study_guide_generation");
  });

  it("maps all event types to valid workflows", () => {
    const eventTypes: EventType[] = [
      "study", "meeting", "interview", "class", "presentation",
      "travel", "social", "admin", "other",
    ];
    for (const et of eventTypes) {
      const wf = EVENT_TYPE_TO_WORKFLOW[et];
      expect(wf).toBeDefined();
      expect(WORKFLOW_REGISTRY[wf]).toBeDefined();
    }
  });

  it("returns generic_agent_task for 'other' event type with no actionType", () => {
    const result = resolveWorkflowType(makeClassification({
      actionType: null,
      eventType: "other",
    }));
    expect(result).toBe("generic_agent_task");
  });
});

// ── Actionable Event Routing ─────────────────────────

describe("actionable event routing", () => {
  it("routes study event to study_guide_generation with correct steps", () => {
    const plan = planActions(
      makeRecord({ title: "Biology Midterm" }),
      makeClassification({ eventType: "study", actionType: "study_guide_generation" }),
      defaultContext,
    );
    expect(plan.workflowType).toBe("study_guide_generation");
    expect(plan.expectedOutputs).toContain("study_guide");
    expect(plan.steps.some((s) => s.input.prompt === "study_guide")).toBe(true);
    expect(plan.steps.some((s) => s.type === "artifact_create")).toBe(true);
  });

  it("routes meeting event to meeting_research_brief", () => {
    const plan = planActions(
      makeRecord({ title: "Team sync with Acme", attendees: ["alice@acme.com"] }),
      makeClassification({ eventType: "meeting", actionType: "meeting_research_brief" }),
      defaultContext,
    );
    expect(plan.workflowType).toBe("meeting_research_brief");
    expect(plan.expectedOutputs).toContain("meeting_brief");
  });

  it("routes presentation event to slide_deck_generation", () => {
    const plan = planActions(
      makeRecord({ title: "Present final deck Friday" }),
      makeClassification({ eventType: "presentation", actionType: "slide_deck_generation" }),
      defaultContext,
    );
    expect(plan.workflowType).toBe("slide_deck_generation");
    expect(plan.expectedOutputs).toContain("slide_content");
  });

  it("routes travel event to logistics_booking", () => {
    const plan = planActions(
      makeRecord({ title: "Flight to NYC", location: "JFK Airport" }),
      makeClassification({ eventType: "travel", actionType: "logistics_booking" }),
      defaultContext,
    );
    expect(plan.workflowType).toBe("logistics_booking");
    expect(plan.expectedOutputs).toContain("checklist");
  });

  it("routes interview event to task_prep_bundle", () => {
    const plan = planActions(
      makeRecord({ title: "Phone screen with Google" }),
      makeClassification({ eventType: "interview", actionType: "task_prep_bundle" }),
      defaultContext,
    );
    expect(plan.workflowType).toBe("task_prep_bundle");
    expect(plan.expectedOutputs).toContain("research_brief");
  });

  it("routes zoom event to zoom_note_capture", () => {
    const plan = planActions(
      makeRecord({ title: "Zoom lecture" }),
      makeClassification({ eventType: "class", actionType: "zoom_note_capture" }),
      defaultContext,
    );
    expect(plan.workflowType).toBe("zoom_note_capture");
    expect(plan.expectedOutputs).toContain("notes");
  });

  it("routes registration event correctly", () => {
    const plan = planActions(
      makeRecord({ title: "Conference RSVP", links: ["https://conf.example.com/register"] }),
      makeClassification({ eventType: "admin", actionType: "registration_or_rsvp", needsTinyFish: true }),
      defaultContext,
    );
    expect(plan.workflowType).toBe("registration_or_rsvp");
    expect(plan.expectedOutputs).toContain("action_summary");
    expect(plan.requiresTinyFish).toBe(true);
  });
});

// ── Plan Structure ───────────────────────────────────

describe("plan structure and validation", () => {
  it("always includes at least one step", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification(),
      noIntegrations,
    );
    expect(plan.steps.length).toBeGreaterThanOrEqual(1);
  });

  it("always ends with an artifact_create step", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification(),
      defaultContext,
    );
    const lastStep = plan.steps[plan.steps.length - 1];
    expect(lastStep.type).toBe("artifact_create");
  });

  it("all steps have unique IDs", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification(),
      defaultContext,
    );
    const ids = plan.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all steps start in pending status", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification(),
      defaultContext,
    );
    for (const step of plan.steps) {
      expect(step.status).toBe("pending");
    }
  });

  it("declares required and available inputs", () => {
    const plan = planActions(
      makeRecord({ title: "Test", description: "Some desc", attendees: ["a@b.com"] }),
      makeClassification(),
      defaultContext,
    );
    expect(plan.requiredInputs).toBeDefined();
    expect(plan.availableInputs).toBeDefined();
    expect(plan.availableInputs).toContain("title");
    expect(plan.availableInputs).toContain("description");
    expect(plan.availableInputs).toContain("attendees");
  });

  it("declares expected outputs", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification(),
      defaultContext,
    );
    expect(plan.expectedOutputs.length).toBeGreaterThan(0);
  });

  it("has positive estimatedDurationMs", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification(),
      defaultContext,
    );
    expect(plan.estimatedDurationMs).toBeGreaterThan(0);
  });

  it("passes Zod validation", () => {
    // planActions calls validateOrThrow internally — if it returns, it passed
    const plan = planActions(
      makeRecord(),
      makeClassification(),
      defaultContext,
    );
    expect(plan.workflowType).toBeDefined();
  });
});

// ── TinyFish Steps ───────────────────────────────────

describe("TinyFish step inclusion", () => {
  it("includes tinyfish_browse steps when needsTinyFish and links present", () => {
    const plan = planActions(
      makeRecord({ links: ["https://portal.edu/course"] }),
      makeClassification({ needsTinyFish: true, actionType: "study_guide_generation" }),
      defaultContext,
    );
    const tfSteps = plan.steps.filter((s) => s.type === "tinyfish_browse");
    expect(tfSteps.length).toBeGreaterThan(0);
    expect(plan.requiresTinyFish).toBe(true);
  });

  it("omits tinyfish_browse steps when needsTinyFish is false", () => {
    const plan = planActions(
      makeRecord({ links: ["https://portal.edu/course"] }),
      makeClassification({ needsTinyFish: false, actionType: "study_guide_generation" }),
      defaultContext,
    );
    const tfSteps = plan.steps.filter((s) => s.type === "tinyfish_browse");
    expect(tfSteps.length).toBe(0);
    expect(plan.requiresTinyFish).toBe(false);
  });

  it("omits tinyfish_browse steps when no links present even if needsTinyFish", () => {
    const plan = planActions(
      makeRecord({ links: undefined }),
      makeClassification({ needsTinyFish: true, actionType: "study_guide_generation" }),
      defaultContext,
    );
    const tfSteps = plan.steps.filter((s) => s.type === "tinyfish_browse");
    expect(tfSteps.length).toBe(0);
  });
});

// ── Integration Context ──────────────────────────────

describe("integration context awareness", () => {
  it("includes gmail fetch step when gmail is connected", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification({ actionType: "meeting_research_brief" }),
      { ...noIntegrations, gmailConnected: true },
    );
    const gmailSteps = plan.steps.filter(
      (s) => s.type === "integration_fetch" && (s.input.type === "gmail")
    );
    expect(gmailSteps.length).toBe(1);
  });

  it("omits gmail fetch step when gmail is not connected", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification({ actionType: "meeting_research_brief" }),
      noIntegrations,
    );
    const gmailSteps = plan.steps.filter(
      (s) => s.type === "integration_fetch" && (s.input.type === "gmail")
    );
    expect(gmailSteps.length).toBe(0);
  });

  it("includes slack fetch step when slack is connected", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification({ actionType: "meeting_research_brief" }),
      { ...noIntegrations, slackConnected: true },
    );
    const slackSteps = plan.steps.filter(
      (s) => s.type === "integration_fetch" && (s.input.type === "slack")
    );
    expect(slackSteps.length).toBe(1);
  });

  it("still produces a valid plan with zero integrations", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification(),
      noIntegrations,
    );
    // Should still have claude_generate and artifact_create at minimum
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    expect(plan.steps.some((s) => s.type === "claude_generate")).toBe(true);
    expect(plan.steps.some((s) => s.type === "artifact_create")).toBe(true);
  });
});

// ── Approval Mode ────────────────────────────────────

describe("approval mode", () => {
  it("auto mode: never requires approval", () => {
    expect(shouldRequireApproval({ requiresTinyFish: false }, "auto")).toBe(false);
    expect(shouldRequireApproval({ requiresTinyFish: true }, "auto")).toBe(false);
  });

  it("approve_all mode: always requires approval", () => {
    expect(shouldRequireApproval({ requiresTinyFish: false }, "approve_all")).toBe(true);
    expect(shouldRequireApproval({ requiresTinyFish: true }, "approve_all")).toBe(true);
  });

  it("approve_tinyfish_only mode: requires approval only for TinyFish", () => {
    expect(shouldRequireApproval({ requiresTinyFish: false }, "approve_tinyfish_only")).toBe(false);
    expect(shouldRequireApproval({ requiresTinyFish: true }, "approve_tinyfish_only")).toBe(true);
  });

  it("plan.requiresApproval reflects approval mode (auto)", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification({ needsTinyFish: true }),
      defaultContext,
      "auto",
    );
    expect(plan.requiresApproval).toBe(false);
  });

  it("plan.requiresApproval reflects approval mode (approve_tinyfish_only) — only when TinyFish step is actually in plan", () => {
    // With links + needsTinyFish: plan includes a TinyFish step, so approval is required
    const planWithLinks = planActions(
      makeRecord({ links: ["https://example.com/syllabus"] }),
      makeClassification({ needsTinyFish: true }),
      defaultContext,
      "approve_tinyfish_only",
    );
    expect(planWithLinks.requiresApproval).toBe(true);
    expect(planWithLinks.requiresTinyFish).toBe(true);

    // Without links + needsTinyFish: no TinyFish step in plan, so no approval needed
    const planWithoutLinks = planActions(
      makeRecord(),
      makeClassification({ needsTinyFish: true }),
      defaultContext,
      "approve_tinyfish_only",
    );
    expect(planWithoutLinks.requiresApproval).toBe(false);
    expect(planWithoutLinks.requiresTinyFish).toBe(false);
  });

  it("plan.requiresApproval is false when no TinyFish in approve_tinyfish_only", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification({ needsTinyFish: false }),
      defaultContext,
      "approve_tinyfish_only",
    );
    expect(plan.requiresApproval).toBe(false);
  });
});

// ── Immediate vs Deferred Execution ──────────────────

describe("immediate execution mode", () => {
  it("plans that don't require approval can execute immediately", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification({ needsTinyFish: false }),
      defaultContext,
      "auto",
    );
    expect(plan.requiresApproval).toBe(false);
    // All steps should be pending (ready for immediate execution)
    expect(plan.steps.every((s) => s.status === "pending")).toBe(true);
  });
});

// ── Missing Input Handling ───────────────────────────

describe("missing required input handling", () => {
  it("detects missing location for logistics workflow", () => {
    const plan = planActions(
      makeRecord({ title: "Trip", location: undefined }),
      makeClassification({ actionType: "logistics_booking" }),
      defaultContext,
    );
    expect(plan.missingInputs).toContain("location");
  });

  it("reports no missing inputs when all required fields present", () => {
    const plan = planActions(
      makeRecord({ title: "Meeting", location: "Room 5" }),
      makeClassification({ actionType: "meeting_research_brief" }),
      defaultContext,
    );
    // meeting_research_brief requires title and startAt — both present
    const reqMissing = plan.missingInputs.filter(
      (m) => plan.requiredInputs.includes(m)
    );
    expect(reqMissing.length).toBe(0);
  });

  it("merges missingInputs from classification into plan", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification({ missingInputs: ["meeting agenda", "attendee roles"] }),
      defaultContext,
    );
    expect(plan.missingInputs).toContain("meeting agenda");
    expect(plan.missingInputs).toContain("attendee roles");
  });

  it("deduplicates missing inputs", () => {
    const plan = planActions(
      makeRecord({ location: undefined }),
      makeClassification({
        actionType: "logistics_booking",
        missingInputs: ["location"],
      }),
      defaultContext,
    );
    const locationCount = plan.missingInputs.filter((m) => m === "location").length;
    expect(locationCount).toBe(1);
  });
});

// ── Unsupported Workflow Fallback ────────────────────

describe("unsupported workflow fallback", () => {
  it("falls back to generic_agent_task for unknown event types", () => {
    const result = resolveWorkflowType(makeClassification({
      actionType: null,
      eventType: "other",
    }));
    expect(result).toBe("generic_agent_task");
  });

  it("all registered workflows produce valid plans", () => {
    const workflowTypes = Object.keys(WORKFLOW_REGISTRY) as WorkflowType[];
    for (const wf of workflowTypes) {
      const plan = planActions(
        makeRecord({ links: ["https://example.com"], location: "Somewhere" }),
        makeClassification({ actionType: wf, needsTinyFish: true }),
        defaultContext,
      );
      expect(plan.workflowType).toBe(wf);
      expect(plan.steps.length).toBeGreaterThanOrEqual(1);
      expect(plan.expectedOutputs.length).toBeGreaterThan(0);
    }
  });
});

// ── Registry Extensibility ───────────────────────────

describe("workflow registry", () => {
  it("has exactly 8 registered workflows", () => {
    expect(Object.keys(WORKFLOW_REGISTRY)).toHaveLength(8);
  });

  it("every workflow in the registry has a valid spec", () => {
    for (const [name, spec] of Object.entries(WORKFLOW_REGISTRY)) {
      expect(spec.requiredInputs).toBeDefined();
      expect(spec.expectedOutputs).toBeDefined();
      expect(spec.estimatedDurationMs).toBeGreaterThan(0);
      expect(typeof spec.buildSteps).toBe("function");
    }
  });
});
