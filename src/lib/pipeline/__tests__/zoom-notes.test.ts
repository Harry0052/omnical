import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import {
  detectMeetingPlatform,
  isMeetingEvent,
  getCaptureProvider,
  isCaptureAvailable,
  registerCaptureProvider,
  buildZoomNoteSteps,
  synthesizeZoomNotes,
  setZoomNotesClient,
  StubCaptureProvider,
  type MeetingLink,
  type ILiveCaptureProvider,
  type ZoomNotesData,
} from "../workflows/zoom-notes";
import { planActions, resolveWorkflowType } from "../planner";
import { eventRecordStore, artifactStore } from "../index";
import { MemoryEventRecordStore, MemoryArtifactStore } from "../store";
import type {
  CalendarEventRecord,
  ClassificationResult,
  IntegrationContext,
} from "../types";

// ── Helpers ──────────────────────────────────────────

function resetStores() {
  const freshEvent = new MemoryEventRecordStore();
  Object.assign(eventRecordStore, {
    upsert: freshEvent.upsert.bind(freshEvent),
    get: freshEvent.get.bind(freshEvent),
    getByExternalId: freshEvent.getByExternalId.bind(freshEvent),
    list: freshEvent.list.bind(freshEvent),
    markStale: freshEvent.markStale.bind(freshEvent),
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

function makeRecord(overrides: Partial<CalendarEventRecord> = {}): CalendarEventRecord {
  const now = new Date().toISOString();
  return {
    id: "rec-zoom-test",
    source: "manual",
    title: "CS 101 Zoom Lecture",
    description: "Weekly lecture on data structures. Join: https://zoom.us/j/123456789",
    startAt: "2026-04-01T10:00:00",
    endAt: "2026-04-01T11:30:00",
    timezone: "America/Chicago",
    status: "classified",
    actionability: "actionable",
    links: ["https://zoom.us/j/123456789"],
    metadata: { category: "academic" },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    eventType: "class",
    actionability: "actionable",
    urgency: "medium",
    actionType: "zoom_note_capture",
    needsWebResearch: false,
    confidence: 0.9,
    reasoning: "Zoom lecture requiring note capture.",
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

function makeZoomNotesResponse(overrides: Partial<ZoomNotesData> = {}): ZoomNotesData {
  return {
    title: "Pre-meeting Prep: CS 101 Zoom Lecture",
    summary: "Weekly data structures lecture prep. Topics likely include trees and graph algorithms.",
    platform: "zoom",
    captureStatus: "not_available",
    sections: [
      { heading: "Meeting Overview", body: "Weekly CS 101 lecture on data structures." },
      { heading: "Agenda & Topics", items: ["Binary trees", "Graph traversal", "Big-O analysis"] },
      { heading: "Key Questions", items: ["How does BFS differ from DFS?", "What is the time complexity of tree insertion?"] },
      { heading: "Talking Points", items: ["Review homework 3 results", "Ask about midterm format"] },
      { heading: "Action Items to Review", items: ["Complete practice problems from last week"] },
      { heading: "Follow-up Prep", items: ["Read chapter 7 before next lecture"] },
    ],
    confidence: "medium",
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

// ── Platform Detection ───────────────────────────────

describe("detectMeetingPlatform", () => {
  it("detects Zoom from URL", () => {
    const result = detectMeetingPlatform("Meeting", undefined, undefined, ["https://zoom.us/j/123456789"]);
    expect(result).not.toBeNull();
    expect(result!.platform).toBe("zoom");
    expect(result!.meetingId).toBe("123456789");
  });

  it("detects Google Meet from URL", () => {
    const result = detectMeetingPlatform("Meeting", undefined, undefined, ["https://meet.google.com/abc-defg-hij"]);
    expect(result).not.toBeNull();
    expect(result!.platform).toBe("google_meet");
  });

  it("detects Microsoft Teams from URL", () => {
    const result = detectMeetingPlatform("Meeting", undefined, undefined, ["https://teams.microsoft.com/l/meetup-join/123"]);
    expect(result).not.toBeNull();
    expect(result!.platform).toBe("microsoft_teams");
  });

  it("detects Webex from URL", () => {
    const result = detectMeetingPlatform("Meeting", undefined, undefined, ["https://company.webex.com/meet/john"]);
    expect(result).not.toBeNull();
    expect(result!.platform).toBe("webex");
  });

  it("detects Zoom from title keyword", () => {
    const result = detectMeetingPlatform("Zoom Lecture on Data Structures");
    expect(result).not.toBeNull();
    expect(result!.platform).toBe("zoom");
  });

  it("detects Zoom from description URL", () => {
    const result = detectMeetingPlatform("Lecture", "Join at https://zoom.us/j/999888777");
    expect(result).not.toBeNull();
    expect(result!.platform).toBe("zoom");
    expect(result!.meetingId).toBe("999888777");
  });

  it("detects Zoom from location field", () => {
    const result = detectMeetingPlatform("Meeting", undefined, "https://zoom.us/j/111222333");
    expect(result).not.toBeNull();
    expect(result!.platform).toBe("zoom");
  });

  it("returns null when no meeting platform detected", () => {
    const result = detectMeetingPlatform("Regular Meeting", "Discuss quarterly goals", "Room 204");
    expect(result).toBeNull();
  });
});

// ── isMeetingEvent ───────────────────────────────────

describe("isMeetingEvent", () => {
  it("returns true for event with Zoom link", () => {
    expect(isMeetingEvent(makeRecord())).toBe(true);
  });

  it("returns false for non-meeting event", () => {
    expect(isMeetingEvent(makeRecord({
      title: "Dinner",
      description: "Italian place",
      links: undefined,
    }))).toBe(false);
  });
});

// ── Capture Provider Architecture ────────────────────

describe("capture provider architecture", () => {
  it("returns stub provider for all platforms by default", () => {
    const provider = getCaptureProvider("zoom");
    expect(provider.isAvailable).toBe(false);
    expect(provider.platform).toBe("zoom");
  });

  it("stub provider reports not_available status", async () => {
    const provider = new StubCaptureProvider("zoom");
    expect(await provider.canCapture({ platform: "zoom", url: "" })).toBe(false);
    const result = await provider.getResult("any-id");
    expect(result.status).toBe("not_available");
    expect(result.error).toContain("not yet connected");
  });

  it("stub provider throws on startCapture", async () => {
    const provider = new StubCaptureProvider("zoom");
    await expect(provider.startCapture({} as MeetingLink)).rejects.toThrow("not yet available");
  });

  it("isCaptureAvailable returns false for all platforms by default", () => {
    expect(isCaptureAvailable("zoom")).toBe(false);
    expect(isCaptureAvailable("google_meet")).toBe(false);
    expect(isCaptureAvailable("microsoft_teams")).toBe(false);
  });

  it("registerCaptureProvider allows plugging in a real provider", () => {
    const mockProvider: ILiveCaptureProvider = {
      platform: "zoom",
      isAvailable: true,
      canCapture: async () => true,
      startCapture: async () => "session-123",
      getStatus: async () => "completed",
      getResult: async () => ({
        status: "completed" as const,
        transcript: "Professor discussed binary trees...",
        speakers: ["Prof. Smith"],
        duration: 3600,
      }),
    };

    registerCaptureProvider(mockProvider);
    expect(isCaptureAvailable("zoom")).toBe(true);

    const provider = getCaptureProvider("zoom");
    expect(provider.isAvailable).toBe(true);

    // Reset back to stub
    registerCaptureProvider(new StubCaptureProvider("zoom"));
  });
});

// ── Step Building ────────────────────────────────────

describe("buildZoomNoteSteps", () => {
  it("includes email fetch when gmail connected", () => {
    const steps = buildZoomNoteSteps(makeRecord(), { platform: "zoom", url: "" }, defaultContext);
    expect(steps.some((s) => s.type === "integration_fetch" && s.input.type === "gmail")).toBe(true);
  });

  it("includes slack fetch when slack connected", () => {
    const steps = buildZoomNoteSteps(makeRecord(), { platform: "zoom", url: "" }, defaultContext);
    expect(steps.some((s) => s.type === "integration_fetch" && s.input.type === "slack")).toBe(true);
  });

  it("does not include live capture step when capture not available", () => {
    const steps = buildZoomNoteSteps(makeRecord(), { platform: "zoom", url: "" }, defaultContext);
    expect(steps.some((s) => s.input.type === "live_capture")).toBe(false);
  });

  it("always includes generate-notes and create-artifact steps", () => {
    const steps = buildZoomNoteSteps(makeRecord(), null, noIntegrations);
    expect(steps.some((s) => s.id === "generate-notes")).toBe(true);
    expect(steps.some((s) => s.id === "create-artifact")).toBe(true);
  });

  it("generate-notes step includes captureAvailable=false flag", () => {
    const steps = buildZoomNoteSteps(makeRecord(), { platform: "zoom", url: "" }, defaultContext);
    const genStep = steps.find((s) => s.id === "generate-notes");
    expect(genStep!.input.captureAvailable).toBe(false);
  });

  it("works with no meeting link detected", () => {
    const steps = buildZoomNoteSteps(
      makeRecord({ title: "Regular meeting", links: undefined }),
      null,
      defaultContext,
    );
    expect(steps.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Workflow Routing ─────────────────────────────────

describe("zoom notes workflow routing", () => {
  it("routes to zoom_note_capture when classifier recommends it", () => {
    const wf = resolveWorkflowType(makeClassification());
    expect(wf).toBe("zoom_note_capture");
  });

  it("produces correct plan structure", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification(),
      defaultContext,
    );
    expect(plan.workflowType).toBe("zoom_note_capture");
    expect(plan.expectedOutputs).toContain("notes");
    expect(plan.steps.some((s) => s.id === "generate-notes")).toBe(true);
    expect(plan.steps.some((s) => s.id === "create-artifact")).toBe(true);
  });
});

// ── Synthesis ────────────────────────────────────────

describe("synthesizeZoomNotes", () => {
  beforeEach(resetStores);

  it("produces a valid notes artifact (prep mode, no live capture)", async () => {
    const record = makeRecord();
    setZoomNotesClient(createMockClient(JSON.stringify(makeZoomNotesResponse())));

    const artifact = await synthesizeZoomNotes(record, "run-1", {});

    expect(artifact.type).toBe("notes");
    expect(artifact.eventRecordId).toBe("rec-zoom-test");
    expect(artifact.title).toContain("Pre-meeting Prep");
    expect(artifact.content.sections.length).toBeGreaterThanOrEqual(6);
    expect(artifact.stale).toBe(false);
  });

  it("includes integration status section when capture not available", async () => {
    const record = makeRecord();
    setZoomNotesClient(createMockClient(JSON.stringify(makeZoomNotesResponse())));

    const artifact = await synthesizeZoomNotes(record, "run-1", {});

    const statusSection = artifact.content.sections.find((s) => s.heading === "Integration Status");
    expect(statusSection).toBeDefined();
    expect(statusSection!.body).toContain("not yet connected");
    expect(statusSection!.body).toContain("zoom");
  });

  it("includes meeting URL in sources", async () => {
    const record = makeRecord();
    setZoomNotesClient(createMockClient(JSON.stringify(makeZoomNotesResponse())));

    const artifact = await synthesizeZoomNotes(record, "run-1", {});

    expect(artifact.sources).toContain("https://zoom.us/j/123456789");
  });

  it("incorporates email context into notes", async () => {
    const record = makeRecord();
    setZoomNotesClient(createMockClient(JSON.stringify(makeZoomNotesResponse())));

    const artifact = await synthesizeZoomNotes(record, "run-1", {
      "fetch-email-context": {
        source: "gmail",
        messages: [{ subject: "CS 101 Agenda", snippet: "Topics: binary trees, graph algorithms" }],
      },
    });

    expect(artifact.sources).toContain("gmail");
  });

  it("handles event with no meeting link detected", async () => {
    const record = makeRecord({
      title: "Team sync",
      description: "Regular weekly meeting",
      links: undefined,
    });
    const response = makeZoomNotesResponse({
      platform: "unknown",
      title: "Pre-meeting Prep: Team sync",
    });
    setZoomNotesClient(createMockClient(JSON.stringify(response)));

    const artifact = await synthesizeZoomNotes(record, "run-1", {});

    expect(artifact.type).toBe("notes");
    expect(artifact.title).toContain("Pre-meeting Prep");
    const statusSection = artifact.content.sections.find((s) => s.heading === "Integration Status");
    expect(statusSection!.body).toContain("No meeting platform detected");
  });

  it("handles malformed Claude response", async () => {
    const record = makeRecord();
    setZoomNotesClient(createMockClient("not json"));

    await expect(synthesizeZoomNotes(record, "run-1", {}))
      .rejects.toThrow("Failed to parse zoom notes response");
  });
});

// ── Edge Cases ───────────────────────────────────────

describe("edge cases", () => {
  beforeEach(resetStores);

  it("handles Google Meet event", async () => {
    const record = makeRecord({
      title: "Project Review",
      links: ["https://meet.google.com/abc-defg-hij"],
    });
    const response = makeZoomNotesResponse({ platform: "google_meet" });
    setZoomNotesClient(createMockClient(JSON.stringify(response)));

    const artifact = await synthesizeZoomNotes(record, "run-1", {});

    expect(artifact.type).toBe("notes");
    const statusSection = artifact.content.sections.find((s) => s.heading === "Integration Status");
    expect(statusSection!.body).toContain("google_meet");
  });

  it("handles event with no integrations connected", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification(),
      noIntegrations,
    );
    // Should still produce a valid plan with generate + artifact steps
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    expect(plan.steps.some((s) => s.type === "claude_generate")).toBe(true);
  });

  it("marks artifact stale when event changes", () => {
    const artifact = {
      id: "art-zoom-stale",
      eventRecordId: "rec-zoom-test",
      pipelineRunId: "run-1",
      type: "notes" as const,
      title: "Pre-meeting Prep",
      summary: "Test",
      content: { sections: [{ heading: "Test" }] },
      sources: [],
      confidence: "medium" as const,
      stale: false,
      createdAt: new Date().toISOString(),
    };
    artifactStore.create(artifact);

    const count = artifactStore.markStaleForEvent("rec-zoom-test");
    expect(count).toBe(1);
    expect(artifactStore.get("art-zoom-stale")!.stale).toBe(true);
  });
});

afterAll(() => {
  setZoomNotesClient(null);
});
