import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import {
  detectPresentationKind,
  extractTopicSignals,
  aggregateSlideMaterials,
  buildSlideDeckSteps,
  buildSlideDeckPrompt,
  synthesizeSlideDeck,
  setSlideDeckClient,
  type SlideDeckData,
  type SlideMaterial,
} from "../workflows/slide-deck";
import { planActions, resolveWorkflowType } from "../planner";
import { eventRecordStore, pipelineStore, artifactStore } from "../index";
import { MemoryEventRecordStore, MemoryPipelineStore, MemoryArtifactStore } from "../store";
import type {
  CalendarEventRecord,
  ClassificationResult,
  IntegrationContext,
  PipelineRun,
} from "../types";

// ── Helpers ──────────────────────────────────────────

function resetStores() {
  const fe = new MemoryEventRecordStore();
  Object.assign(eventRecordStore, { upsert: fe.upsert.bind(fe), get: fe.get.bind(fe), getByExternalId: fe.getByExternalId.bind(fe), list: fe.list.bind(fe), markStale: fe.markStale.bind(fe) });
  const fp = new MemoryPipelineStore();
  Object.assign(pipelineStore, { create: fp.create.bind(fp), get: fp.get.bind(fp), update: fp.update.bind(fp), listForEvent: fp.listForEvent.bind(fp), listForUser: fp.listForUser.bind(fp), appendLog: fp.appendLog.bind(fp), getActiveRun: fp.getActiveRun.bind(fp), hasActiveRun: fp.hasActiveRun.bind(fp) });
  const fa = new MemoryArtifactStore();
  Object.assign(artifactStore, { create: fa.create.bind(fa), get: fa.get.bind(fa), listForEvent: fa.listForEvent.bind(fa), listAll: fa.listAll.bind(fa), markStaleForEvent: fa.markStaleForEvent.bind(fa) });
}

function makeRecord(overrides: Partial<CalendarEventRecord> = {}): CalendarEventRecord {
  const now = new Date().toISOString();
  return {
    id: "rec-slide-test",
    source: "manual",
    title: "Present final deck Friday",
    description: "Q1 results presentation for the board. Include revenue charts and roadmap.",
    startAt: "2026-04-04T14:00:00",
    endAt: "2026-04-04T15:00:00",
    timezone: "America/Chicago",
    status: "classified",
    actionability: "actionable",
    links: ["https://docs.google.com/presentation/d/abc123"],
    attendees: ["CEO", "CFO", "VP Engineering"],
    metadata: { category: "work" },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    eventType: "presentation",
    actionability: "actionable",
    urgency: "high",
    actionType: "slide_deck_generation",
    needsWebResearch: false,
    confidence: 0.93,
    reasoning: "Presentation requiring slide deck preparation.",
    missingInputs: [],
    canRunNow: true,
    recommendedExecutionTime: "day_before",
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

function makeSlideDeckResponse(overrides: Partial<SlideDeckData> = {}): SlideDeckData {
  return {
    deckTitle: "Q1 Results & Roadmap",
    summary: "Board presentation covering Q1 revenue, key metrics, and product roadmap for Q2.",
    presentationKind: "work_presentation",
    totalSlides: 8,
    slides: [
      { slideNumber: 1, title: "Q1 Results & Roadmap", keyPoints: ["Q1 FY2026", "Board Review"], talkingPoints: ["Welcome the board"], suggestedVisual: "Company logo + date", sourceType: "inferred" },
      { slideNumber: 2, title: "Agenda", keyPoints: ["Revenue", "Metrics", "Roadmap", "Q&A"], talkingPoints: ["Walk through the agenda"], sourceType: "inferred" },
      { slideNumber: 3, title: "Q1 Revenue Overview", keyPoints: ["Revenue growth", "MRR"], talkingPoints: ["Highlight YoY growth"], suggestedVisual: "Bar chart: monthly revenue", sourceType: "gathered" },
      { slideNumber: 4, title: "Key Metrics", keyPoints: ["Churn rate", "NPS", "CAC"], talkingPoints: ["Focus on improvements"], suggestedVisual: "Dashboard-style metrics grid", sourceType: "inferred" },
      { slideNumber: 5, title: "Product Highlights", keyPoints: ["Feature launches", "User adoption"], talkingPoints: ["Demo key features"], suggestedVisual: "Screenshots of new features", sourceType: "inferred" },
      { slideNumber: 6, title: "Q2 Roadmap", keyPoints: ["Planned features", "Timeline"], talkingPoints: ["Present the roadmap"], suggestedVisual: "Gantt chart or timeline", sourceType: "gathered" },
      { slideNumber: 7, title: "Key Takeaways", keyPoints: ["Strong Q1", "Growth trajectory"], talkingPoints: ["Summarize main points"], sourceType: "inferred" },
      { slideNumber: 8, title: "Q&A / Next Steps", keyPoints: ["Open floor", "Follow-up actions"], talkingPoints: ["Thank the board"], sourceType: "inferred" },
    ],
    confidence: "medium",
    sourceNotes: "Revenue data from email context. Roadmap inferred from event description. Specific metrics are placeholders.",
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

// ── Presentation Kind Detection ──────────────────────

describe("detectPresentationKind", () => {
  it("detects work presentation", () => {
    expect(detectPresentationKind("Quarterly Board Review")).toBe("work_presentation");
  });

  it("detects pitch", () => {
    expect(detectPresentationKind("Investor Pitch Deck")).toBe("pitch");
  });

  it("detects demo", () => {
    expect(detectPresentationKind("Product Demo for Client")).toBe("demo");
  });

  it("detects talk", () => {
    expect(detectPresentationKind("Conference Keynote Speech")).toBe("talk");
  });

  it("detects class presentation", () => {
    expect(detectPresentationKind("Seminar Presentation", "Academic paper review")).toBe("class_presentation");
  });

  it("returns general for unrecognized", () => {
    expect(detectPresentationKind("Present final deck Friday")).toBe("general_presentation");
  });
});

// ── Topic Extraction ─────────────────────────────────

describe("extractTopicSignals", () => {
  it("extracts title and description sentences", () => {
    const signals = extractTopicSignals(makeRecord());
    expect(signals).toContain("Present final deck Friday");
    expect(signals.length).toBeGreaterThan(1);
  });

  it("handles no description", () => {
    const signals = extractTopicSignals(makeRecord({ description: undefined }));
    expect(signals).toEqual(["Present final deck Friday"]);
  });
});

// ── Material Aggregation ─────────────────────────────

describe("aggregateSlideMaterials", () => {
  it("aggregates event description", () => {
    const materials = aggregateSlideMaterials(makeRecord(), {});
    expect(materials.some((m) => m.type === "event_context")).toBe(true);
  });

  it("aggregates web research results", () => {
    const materials = aggregateSlideMaterials(makeRecord(), {
      "fetch-materials": {
        browseResults: [{ url: "https://docs.google.com", status: "completed", data: { content: "Q1 data" } }],
      },
    });
    expect(materials.some((m) => m.type === "web_research")).toBe(true);
  });

  it("aggregates email context", () => {
    const materials = aggregateSlideMaterials(makeRecord(), {
      "fetch-email": {
        source: "gmail",
        messages: [{ subject: "Q1 Numbers", snippet: "Revenue: $2.1M" }],
      },
    });
    expect(materials.some((m) => m.type === "email")).toBe(true);
  });

  it("returns only event context when no step outputs", () => {
    const materials = aggregateSlideMaterials(
      makeRecord({ description: undefined }),
      {},
    );
    expect(materials).toHaveLength(0);
  });
});

// ── Step Building ────────────────────────────────────

describe("buildSlideDeckSteps", () => {
  it("includes web research when needsWebResearch and links present", () => {
    const steps = buildSlideDeckSteps(makeRecord(), true, defaultContext);
    expect(steps.some((s) => s.type === "web_research")).toBe(true);
  });

  it("omits web research when needsWebResearch is false", () => {
    const steps = buildSlideDeckSteps(makeRecord(), false, defaultContext);
    expect(steps.some((s) => s.type === "web_research")).toBe(false);
  });

  it("includes email fetch when gmail connected", () => {
    const steps = buildSlideDeckSteps(makeRecord(), false, defaultContext);
    expect(steps.some((s) => s.input.type === "gmail")).toBe(true);
  });

  it("includes slack fetch when slack connected", () => {
    const steps = buildSlideDeckSteps(makeRecord(), false, defaultContext);
    expect(steps.some((s) => s.input.type === "slack")).toBe(true);
  });

  it("always includes generate-outline and create-artifact", () => {
    const steps = buildSlideDeckSteps(makeRecord(), false, noIntegrations);
    expect(steps.some((s) => s.id === "generate-outline")).toBe(true);
    expect(steps.some((s) => s.id === "create-artifact")).toBe(true);
  });
});

// ── Prompt Building ──────────────────────────────────

describe("buildSlideDeckPrompt", () => {
  it("includes event details and materials", () => {
    const materials: SlideMaterial[] = [
      { source: "Email: Q1 data", type: "email", content: "Revenue: $2.1M" },
    ];
    const prompt = buildSlideDeckPrompt(makeRecord(), materials, "work_presentation", ["Q1 results"]);
    expect(prompt).toContain("Present final deck Friday");
    expect(prompt).toContain("work presentation");
    expect(prompt).toContain("GATHERED MATERIALS");
    expect(prompt).toContain("Revenue: $2.1M");
  });

  it("notes when no materials gathered", () => {
    const prompt = buildSlideDeckPrompt(makeRecord(), [], "work_presentation", []);
    expect(prompt).toContain("NO EXTERNAL MATERIALS GATHERED");
  });
});

// ── Workflow Routing ─────────────────────────────────

describe("slide deck workflow routing", () => {
  it("routes presentation events to slide_deck_generation", () => {
    expect(resolveWorkflowType(makeClassification())).toBe("slide_deck_generation");
  });

  it("produces correct plan structure", () => {
    const plan = planActions(makeRecord(), makeClassification(), defaultContext);
    expect(plan.workflowType).toBe("slide_deck_generation");
    expect(plan.expectedOutputs).toContain("slide_content");
    expect(plan.steps.some((s) => s.id === "generate-outline")).toBe(true);
  });
});

// ── Synthesis ────────────────────────────────────────

describe("synthesizeSlideDeck", () => {
  beforeEach(resetStores);

  it("produces a valid slide_content artifact", async () => {
    setSlideDeckClient(createMockClient(JSON.stringify(makeSlideDeckResponse())));
    const artifact = await synthesizeSlideDeck(makeRecord(), "run-1", {});

    expect(artifact.type).toBe("slide_content");
    expect(artifact.eventRecordId).toBe("rec-slide-test");
    expect(artifact.title).toBe("Q1 Results & Roadmap");
    expect(artifact.stale).toBe(false);
  });

  it("contains deck overview section", async () => {
    setSlideDeckClient(createMockClient(JSON.stringify(makeSlideDeckResponse())));
    const artifact = await synthesizeSlideDeck(makeRecord(), "run-1", {});

    const overview = artifact.content.sections.find((s) => s.heading === "Deck Overview");
    expect(overview).toBeDefined();
    expect(overview!.body).toContain("8");
  });

  it("contains individual slide sections with key points and talking points", async () => {
    setSlideDeckClient(createMockClient(JSON.stringify(makeSlideDeckResponse())));
    const artifact = await synthesizeSlideDeck(makeRecord(), "run-1", {});

    const slideSections = artifact.content.sections.filter((s) => s.heading.startsWith("Slide"));
    expect(slideSections.length).toBe(8);
    // Check first content slide has key points
    const slide3 = slideSections.find((s) => s.heading.includes("Slide 3"));
    expect(slide3!.items!.some((i) => i.includes("KEY POINTS"))).toBe(true);
    expect(slide3!.items!.some((i) => i.includes("TALKING POINTS"))).toBe(true);
  });

  it("labels inferred slides with [Inferred] prefix", async () => {
    setSlideDeckClient(createMockClient(JSON.stringify(makeSlideDeckResponse())));
    const artifact = await synthesizeSlideDeck(makeRecord(), "run-1", {});

    const inferred = artifact.content.sections.filter((s) => s.heading.includes("[Inferred]"));
    expect(inferred.length).toBeGreaterThan(0);
  });

  it("includes suggested visuals in slide items", async () => {
    setSlideDeckClient(createMockClient(JSON.stringify(makeSlideDeckResponse())));
    const artifact = await synthesizeSlideDeck(makeRecord(), "run-1", {});

    const allItems = artifact.content.sections.flatMap((s) => s.items ?? []);
    expect(allItems.some((i) => i.includes("VISUAL:"))).toBe(true);
  });

  it("includes source notes section", async () => {
    setSlideDeckClient(createMockClient(JSON.stringify(makeSlideDeckResponse())));
    const artifact = await synthesizeSlideDeck(makeRecord(), "run-1", {});

    const sourceNotes = artifact.content.sections.find((s) => s.heading === "Source Notes");
    expect(sourceNotes).toBeDefined();
  });

  it("includes source URLs from gathered materials", async () => {
    setSlideDeckClient(createMockClient(JSON.stringify(makeSlideDeckResponse())));
    const artifact = await synthesizeSlideDeck(makeRecord(), "run-1", {
      "fetch-materials": {
        browseResults: [{ url: "https://docs.google.com/data", status: "completed", data: { content: "Q1 figures" } }],
      },
    });
    expect(artifact.sources).toContain("https://docs.google.com/data");
  });
});

// ── Edge Cases ───────────────────────────────────────

describe("edge cases", () => {
  beforeEach(resetStores);

  it("handles missing source material (no links, no integrations)", async () => {
    const record = makeRecord({ links: undefined, description: undefined });
    const response = makeSlideDeckResponse({ confidence: "low" });
    setSlideDeckClient(createMockClient(JSON.stringify(response)));

    const artifact = await synthesizeSlideDeck(record, "run-1", {});
    expect(artifact.confidence).toBe("low");
  });

  it("handles malformed Claude response", async () => {
    setSlideDeckClient(createMockClient("not json"));
    await expect(synthesizeSlideDeck(makeRecord(), "run-1", {}))
      .rejects.toThrow("Failed to parse slide deck response");
  });

  it("duplicate generation prevented by pipeline store", () => {
    const run: PipelineRun = {
      id: "run-active",
      eventRecordId: "rec-slide-test",
      userId: "demo-user",
      stage: "executing",
      artifactIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      log: [],
    };
    pipelineStore.create(run);
    expect(pipelineStore.hasActiveRun("rec-slide-test")).toBe(true);
  });

  it("re-run after event update: stale artifact replaced", () => {
    artifactStore.create({
      id: "art-old",
      eventRecordId: "rec-slide-test",
      pipelineRunId: "run-1",
      type: "slide_content",
      title: "Old Deck",
      summary: "Outdated",
      content: { sections: [{ heading: "Old" }] },
      sources: [],
      confidence: "medium",
      stale: false,
      createdAt: new Date().toISOString(),
    });

    // Event changed — mark stale
    const count = artifactStore.markStaleForEvent("rec-slide-test");
    expect(count).toBe(1);
    expect(artifactStore.get("art-old")!.stale).toBe(true);

    // New artifact created after re-run (not stale)
    artifactStore.create({
      id: "art-new",
      eventRecordId: "rec-slide-test",
      pipelineRunId: "run-2",
      type: "slide_content",
      title: "Updated Deck",
      summary: "Fresh",
      content: { sections: [{ heading: "New" }] },
      sources: [],
      confidence: "high",
      stale: false,
      createdAt: new Date().toISOString(),
    });

    const fresh = artifactStore.listAll();
    expect(fresh).toHaveLength(1);
    expect(fresh[0].id).toBe("art-new");
  });

  it("web research failure fallback — still produces artifact from other context", async () => {
    const response = makeSlideDeckResponse({
      confidence: "low",
      sourceNotes: "External resources were inaccessible. Deck based on event description only.",
    });
    setSlideDeckClient(createMockClient(JSON.stringify(response)));

    const artifact = await synthesizeSlideDeck(makeRecord(), "run-1", {
      "fetch-materials": {
        browseResults: [{ url: "https://docs.google.com/data", status: "failed", error: "403 Forbidden" }],
      },
      "fetch-email": {
        source: "gmail",
        messages: [{ subject: "Q1 Numbers", snippet: "Revenue: $2.1M" }],
      },
    });

    expect(artifact.type).toBe("slide_content");
    expect(artifact.confidence).toBe("low");
    expect(artifact.sources).toContain("Email: Q1 Numbers");
  });
});

afterAll(() => {
  setSlideDeckClient(null);
});
