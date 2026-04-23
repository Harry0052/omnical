import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { classifyEvent, setClient } from "../classify";
import { eventRecordStore } from "../index";
import { MemoryEventRecordStore } from "../store";
import type { CalendarEventRecord, ClassificationResult } from "../types";

// ── Test Helpers ─────────────────────────────────────

function resetStore() {
  const fresh = new MemoryEventRecordStore();
  Object.assign(eventRecordStore, {
    upsert: fresh.upsert.bind(fresh),
    get: fresh.get.bind(fresh),
    getByExternalId: fresh.getByExternalId.bind(fresh),
    list: fresh.list.bind(fresh),
    markStale: fresh.markStale.bind(fresh),
  });
}

function makeRecord(overrides: Partial<CalendarEventRecord> = {}): CalendarEventRecord {
  const now = new Date().toISOString();
  const record: CalendarEventRecord = {
    id: "rec-test-1",
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

function makeClassificationJson(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    eventType: "meeting",
    actionability: "actionable",
    urgency: "medium",
    actionType: "meeting_research_brief",
    needsWebResearch: false,
    confidence: 0.92,
    reasoning: "Work meeting with multiple attendees requiring preparation.",
    missingInputs: [],
    canRunNow: true,
    recommendedExecutionTime: "before_event",
    ...overrides,
  };
}

// Mock Anthropic client that returns controlled responses
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

function createFailingClient(error: Error) {
  return {
    messages: {
      create: vi.fn().mockRejectedValue(error),
    },
  } as unknown as import("@anthropic-ai/sdk").default;
}

function createSequenceClient(responses: Array<string | Error>) {
  let callIndex = 0;
  return {
    messages: {
      create: vi.fn().mockImplementation(() => {
        const resp = responses[callIndex++];
        if (resp instanceof Error) return Promise.reject(resp);
        return Promise.resolve({
          content: [{ type: "text", text: resp }],
          model: "claude-sonnet-4-20250514",
        });
      }),
    },
  } as unknown as import("@anthropic-ai/sdk").default;
}

// ── Study Event Classification ───────────────────────

describe("study event classification", () => {
  beforeEach(() => {
    resetStore();
  });

  it("classifies a study event correctly", async () => {
    const record = makeRecord({
      id: "rec-study-1",
      title: "Biology Midterm",
      description: "Chapters 5-8, bring calculator",
      metadata: { category: "academic" },
    });

    const classification = makeClassificationJson({
      eventType: "study",
      actionability: "actionable",
      actionType: "study_guide_generation",
      urgency: "high",
      confidence: 0.95,
      reasoning: "Midterm exam requiring study guide preparation.",
      missingInputs: ["syllabus URL"],
      canRunNow: true,
      recommendedExecutionTime: "day_before",
    });

    const client = createMockClient(JSON.stringify(classification));
    setClient(client);

    const result = await classifyEvent(record, { maxRetries: 0 });

    expect(result.eventType).toBe("study");
    expect(result.actionability).toBe("actionable");
    expect(result.actionType).toBe("study_guide_generation");
    expect(result.confidence).toBe(0.95);
    expect(result.missingInputs).toContain("syllabus URL");
    expect(result.canRunNow).toBe(true);
    expect(result.recommendedExecutionTime).toBe("day_before");
  });

  it("persists classification to event record (new -> classified)", async () => {
    const record = makeRecord({ id: "rec-study-persist" });
    const classification = makeClassificationJson({ eventType: "study" });
    setClient(createMockClient(JSON.stringify(classification)));

    await classifyEvent(record, { maxRetries: 0 });

    const updated = eventRecordStore.get("rec-study-persist");
    expect(updated!.status).toBe("classified");
    expect(updated!.eventType).toBe("study");
    expect(updated!.actionability).toBe("actionable");
    expect(updated!.classificationStale).toBe(false);
  });
});

// ── Meeting Classification ───────────────────────────

describe("meeting classification", () => {
  beforeEach(() => {
    resetStore();
  });

  it("classifies a work meeting with attendees", async () => {
    const record = makeRecord({
      id: "rec-meeting-1",
      title: "Team sync with Acme",
      attendees: ["alice@acme.com", "bob@company.com"],
      description: "Quarterly review of partnership metrics",
      metadata: { category: "work" },
    });

    const classification = makeClassificationJson({
      eventType: "meeting",
      actionability: "actionable",
      actionType: "meeting_research_brief",
      urgency: "medium",
      confidence: 0.93,
      reasoning: "External meeting with Acme team requiring context preparation.",
      missingInputs: ["meeting agenda"],
      canRunNow: true,
      recommendedExecutionTime: "before_event",
    });

    setClient(createMockClient(JSON.stringify(classification)));
    const result = await classifyEvent(record, { maxRetries: 0 });

    expect(result.eventType).toBe("meeting");
    expect(result.actionType).toBe("meeting_research_brief");
    expect(result.needsWebResearch).toBe(false);
    expect(result.missingInputs).toEqual(["meeting agenda"]);
  });

  it("flags needsWebResearch when meeting has external links", async () => {
    const record = makeRecord({
      id: "rec-meeting-tf",
      title: "Client onboarding review",
      links: ["https://client-portal.example.com/onboarding"],
    });

    const classification = makeClassificationJson({
      needsWebResearch: true,
      confidence: 0.85,
      reasoning: "Client portal link requires browser automation to gather context.",
    });

    setClient(createMockClient(JSON.stringify(classification)));
    const result = await classifyEvent(record, { maxRetries: 0 });

    expect(result.needsWebResearch).toBe(true);
  });
});

// ── Non-Actionable Event ─────────────────────────────

describe("non-actionable event classification", () => {
  beforeEach(() => {
    resetStore();
  });

  it("classifies casual social event as not actionable", async () => {
    const record = makeRecord({
      id: "rec-social-1",
      title: "Dinner with friends",
      location: "Joe's Pizza",
      metadata: { category: "social" },
    });

    const classification = makeClassificationJson({
      eventType: "social",
      actionability: "not_actionable",
      actionType: null,
      urgency: "low",
      confidence: 0.97,
      reasoning: "Casual dinner with friends, no preparation needed.",
      missingInputs: [],
      canRunNow: false,
      recommendedExecutionTime: null,
    });

    setClient(createMockClient(JSON.stringify(classification)));
    const result = await classifyEvent(record, { maxRetries: 0 });

    expect(result.actionability).toBe("not_actionable");
    expect(result.actionType).toBeNull();
    expect(result.recommendedExecutionTime).toBeNull();
  });
});

// ── Malformed Model Output ───────────────────────────

describe("malformed model output handling", () => {
  beforeEach(() => {
    resetStore();
  });

  it("throws on non-JSON output after all retries", async () => {
    const record = makeRecord({ id: "rec-malformed-1" });
    setClient(createMockClient("This is not JSON at all, sorry!"));

    await expect(classifyEvent(record, { maxRetries: 0 })).rejects.toThrow(
      /Failed to parse classification response as JSON/
    );
  });

  it("throws on JSON that fails Zod validation after all retries", async () => {
    const record = makeRecord({ id: "rec-malformed-2" });
    const invalidJson = JSON.stringify({
      eventType: "unknown_type",
      actionability: "maybe",
      urgency: "extreme",
    });
    setClient(createMockClient(invalidJson));

    await expect(classifyEvent(record, { maxRetries: 0 })).rejects.toThrow(
      /Classification response failed validation/
    );
  });

  it("handles JSON wrapped in markdown code fences", async () => {
    const record = makeRecord({ id: "rec-fenced" });
    const classification = makeClassificationJson();
    const fenced = "```json\n" + JSON.stringify(classification) + "\n```";
    setClient(createMockClient(fenced));

    const result = await classifyEvent(record, { maxRetries: 0 });
    expect(result.eventType).toBe("meeting");
  });

  it("handles response with no text blocks", async () => {
    const record = makeRecord({ id: "rec-no-text" });
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "image", source: {} }],
          model: "claude-sonnet-4-20250514",
        }),
      },
    } as unknown as import("@anthropic-ai/sdk").default;
    setClient(client);

    await expect(classifyEvent(record, { maxRetries: 0 })).rejects.toThrow(
      /Claude returned no text content/
    );
  });

  it("retries on malformed output and succeeds on second attempt", async () => {
    const record = makeRecord({ id: "rec-retry-success" });
    const goodResponse = JSON.stringify(makeClassificationJson());
    const client = createSequenceClient([
      "not json",
      goodResponse,
    ]);
    setClient(client);

    const result = await classifyEvent(record, { maxRetries: 1, retryDelayMs: 10 });
    expect(result.eventType).toBe("meeting");
    expect(client.messages.create).toHaveBeenCalledTimes(2);
  });

  it("retries on API error and succeeds on second attempt", async () => {
    const record = makeRecord({ id: "rec-api-retry" });
    const goodResponse = JSON.stringify(makeClassificationJson());
    const client = createSequenceClient([
      new Error("API rate limit exceeded"),
      goodResponse,
    ]);
    setClient(client);

    const result = await classifyEvent(record, { maxRetries: 1, retryDelayMs: 10 });
    expect(result.eventType).toBe("meeting");
  });
});

// ── Low Confidence Fallback ──────────────────────────

describe("low confidence fallback", () => {
  beforeEach(() => {
    resetStore();
  });

  it("downgrades actionable to not_actionable when confidence < 0.5", async () => {
    const record = makeRecord({ id: "rec-low-conf", title: "???" });
    const classification = makeClassificationJson({
      confidence: 0.3,
      actionability: "actionable",
      actionType: "task_prep_bundle",
      canRunNow: true,
    });
    setClient(createMockClient(JSON.stringify(classification)));

    const result = await classifyEvent(record, { maxRetries: 0 });

    expect(result.confidence).toBe(0.3);
    expect(result.actionability).toBe("not_actionable");
    expect(result.actionType).toBeNull();
    expect(result.needsWebResearch).toBe(false);
    expect(result.canRunNow).toBe(false);
    expect(result.recommendedExecutionTime).toBeNull();
    expect(result.reasoning).toContain("[Low confidence: 0.3]");
    expect(result.missingInputs).toContain("more context in event description");
  });

  it("preserves actionable classification when confidence >= 0.5", async () => {
    const record = makeRecord({ id: "rec-ok-conf" });
    const classification = makeClassificationJson({
      confidence: 0.65,
      actionability: "actionable",
      actionType: "meeting_research_brief",
    });
    setClient(createMockClient(JSON.stringify(classification)));

    const result = await classifyEvent(record, { maxRetries: 0 });

    expect(result.confidence).toBe(0.65);
    expect(result.actionability).toBe("actionable");
    expect(result.actionType).toBe("meeting_research_brief");
  });

  it("does not add duplicate missingInput if already present", async () => {
    const record = makeRecord({ id: "rec-dup-missing" });
    const classification = makeClassificationJson({
      confidence: 0.2,
      missingInputs: ["more context in event description"],
    });
    setClient(createMockClient(JSON.stringify(classification)));

    const result = await classifyEvent(record, { maxRetries: 0 });

    const count = result.missingInputs.filter(
      (i) => i === "more context in event description"
    ).length;
    expect(count).toBe(1);
  });
});

// ── Missing Title/Description Edge Cases ─────────────

describe("edge cases: minimal event data", () => {
  beforeEach(() => {
    resetStore();
  });

  it("classifies an event with only a title (no description)", async () => {
    const record = makeRecord({
      id: "rec-title-only",
      title: "Important meeting",
      description: undefined,
      location: undefined,
      attendees: undefined,
    });

    const classification = makeClassificationJson({
      eventType: "meeting",
      confidence: 0.6,
      missingInputs: ["meeting agenda", "attendee list"],
    });
    setClient(createMockClient(JSON.stringify(classification)));

    const result = await classifyEvent(record, { maxRetries: 0 });
    expect(result.eventType).toBe("meeting");
    expect(result.missingInputs).toContain("meeting agenda");
    expect(result.missingInputs).toContain("attendee list");
  });

  it("classifies a vague event title with low confidence", async () => {
    const record = makeRecord({
      id: "rec-vague",
      title: "thing",
    });

    const classification = makeClassificationJson({
      eventType: "other",
      actionability: "actionable",
      confidence: 0.25,
      reasoning: "Extremely vague title with no context.",
      missingInputs: ["event description", "attendees"],
    });
    setClient(createMockClient(JSON.stringify(classification)));

    const result = await classifyEvent(record, { maxRetries: 0 });

    // Low confidence fallback should trigger
    expect(result.actionability).toBe("not_actionable");
    expect(result.reasoning).toContain("[Low confidence: 0.25]");
  });
});

// ── Model Swappability ───────────────────────────────

describe("model configuration", () => {
  beforeEach(() => {
    resetStore();
  });

  it("uses custom model when specified", async () => {
    const record = makeRecord({ id: "rec-custom-model" });
    const classification = makeClassificationJson();
    const client = createMockClient(JSON.stringify(classification));
    setClient(client);

    await classifyEvent(record, { model: "claude-haiku-4-20250514", maxRetries: 0 });

    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-20250514" })
    );
  });

  it("uses default model when not specified", async () => {
    const record = makeRecord({ id: "rec-default-model" });
    const classification = makeClassificationJson();
    const client = createMockClient(JSON.stringify(classification));
    setClient(client);

    await classifyEvent(record, { maxRetries: 0 });

    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-sonnet-4-20250514" })
    );
  });
});

// ── Prompt Content Verification ──────────────────────

describe("prompt construction", () => {
  beforeEach(() => {
    resetStore();
  });

  it("includes all event fields in the prompt sent to Claude", async () => {
    const record = makeRecord({
      id: "rec-prompt-check",
      title: "Team Planning",
      description: "Discuss roadmap for Q2",
      location: "Conference Room B",
      attendees: ["alice@test.com", "bob@test.com"],
      links: ["https://docs.google.com/roadmap"],
      metadata: { category: "work" },
    });

    const classification = makeClassificationJson();
    const client = createMockClient(JSON.stringify(classification));
    setClient(client);

    await classifyEvent(record, { maxRetries: 0 });

    const callArgs = (client.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const userContent = callArgs.messages[0].content as string;

    expect(userContent).toContain("Team Planning");
    expect(userContent).toContain("Discuss roadmap for Q2");
    expect(userContent).toContain("Conference Room B");
    expect(userContent).toContain("alice@test.com");
    expect(userContent).toContain("https://docs.google.com/roadmap");
    expect(userContent).toContain("work");
    expect(userContent).toContain("Time until event:");
  });
});

// Cleanup
afterAll(() => {
  setClient(null);
});
