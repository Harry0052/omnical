import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import {
  planActions,
  planActionsAsync,
  resolveWorkflowType,
  shouldRequireApproval,
  WORKFLOW_REGISTRY,
} from "../planner";
import {
  genericTaskPlanToSteps,
  buildFallbackGenericSteps,
  setGenericPlannerClient,
} from "../generic-planner";
import { eventRecordStore, pipelineStore, artifactStore } from "../index";
import { MemoryEventRecordStore, MemoryPipelineStore, MemoryArtifactStore } from "../store";
import type {
  CalendarEventRecord,
  ClassificationResult,
  IntegrationContext,
  GenericTaskPlan,
  PipelineRun,
  Artifact,
} from "../types";

// ── Reset helpers ────────────────────────────────────

function resetStores() {
  const freshEvent = new MemoryEventRecordStore();
  Object.assign(eventRecordStore, {
    upsert: freshEvent.upsert.bind(freshEvent),
    get: freshEvent.get.bind(freshEvent),
    getByExternalId: freshEvent.getByExternalId.bind(freshEvent),
    list: freshEvent.list.bind(freshEvent),
    markStale: freshEvent.markStale.bind(freshEvent),
  });

  const freshPipeline = new MemoryPipelineStore();
  Object.assign(pipelineStore, {
    create: freshPipeline.create.bind(freshPipeline),
    get: freshPipeline.get.bind(freshPipeline),
    update: freshPipeline.update.bind(freshPipeline),
    listForEvent: freshPipeline.listForEvent.bind(freshPipeline),
    listForUser: freshPipeline.listForUser.bind(freshPipeline),
    appendLog: freshPipeline.appendLog.bind(freshPipeline),
    getActiveRun: freshPipeline.getActiveRun.bind(freshPipeline),
    hasActiveRun: freshPipeline.hasActiveRun.bind(freshPipeline),
  });

  const freshArtifact = new MemoryArtifactStore();
  Object.assign(artifactStore, {
    create: freshArtifact.create.bind(freshArtifact),
    get: freshArtifact.get.bind(freshArtifact),
    listForEvent: freshArtifact.listForEvent.bind(freshArtifact),
    listAll: freshArtifact.listAll.bind(freshArtifact),
    markStaleForEvent: freshArtifact.markStaleForEvent.bind(freshArtifact),
  });
}

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
    eventType: "other",
    actionability: "actionable",
    urgency: "medium",
    actionType: null,
    needsWebResearch: false,
    confidence: 0.7,
    reasoning: "Unusual event requiring custom preparation.",
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

function makeGenericTaskPlan(overrides: Partial<GenericTaskPlan> = {}): GenericTaskPlan {
  return {
    objective: {
      summary: "Prepare materials for the event",
      successCriteria: ["Useful preparation document created"],
      fallbackBehavior: "Generate a general preparation checklist",
    },
    eventContext: {
      title: "Test Event",
      timeUntilEvent: "24 hours",
    },
    requiredInputs: ["title"],
    requiresWebResearch: false,
    executionSteps: [
      { order: 0, description: "Gather context", type: "gather_context", input: {} },
      { order: 1, description: "Generate content", type: "generate_content", input: {} },
      { order: 2, description: "Create artifact", type: "create_artifact", input: {} },
    ],
    expectedOutputs: ["preparation_document"],
    ...overrides,
  };
}

function createMockClient(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: responseText }],
        model: "claude-sonnet-4-20250514",
      }),
    },
  } as unknown as import("@anthropic-ai/sdk").default;
}

// ── Test: Event matches a known template ─────────────

describe("event matching known template", () => {
  it("routes study event to study_guide_generation template", () => {
    const wf = resolveWorkflowType(makeClassification({
      eventType: "study",
      actionType: "study_guide_generation",
      confidence: 0.95,
    }));
    expect(wf).toBe("study_guide_generation");
  });

  it("routes meeting event to meeting_research_brief template", () => {
    const wf = resolveWorkflowType(makeClassification({
      eventType: "meeting",
      actionType: "meeting_research_brief",
      confidence: 0.9,
    }));
    expect(wf).toBe("meeting_research_brief");
  });

  it("template plans use the template spec, not Claude", () => {
    const plan = planActions(
      makeRecord({ title: "Biology Midterm" }),
      makeClassification({
        eventType: "study",
        actionType: "study_guide_generation",
        confidence: 0.95,
      }),
      defaultContext,
    );
    expect(plan.workflowType).toBe("study_guide_generation");
    expect(plan.expectedOutputs).toContain("study_guide");
    // Should have template-specific steps, not generic ones
    expect(plan.steps.some((s) => s.input.prompt === "study_guide")).toBe(true);
  });
});

// ── Test: Event does NOT match a known template ──────

describe("event not matching known template", () => {
  it("routes 'other' event type to generic_agent_task", () => {
    const wf = resolveWorkflowType(makeClassification({
      eventType: "other",
      actionType: null,
      confidence: 0.7,
    }));
    expect(wf).toBe("generic_agent_task");
  });

  it("routes low-confidence actionType but known eventType to the eventType template", () => {
    // Low confidence on actionType skips it, but "meeting" eventType still maps to its template
    const wf = resolveWorkflowType(makeClassification({
      eventType: "meeting",
      actionType: "meeting_research_brief",
      confidence: 0.4,
    }));
    expect(wf).toBe("meeting_research_brief");
  });

  it("routes low-confidence with unknown eventType to generic_agent_task", () => {
    const wf = resolveWorkflowType(makeClassification({
      eventType: "other",
      actionType: "task_prep_bundle",
      confidence: 0.4,
    }));
    expect(wf).toBe("generic_agent_task");
  });

  it("uses generic workflow when Claude explicitly recommends it", () => {
    const wf = resolveWorkflowType(makeClassification({
      eventType: "other",
      actionType: "generic_agent_task",
      confidence: 0.8,
    }));
    expect(wf).toBe("generic_agent_task");
  });

  it("generic_agent_task is in the workflow registry", () => {
    expect(WORKFLOW_REGISTRY.generic_agent_task).toBeDefined();
    expect(WORKFLOW_REGISTRY.generic_agent_task.expectedOutputs).toContain("generic_output");
  });

  it("synchronous planActions produces valid fallback steps for generic workflow", () => {
    const plan = planActions(
      makeRecord({ title: "Weird custom event" }),
      makeClassification({
        eventType: "other",
        actionType: null,
        confidence: 0.7,
      }),
      defaultContext,
    );
    expect(plan.workflowType).toBe("generic_agent_task");
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    expect(plan.steps.some((s) => s.type === "claude_generate")).toBe(true);
    expect(plan.steps.some((s) => s.type === "artifact_create")).toBe(true);
  });
});

// ── Test: Non-actionable event ───────────────────────

describe("non-actionable event", () => {
  it("non-actionable events still resolve a workflow type for routing purposes", () => {
    const wf = resolveWorkflowType(makeClassification({
      eventType: "social",
      actionability: "not_actionable",
      actionType: null,
      confidence: 0.95,
    }));
    // Social maps to meeting_research_brief in the EVENT_TYPE_TO_WORKFLOW map
    expect(wf).toBe("meeting_research_brief");
  });

  it("non-actionable events are caught by the orchestrator, not the planner", () => {
    // The planner can still produce a plan — the orchestrator decides not to execute
    const plan = planActions(
      makeRecord({ title: "Dinner with friends" }),
      makeClassification({
        eventType: "social",
        actionability: "not_actionable",
        actionType: null,
        confidence: 0.97,
      }),
      defaultContext,
    );
    // Plan is valid even for non-actionable (orchestrator gate handles it)
    expect(plan.steps.length).toBeGreaterThan(0);
  });
});

// ── Test: web research-required generic event ────────────

describe("web research-required generic event", () => {
  it("includes web_research steps for generic workflow with links", () => {
    const plan = planActions(
      makeRecord({
        title: "Submit application form",
        links: ["https://portal.example.com/apply"],
      }),
      makeClassification({
        eventType: "other",
        actionType: null,
        needsWebResearch: true,
        confidence: 0.8,
      }),
      defaultContext,
    );
    expect(plan.workflowType).toBe("generic_agent_task");
    expect(plan.requiresWebResearch).toBe(true);
    const tfSteps = plan.steps.filter((s) => s.type === "web_research");
    expect(tfSteps.length).toBeGreaterThan(0);
  });

  it("fallback generic steps include browse when needsWebResearch and links exist", () => {
    const steps = buildFallbackGenericSteps(
      makeRecord({ links: ["https://example.com/form"] }),
      makeClassification({ needsWebResearch: true }),
      noIntegrations,
    );
    expect(steps.some((s) => s.type === "web_research")).toBe(true);
  });

  it("fallback generic steps skip browse when no links", () => {
    const steps = buildFallbackGenericSteps(
      makeRecord({ links: undefined }),
      makeClassification({ needsWebResearch: true }),
      noIntegrations,
    );
    expect(steps.some((s) => s.type === "web_research")).toBe(false);
  });
});

// ── Test: genericTaskPlanToSteps conversion ──────────

describe("genericTaskPlanToSteps", () => {
  it("converts a GenericTaskPlan to ActionStep array", () => {
    const plan = makeGenericTaskPlan();
    const steps = genericTaskPlanToSteps(plan, defaultContext);

    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.some((s) => s.type === "claude_generate")).toBe(true);
    expect(steps.some((s) => s.type === "artifact_create")).toBe(true);
  });

  it("includes integration_fetch for gather_context steps when connected", () => {
    const plan = makeGenericTaskPlan({
      executionSteps: [
        { order: 0, description: "Search email", type: "gather_context", input: {} },
        { order: 1, description: "Generate", type: "generate_content", input: {} },
        { order: 2, description: "Create artifact", type: "create_artifact", input: {} },
      ],
    });
    const steps = genericTaskPlanToSteps(plan, defaultContext);
    expect(steps.some((s) => s.type === "integration_fetch")).toBe(true);
  });

  it("skips gather_context when no integrations connected", () => {
    const plan = makeGenericTaskPlan({
      executionSteps: [
        { order: 0, description: "Search email", type: "gather_context", input: {} },
        { order: 1, description: "Generate", type: "generate_content", input: {} },
        { order: 2, description: "Create artifact", type: "create_artifact", input: {} },
      ],
    });
    const steps = genericTaskPlanToSteps(plan, noIntegrations);
    expect(steps.some((s) => s.type === "integration_fetch")).toBe(false);
    // Still has generate + artifact
    expect(steps.some((s) => s.type === "claude_generate")).toBe(true);
    expect(steps.some((s) => s.type === "artifact_create")).toBe(true);
  });

  it("includes web_research for web_research steps with target URLs", () => {
    const plan = makeGenericTaskPlan({
      objective: {
        summary: "Browse some sites",
        targetSites: ["https://example.com"],
        successCriteria: ["Data collected"],
        fallbackBehavior: "Use cached data",
      },
      executionSteps: [
        { order: 0, description: "Browse target site", type: "web_research", input: {} },
        { order: 1, description: "Generate", type: "generate_content", input: {} },
        { order: 2, description: "Create artifact", type: "create_artifact", input: {} },
      ],
    });
    const steps = genericTaskPlanToSteps(plan, defaultContext);
    expect(steps.some((s) => s.type === "web_research")).toBe(true);
  });

  it("ensures claude_generate step exists even if plan omits it", () => {
    const plan = makeGenericTaskPlan({
      executionSteps: [
        { order: 0, description: "Create artifact", type: "create_artifact", input: {} },
      ],
    });
    const steps = genericTaskPlanToSteps(plan, defaultContext);
    expect(steps.some((s) => s.type === "claude_generate")).toBe(true);
  });

  it("ensures artifact_create step exists even if plan omits it", () => {
    const plan = makeGenericTaskPlan({
      executionSteps: [
        { order: 0, description: "Generate something", type: "generate_content", input: {} },
      ],
    });
    const steps = genericTaskPlanToSteps(plan, defaultContext);
    expect(steps.some((s) => s.type === "artifact_create")).toBe(true);
  });
});

// ── Test: planActionsAsync with Claude ────────────────

describe("planActionsAsync", () => {
  beforeEach(() => {
    resetStores();
  });

  it("uses template planner for non-generic workflows (no Claude call)", async () => {
    const plan = await planActionsAsync(
      makeRecord({ title: "Biology Exam" }),
      makeClassification({
        eventType: "study",
        actionType: "study_guide_generation",
        confidence: 0.95,
      }),
      defaultContext,
    );
    expect(plan.workflowType).toBe("study_guide_generation");
  });

  it("calls Claude for generic workflows and converts plan", async () => {
    const genericPlan = makeGenericTaskPlan({
      objective: {
        summary: "Prepare for unusual event",
        successCriteria: ["Document created"],
        fallbackBehavior: "Create generic checklist",
      },
    });
    const client = createMockClient(JSON.stringify(genericPlan));
    setGenericPlannerClient(client);

    const plan = await planActionsAsync(
      makeRecord({ title: "Custom hackathon prep" }),
      makeClassification({
        eventType: "other",
        actionType: "generic_agent_task",
        confidence: 0.8,
      }),
      defaultContext,
    );

    expect(plan.workflowType).toBe("generic_agent_task");
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    expect(plan.expectedOutputs).toContain("generic_output");
  });

  it("falls back to static steps when Claude planning fails", async () => {
    const client = createMockClient("not valid json");
    setGenericPlannerClient(client);

    const plan = await planActionsAsync(
      makeRecord({ title: "Unknown event" }),
      makeClassification({
        eventType: "other",
        actionType: null,
        confidence: 0.7,
      }),
      defaultContext,
    );

    expect(plan.workflowType).toBe("generic_agent_task");
    // Should still have valid steps from fallback
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    expect(plan.steps.some((s) => s.type === "claude_generate")).toBe(true);
    expect(plan.steps.some((s) => s.type === "artifact_create")).toBe(true);
  });
});

// ── Test: Duplicate execution prevention ─────────────

describe("duplicate execution prevention", () => {
  beforeEach(() => {
    resetStores();
  });

  it("pipeline store hasActiveRun prevents duplicate runs", () => {
    const run: PipelineRun = {
      id: "run-1",
      eventRecordId: "rec-test",
      userId: "demo-user",
      stage: "executing",
      artifactIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      log: [],
    };
    pipelineStore.create(run);

    expect(pipelineStore.hasActiveRun("rec-test")).toBe(true);
    expect(pipelineStore.getActiveRun("rec-test")?.id).toBe("run-1");
  });

  it("completed runs do not block new runs", () => {
    const run: PipelineRun = {
      id: "run-done",
      eventRecordId: "rec-test",
      userId: "demo-user",
      stage: "completed",
      artifactIds: ["art-1"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      log: [],
    };
    pipelineStore.create(run);

    expect(pipelineStore.hasActiveRun("rec-test")).toBe(false);
  });

  it("failed runs do not block new runs", () => {
    const run: PipelineRun = {
      id: "run-fail",
      eventRecordId: "rec-test",
      userId: "demo-user",
      stage: "failed",
      artifactIds: [],
      error: "Something broke",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      log: [],
    };
    pipelineStore.create(run);

    expect(pipelineStore.hasActiveRun("rec-test")).toBe(false);
  });
});

// ── Test: Stale artifact handling ─────────────────────

describe("stale artifact handling on event change", () => {
  beforeEach(() => {
    resetStores();
  });

  it("markStaleForEvent marks all artifacts for an event as stale", () => {
    const art1: Artifact = {
      id: "art-1",
      eventRecordId: "rec-test",
      pipelineRunId: "run-1",
      type: "generic_output",
      title: "Test Artifact",
      summary: "Test",
      content: { sections: [{ heading: "Test" }] },
      sources: [],
      confidence: "medium",
      stale: false,
      createdAt: new Date().toISOString(),
    };
    const art2: Artifact = {
      id: "art-2",
      eventRecordId: "rec-test",
      pipelineRunId: "run-1",
      type: "notes",
      title: "Notes",
      summary: "Notes",
      content: { sections: [{ heading: "Notes" }] },
      sources: [],
      confidence: "high",
      stale: false,
      createdAt: new Date().toISOString(),
    };
    artifactStore.create(art1);
    artifactStore.create(art2);

    const count = artifactStore.markStaleForEvent("rec-test");
    expect(count).toBe(2);

    expect(artifactStore.get("art-1")!.stale).toBe(true);
    expect(artifactStore.get("art-2")!.stale).toBe(true);
  });

  it("markStale on event record sets classificationStale and status", () => {
    const record = makeRecord({ id: "rec-stale-test" });
    eventRecordStore.upsert(record);

    eventRecordStore.markStale("rec-stale-test");

    const updated = eventRecordStore.get("rec-stale-test");
    expect(updated!.status).toBe("stale");
    expect(updated!.classificationStale).toBe(true);
  });

  it("listAll excludes stale artifacts by default", () => {
    const fresh: Artifact = {
      id: "art-fresh",
      eventRecordId: "rec-1",
      pipelineRunId: "run-1",
      type: "generic_output",
      title: "Fresh",
      summary: "Fresh",
      content: { sections: [{ heading: "Fresh" }] },
      sources: [],
      confidence: "high",
      stale: false,
      createdAt: new Date().toISOString(),
    };
    const stale: Artifact = {
      id: "art-stale",
      eventRecordId: "rec-1",
      pipelineRunId: "run-1",
      type: "generic_output",
      title: "Stale",
      summary: "Stale",
      content: { sections: [{ heading: "Stale" }] },
      sources: [],
      confidence: "high",
      stale: true,
      createdAt: new Date().toISOString(),
    };
    artifactStore.create(fresh);
    artifactStore.create(stale);

    const defaultList = artifactStore.listAll();
    expect(defaultList).toHaveLength(1);
    expect(defaultList[0].id).toBe("art-fresh");

    const withStale = artifactStore.listAll({ includeStale: true });
    expect(withStale).toHaveLength(2);
  });
});

// ── Test: Template vs generic coexistence ────────────

describe("template and generic workflow coexistence", () => {
  it("all 8 workflows are registered", () => {
    expect(Object.keys(WORKFLOW_REGISTRY)).toHaveLength(8);
  });

  it("generic_agent_task produces valid plans", () => {
    const plan = planActions(
      makeRecord({ title: "Custom task", links: ["https://example.com"] }),
      makeClassification({
        eventType: "other",
        actionType: "generic_agent_task",
        needsWebResearch: true,
        confidence: 0.8,
      }),
      defaultContext,
    );
    expect(plan.workflowType).toBe("generic_agent_task");
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    expect(plan.expectedOutputs).toContain("generic_output");
  });

  it("high-confidence template classification uses template, not generic", () => {
    const wf = resolveWorkflowType(makeClassification({
      eventType: "study",
      actionType: "study_guide_generation",
      confidence: 0.95,
    }));
    expect(wf).toBe("study_guide_generation");
    expect(wf).not.toBe("generic_agent_task");
  });

  it("low-confidence with 'other' eventType falls to generic", () => {
    const wf = resolveWorkflowType(makeClassification({
      eventType: "other",
      actionType: null,
      confidence: 0.4,
    }));
    expect(wf).toBe("generic_agent_task");
  });
});

// Cleanup
afterAll(() => {
  setGenericPlannerClient(null);
});
