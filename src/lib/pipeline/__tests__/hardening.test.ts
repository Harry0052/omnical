import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { eventRecordStore, pipelineStore, artifactStore, settingsStore } from "../index";
import { MemoryEventRecordStore, MemoryPipelineStore, MemoryArtifactStore, MemorySettingsStore } from "../store";
import { runPipeline, resumePipelineFromApproval } from "../orchestrator";
import { setClient as setClassifyClient } from "../classify";
import { planActions, resolveWorkflowType } from "../planner";
import type {
  CalendarEventRecord,
  ClassificationResult,
  PipelineRun,
  Artifact,
  IntegrationContext,
} from "../types";

// ── Store Reset ──────────────────────────────────────

function resetAllStores() {
  const fe = new MemoryEventRecordStore();
  Object.assign(eventRecordStore, { upsert: fe.upsert.bind(fe), get: fe.get.bind(fe), getByExternalId: fe.getByExternalId.bind(fe), list: fe.list.bind(fe), markStale: fe.markStale.bind(fe) });
  const fp = new MemoryPipelineStore();
  Object.assign(pipelineStore, { create: fp.create.bind(fp), get: fp.get.bind(fp), update: fp.update.bind(fp), listForEvent: fp.listForEvent.bind(fp), listForUser: fp.listForUser.bind(fp), appendLog: fp.appendLog.bind(fp), getActiveRun: fp.getActiveRun.bind(fp), hasActiveRun: fp.hasActiveRun.bind(fp) });
  const fa = new MemoryArtifactStore();
  Object.assign(artifactStore, { create: fa.create.bind(fa), get: fa.get.bind(fa), listForEvent: fa.listForEvent.bind(fa), listAll: fa.listAll.bind(fa), markStaleForEvent: fa.markStaleForEvent.bind(fa) });
  const fs = new MemorySettingsStore();
  Object.assign(settingsStore, { get: fs.get.bind(fs), update: fs.update.bind(fs) });
}

function makeRecord(overrides: Partial<CalendarEventRecord> = {}): CalendarEventRecord {
  const now = new Date().toISOString();
  const record: CalendarEventRecord = {
    id: "rec-hardening",
    source: "manual",
    title: "Test Event",
    startAt: "2026-04-01T09:00:00",
    endAt: "2026-04-01T10:00:00",
    timezone: "America/Chicago",
    status: "new",
    actionability: "unknown",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  eventRecordStore.upsert(record);
  return record;
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

function createMockClassifyClient(classification: ClassificationResult) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify(classification) }],
        model: "claude-sonnet-4-20250514",
      }),
    },
  } as unknown as import("@anthropic-ai/sdk").default;
}

const defaultContext: IntegrationContext = {
  googleCalendarConnected: false,
  gmailConnected: false,
  slackConnected: false,
  googleDocsConnected: false,
};

// ── Race Condition Prevention ────────────────────────

describe("duplicate execution prevention", () => {
  beforeEach(resetAllStores);

  it("pipeline store blocks concurrent active runs on same event", () => {
    const run: PipelineRun = {
      id: "run-active-1",
      eventRecordId: "rec-hardening",
      userId: "demo-user",
      stage: "executing",
      artifactIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      log: [],
    };
    pipelineStore.create(run);

    expect(pipelineStore.hasActiveRun("rec-hardening")).toBe(true);
    expect(pipelineStore.getActiveRun("rec-hardening")?.id).toBe("run-active-1");
  });

  it("completed runs do not block new runs", () => {
    pipelineStore.create({
      id: "run-done",
      eventRecordId: "rec-hardening",
      userId: "demo-user",
      stage: "completed",
      artifactIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      log: [],
    });
    expect(pipelineStore.hasActiveRun("rec-hardening")).toBe(false);
  });

  it("failed runs do not block new runs", () => {
    pipelineStore.create({
      id: "run-fail",
      eventRecordId: "rec-hardening",
      userId: "demo-user",
      stage: "failed",
      artifactIds: [],
      error: "broken",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      log: [],
    });
    expect(pipelineStore.hasActiveRun("rec-hardening")).toBe(false);
  });

  it("awaiting_approval counts as active", () => {
    pipelineStore.create({
      id: "run-waiting",
      eventRecordId: "rec-hardening",
      userId: "demo-user",
      stage: "awaiting_approval",
      artifactIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      log: [],
    });
    expect(pipelineStore.hasActiveRun("rec-hardening")).toBe(true);
  });

  it("queued counts as active", () => {
    pipelineStore.create({
      id: "run-queued",
      eventRecordId: "rec-hardening",
      userId: "demo-user",
      stage: "queued",
      artifactIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      log: [],
    });
    expect(pipelineStore.hasActiveRun("rec-hardening")).toBe(true);
  });
});

// ── Status Transitions ───────────────────────────────

describe("status transitions", () => {
  beforeEach(resetAllStores);

  it("pipeline run tracks all stage transitions via log", () => {
    pipelineStore.create({
      id: "run-log-test",
      eventRecordId: "rec-test",
      userId: "demo-user",
      stage: "ingested",
      artifactIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      log: [],
    });

    pipelineStore.appendLog("run-log-test", {
      timestamp: new Date().toISOString(),
      stage: "classifying",
      message: "Starting classification",
    });

    pipelineStore.update("run-log-test", { stage: "classifying" });

    const run = pipelineStore.get("run-log-test");
    expect(run!.stage).toBe("classifying");
    expect(run!.log).toHaveLength(1);
    expect(run!.log[0].stage).toBe("classifying");
  });
});

// ── Approval Mode ────────────────────────────────────

describe("approval mode behavior", () => {
  beforeEach(resetAllStores);

  it("auto mode: plan.requiresApproval is false even with TinyFish", () => {
    const plan = planActions(
      makeRecord({ links: ["https://example.com"] }),
      makeClassification({ needsTinyFish: true }),
      defaultContext,
      "auto",
    );
    expect(plan.requiresApproval).toBe(false);
  });

  it("approve_all mode: plan.requiresApproval is true without TinyFish", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification({ needsTinyFish: false }),
      defaultContext,
      "approve_all",
    );
    expect(plan.requiresApproval).toBe(true);
  });

  it("approve_tinyfish_only: approval only when TinyFish needed", () => {
    const withTF = planActions(
      makeRecord({ links: ["https://example.com"] }),
      makeClassification({ needsTinyFish: true }),
      defaultContext,
      "approve_tinyfish_only",
    );
    expect(withTF.requiresApproval).toBe(true);

    const withoutTF = planActions(
      makeRecord(),
      makeClassification({ needsTinyFish: false }),
      defaultContext,
      "approve_tinyfish_only",
    );
    expect(withoutTF.requiresApproval).toBe(false);
  });

  it("resumePipelineFromApproval rejects non-awaiting runs", async () => {
    const record = makeRecord();
    pipelineStore.create({
      id: "run-not-waiting",
      eventRecordId: record.id,
      userId: "demo-user",
      stage: "executing",
      artifactIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      log: [],
    });

    await expect(resumePipelineFromApproval("run-not-waiting", record))
      .rejects.toThrow("not in awaiting_approval stage");
  });

  it("resumePipelineFromApproval rejects runs without a plan", async () => {
    const record = makeRecord();
    pipelineStore.create({
      id: "run-no-plan",
      eventRecordId: record.id,
      userId: "demo-user",
      stage: "awaiting_approval",
      artifactIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      log: [],
    });

    await expect(resumePipelineFromApproval("run-no-plan", record))
      .rejects.toThrow("no action plan found");
  });
});

// ── Rate Limiting ────────────────────────────────────

describe("rate limiting", () => {
  beforeEach(resetAllStores);

  it("rejects pipeline when hourly rate limit exceeded", async () => {
    const record = makeRecord();
    // Set low rate limit
    settingsStore.update("demo-user", { rateLimits: { maxRunsPerHour: 1, maxRunsPerDay: 100 } });

    // Create a recent run
    pipelineStore.create({
      id: "run-recent",
      eventRecordId: "rec-other",
      userId: "demo-user",
      stage: "completed",
      artifactIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      log: [],
    });

    // Mock env
    const origKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";

    try {
      await expect(runPipeline(record.id, "demo-user"))
        .rejects.toThrow("Rate limit");
    } finally {
      process.env.ANTHROPIC_API_KEY = origKey;
    }
  });
});

// ── Pipeline Disabled ────────────────────────────────

describe("pipeline disabled", () => {
  beforeEach(resetAllStores);

  it("rejects when pipeline is disabled in settings", async () => {
    const record = makeRecord();
    settingsStore.update("demo-user", { enabled: false });

    await expect(runPipeline(record.id, "demo-user"))
      .rejects.toThrow("Pipeline is disabled");
  });
});

// ── Artifact Staleness ───────────────────────────────

describe("artifact staleness", () => {
  beforeEach(resetAllStores);

  it("markStaleForEvent marks all event artifacts as stale", () => {
    artifactStore.create({
      id: "art-1",
      eventRecordId: "rec-hardening",
      pipelineRunId: "run-1",
      type: "study_guide",
      title: "Guide",
      summary: "Test",
      content: { sections: [{ heading: "Test" }] },
      sources: [],
      confidence: "high",
      stale: false,
      createdAt: new Date().toISOString(),
    });
    artifactStore.create({
      id: "art-2",
      eventRecordId: "rec-hardening",
      pipelineRunId: "run-1",
      type: "notes",
      title: "Notes",
      summary: "Test",
      content: { sections: [{ heading: "Test" }] },
      sources: [],
      confidence: "medium",
      stale: false,
      createdAt: new Date().toISOString(),
    });

    const count = artifactStore.markStaleForEvent("rec-hardening");
    expect(count).toBe(2);
    expect(artifactStore.get("art-1")!.stale).toBe(true);
    expect(artifactStore.get("art-2")!.stale).toBe(true);
  });

  it("listAll excludes stale by default", () => {
    artifactStore.create({
      id: "art-fresh",
      eventRecordId: "rec-1",
      pipelineRunId: "run-1",
      type: "notes",
      title: "Fresh",
      summary: "Test",
      content: { sections: [{ heading: "Test" }] },
      sources: [],
      confidence: "high",
      stale: false,
      createdAt: new Date().toISOString(),
    });
    artifactStore.create({
      id: "art-stale",
      eventRecordId: "rec-1",
      pipelineRunId: "run-1",
      type: "notes",
      title: "Stale",
      summary: "Test",
      content: { sections: [{ heading: "Test" }] },
      sources: [],
      confidence: "high",
      stale: true,
      createdAt: new Date().toISOString(),
    });

    expect(artifactStore.listAll()).toHaveLength(1);
    expect(artifactStore.listAll({ includeStale: true })).toHaveLength(2);
  });

  it("event record markStale sets status and classificationStale", () => {
    const record = makeRecord();
    eventRecordStore.markStale(record.id);

    const updated = eventRecordStore.get(record.id);
    expect(updated!.status).toBe("stale");
    expect(updated!.classificationStale).toBe(true);
  });
});

// ── Missing API Key ──────────────────────────────────

describe("missing API key handling", () => {
  beforeEach(resetAllStores);

  it("rejects pipeline when ANTHROPIC_API_KEY is missing", async () => {
    const record = makeRecord();
    const origKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      await expect(runPipeline(record.id, "demo-user"))
        .rejects.toThrow("ANTHROPIC_API_KEY is not configured");
    } finally {
      if (origKey) process.env.ANTHROPIC_API_KEY = origKey;
    }
  });
});

// ── Malformed Payloads ───────────────────────────────

describe("malformed payload rejection", () => {
  it("classification rejects non-JSON from Claude", async () => {
    const { classifyEvent, setClient } = await import("../classify");
    const record = makeRecord();
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "not json" }],
        }),
      },
    } as unknown as import("@anthropic-ai/sdk").default;
    setClient(client);

    await expect(classifyEvent(record, { maxRetries: 0 }))
      .rejects.toThrow(/Failed to parse/);

    setClient(null);
  });

  it("classification rejects invalid schema from Claude", async () => {
    const { classifyEvent, setClient } = await import("../classify");
    const record = makeRecord();
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: JSON.stringify({ bad: "data" }) }],
        }),
      },
    } as unknown as import("@anthropic-ai/sdk").default;
    setClient(client);

    await expect(classifyEvent(record, { maxRetries: 0 }))
      .rejects.toThrow(/failed validation/);

    setClient(null);
  });
});

// ── Workflow Routing Consistency ──────────────────────

describe("workflow routing consistency", () => {
  it("every event type resolves to a valid workflow", () => {
    const eventTypes = ["study", "meeting", "interview", "class", "presentation", "travel", "social", "admin", "other"] as const;
    for (const et of eventTypes) {
      const wf = resolveWorkflowType(makeClassification({
        eventType: et,
        actionType: null,
        confidence: 0.9,
      }));
      expect(wf).toBeDefined();
      expect(typeof wf).toBe("string");
    }
  });

  it("all plans pass Zod validation", () => {
    const workflowTypes = [
      "study_guide_generation", "meeting_research_brief", "zoom_note_capture",
      "slide_deck_generation", "registration_or_rsvp", "logistics_booking",
      "task_prep_bundle", "generic_agent_task",
    ] as const;

    for (const wf of workflowTypes) {
      const plan = planActions(
        makeRecord({ links: ["https://example.com"], location: "Room 5" }),
        makeClassification({ actionType: wf, confidence: 0.95, needsTinyFish: true }),
        defaultContext,
      );
      // planActions calls validateOrThrow internally — if it returns, validation passed
      expect(plan.workflowType).toBe(wf);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.expectedOutputs.length).toBeGreaterThan(0);
    }
  });
});

// ── Store Edge Cases ─────────────────────────────────

describe("store edge cases", () => {
  beforeEach(resetAllStores);

  it("get returns null for non-existent IDs", () => {
    expect(eventRecordStore.get("nonexistent")).toBeNull();
    expect(pipelineStore.get("nonexistent")).toBeNull();
    expect(artifactStore.get("nonexistent")).toBeNull();
  });

  it("update on non-existent run is a no-op", () => {
    pipelineStore.update("nonexistent", { stage: "failed" });
    expect(pipelineStore.get("nonexistent")).toBeNull();
  });

  it("appendLog on non-existent run is a no-op", () => {
    pipelineStore.appendLog("nonexistent", {
      timestamp: new Date().toISOString(),
      stage: "failed",
      message: "test",
    });
    expect(pipelineStore.get("nonexistent")).toBeNull();
  });

  it("markStaleForEvent with no artifacts returns 0", () => {
    expect(artifactStore.markStaleForEvent("nonexistent")).toBe(0);
  });

  it("settings store returns defaults for unknown user", () => {
    const settings = settingsStore.get("unknown-user");
    expect(settings.enabled).toBe(true);
    expect(settings.approvalMode).toBe("auto");
    expect(settings.rateLimits.maxRunsPerHour).toBe(10);
  });
});

afterAll(() => {
  setClassifyClient(null);
});
