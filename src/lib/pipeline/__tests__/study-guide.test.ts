import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import {
  detectSubject,
  detectStudyEventKind,
  extractEventMaterials,
  aggregateStepOutputs,
  buildStudyGuidePrompt,
  synthesizeStudyGuide,
  setStudyGuideClient,
  type GatheredMaterial,
  type StudyGuideData,
} from "../workflows/study-guide";
import { planActions, resolveWorkflowType } from "../planner";
import { eventRecordStore, pipelineStore, artifactStore } from "../index";
import { MemoryEventRecordStore, MemoryPipelineStore, MemoryArtifactStore } from "../store";
import type {
  CalendarEventRecord,
  ClassificationResult,
  IntegrationContext,
  PipelineRun,
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
    id: "rec-study-test",
    source: "manual",
    title: "Biology Midterm",
    description: "Chapters 5-8. Bring calculator. Materials at https://bio101.edu/review",
    startAt: "2026-04-01T14:00:00",
    endAt: "2026-04-01T15:30:00",
    timezone: "America/Chicago",
    status: "classified",
    actionability: "actionable",
    links: ["https://bio101.edu/review"],
    metadata: { category: "academic" },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    eventType: "study",
    actionability: "actionable",
    urgency: "high",
    actionType: "study_guide_generation",
    needsWebResearch: false,
    confidence: 0.95,
    reasoning: "Midterm exam requiring study guide.",
    missingInputs: [],
    canRunNow: true,
    recommendedExecutionTime: "day_before",
    ...overrides,
  };
}

const defaultContext: IntegrationContext = {
  googleCalendarConnected: false,
  gmailConnected: true,
  slackConnected: false,
  googleDocsConnected: false,
};

function makeStudyGuideResponse(overrides: Partial<StudyGuideData> = {}): StudyGuideData {
  return {
    title: "Study Guide: Biology Midterm — Chapters 5-8",
    summary: "Comprehensive study guide covering cell biology, genetics, and ecology for the midterm exam.",
    subject: "biology",
    sections: [
      {
        heading: "Subject & Topic Overview",
        body: "This midterm covers chapters 5-8 of the biology course, focusing on cell biology, genetics, and basic ecology.",
        sourceType: "gathered",
      },
      {
        heading: "Key Concepts",
        items: ["Cell division: mitosis and meiosis", "Mendelian genetics", "DNA replication", "Ecosystem dynamics"],
        sourceType: "gathered",
      },
      {
        heading: "Review Priorities",
        items: ["1. Cell division processes", "2. Punnett squares", "3. DNA structure", "4. Food webs"],
        sourceType: "inferred",
      },
      {
        heading: "Definitions & Formulas",
        items: ["Mitosis: cell division producing two identical daughter cells", "Allele: variant form of a gene"],
        sourceType: "gathered",
      },
      {
        heading: "Likely Questions",
        items: ["Compare and contrast mitosis and meiosis", "Solve a genetics problem using a Punnett square"],
        sourceType: "inferred",
      },
      {
        heading: "Study Checklist",
        items: ["Review chapter summaries", "Complete practice problems", "Review lecture notes", "Make flashcards for key terms"],
        sourceType: "inferred",
      },
    ],
    confidence: "high",
    sourceNotes: "Content based on gathered course materials from bio101.edu and email threads. Review priorities and likely questions are inferred based on common exam patterns.",
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

// ── Subject Detection ────────────────────────────────

describe("detectSubject", () => {
  it("detects biology from title", () => {
    expect(detectSubject("Biology Midterm")).toBe("biology");
  });

  it("detects chemistry", () => {
    expect(detectSubject("Organic Chemistry Quiz")).toBe("chemistry");
  });

  it("detects computer science", () => {
    expect(detectSubject("CS 101 Algorithm Exam")).toBe("computer science");
  });

  it("detects math from description", () => {
    expect(detectSubject("Exam", "Covers calculus and linear algebra")).toBe("mathematics");
  });

  it("returns general for unrecognized subjects", () => {
    expect(detectSubject("Final Exam")).toBe("general");
  });

  it("detects physics", () => {
    expect(detectSubject("Physics Lab - Thermodynamics")).toBe("physics");
  });
});

// ── Event Kind Detection ─────────────────────────────

describe("detectStudyEventKind", () => {
  it("detects exam", () => {
    expect(detectStudyEventKind("Biology Midterm")).toBe("exam");
    expect(detectStudyEventKind("Final Exam")).toBe("exam");
  });

  it("detects quiz", () => {
    expect(detectStudyEventKind("Weekly Quiz")).toBe("quiz");
  });

  it("detects lecture review", () => {
    expect(detectStudyEventKind("Lecture Review Session")).toBe("lecture_review");
  });

  it("detects assignment", () => {
    expect(detectStudyEventKind("Homework 3 Due")).toBe("assignment");
    expect(detectStudyEventKind("Lab Assignment")).toBe("assignment");
  });

  it("detects study session", () => {
    expect(detectStudyEventKind("Study Group")).toBe("study_session");
  });

  it("returns general_study for unrecognized patterns", () => {
    expect(detectStudyEventKind("Prepare for next week")).toBe("general_study");
  });
});

// ── Material Extraction ──────────────────────────────

describe("extractEventMaterials", () => {
  it("extracts description as material", () => {
    const record = makeRecord({ description: "Study chapters 5-8" });
    const materials = extractEventMaterials(record);
    expect(materials.some((m) => m.type === "event_description")).toBe(true);
    expect(materials.some((m) => m.content.includes("chapters 5-8"))).toBe(true);
  });

  it("extracts links as materials", () => {
    const record = makeRecord({ links: ["https://bio101.edu/review", "https://study.com/guide"] });
    const materials = extractEventMaterials(record);
    const linkMaterials = materials.filter((m) => m.type === "event_links");
    expect(linkMaterials).toHaveLength(2);
    expect(linkMaterials[0].url).toBe("https://bio101.edu/review");
  });

  it("returns empty array for events with no description or links", () => {
    const record = makeRecord({ description: undefined, links: undefined });
    const materials = extractEventMaterials(record);
    expect(materials).toHaveLength(0);
  });
});

// ── Step Output Aggregation ──────────────────────────

describe("aggregateStepOutputs", () => {
  it("aggregates web research browse results", () => {
    const outputs = {
      "fetch-materials": {
        browseResults: [
          { url: "https://bio101.edu", status: "completed", data: { content: "Chapter 5 notes" } },
        ],
      },
    };
    const materials = aggregateStepOutputs(outputs);
    expect(materials.some((m) => m.type === "web_research" && m.content.includes("Chapter 5"))).toBe(true);
  });

  it("aggregates email context", () => {
    const outputs = {
      "fetch-email-context": {
        source: "gmail",
        messages: [
          { subject: "Bio 101 Study Guide", snippet: "Key topics for midterm..." },
        ],
      },
    };
    const materials = aggregateStepOutputs(outputs);
    expect(materials.some((m) => m.type === "email")).toBe(true);
  });

  it("aggregates Slack context", () => {
    const outputs = {
      "fetch-slack": {
        source: "slack",
        messages: [
          { text: "Professor mentioned chapter 7 is important", channel: "bio-101", user: "alice" },
        ],
      },
    };
    const materials = aggregateStepOutputs(outputs);
    expect(materials.some((m) => m.type === "slack")).toBe(true);
  });

  it("handles empty step outputs", () => {
    const materials = aggregateStepOutputs({});
    expect(materials).toHaveLength(0);
  });
});

// ── Prompt Building ──────────────────────────────────

describe("buildStudyGuidePrompt", () => {
  it("includes event details and gathered materials", () => {
    const record = makeRecord();
    const materials: GatheredMaterial[] = [
      { source: "web research: https://bio101.edu", type: "web_research", content: "Chapter 5 content" },
    ];
    const prompt = buildStudyGuidePrompt(record, materials, "exam", "biology");

    expect(prompt).toContain("Biology Midterm");
    expect(prompt).toContain("exam");
    expect(prompt).toContain("biology");
    expect(prompt).toContain("GATHERED MATERIALS");
    expect(prompt).toContain("Chapter 5 content");
  });

  it("notes when no materials are gathered", () => {
    const record = makeRecord({ description: undefined, links: undefined });
    const prompt = buildStudyGuidePrompt(record, [], "exam", "biology");

    expect(prompt).toContain("NO EXTERNAL MATERIALS GATHERED");
    expect(prompt).toContain("Mark all content sections as 'inferred'");
  });
});

// ── Workflow Routing ─────────────────────────────────

describe("study guide workflow routing", () => {
  it("routes study events to study_guide_generation", () => {
    const wf = resolveWorkflowType(makeClassification());
    expect(wf).toBe("study_guide_generation");
  });

  it("routes class events to study_guide_generation", () => {
    const wf = resolveWorkflowType(makeClassification({
      eventType: "class",
      actionType: "study_guide_generation",
    }));
    expect(wf).toBe("study_guide_generation");
  });

  it("produces correct plan with web research when links present", () => {
    const plan = planActions(
      makeRecord(),
      makeClassification({ needsWebResearch: true }),
      defaultContext,
    );
    expect(plan.workflowType).toBe("study_guide_generation");
    expect(plan.requiresWebResearch).toBe(true);
    expect(plan.steps.some((s) => s.type === "web_research")).toBe(true);
  });

  it("produces correct plan without web research when no links", () => {
    const plan = planActions(
      makeRecord({ links: undefined }),
      makeClassification({ needsWebResearch: false }),
      defaultContext,
    );
    expect(plan.workflowType).toBe("study_guide_generation");
    expect(plan.requiresWebResearch).toBe(false);
    expect(plan.steps.some((s) => s.type === "web_research")).toBe(false);
  });
});

// ── Study Guide Synthesis ────────────────────────────

describe("synthesizeStudyGuide", () => {
  beforeEach(resetStores);

  it("produces a valid study guide artifact from gathered materials", async () => {
    const record = makeRecord();
    const guideData = makeStudyGuideResponse();
    setStudyGuideClient(createMockClient(JSON.stringify(guideData)));

    const artifact = await synthesizeStudyGuide(record, "run-1", {
      "fetch-materials": {
        browseResults: [{ url: "https://bio101.edu", status: "completed", data: { content: "Cell biology notes" } }],
      },
    });

    expect(artifact.type).toBe("study_guide");
    expect(artifact.eventRecordId).toBe("rec-study-test");
    expect(artifact.pipelineRunId).toBe("run-1");
    expect(artifact.title).toContain("Biology Midterm");
    expect(artifact.content.sections.length).toBeGreaterThanOrEqual(6);
    expect(artifact.stale).toBe(false);
    expect(artifact.confidence).toBe("high");
  });

  it("labels inferred sections with [Inferred] prefix", async () => {
    const record = makeRecord();
    const guideData = makeStudyGuideResponse();
    setStudyGuideClient(createMockClient(JSON.stringify(guideData)));

    const artifact = await synthesizeStudyGuide(record, "run-1", {});

    const inferredSections = artifact.content.sections.filter((s) => s.heading.includes("[Inferred]"));
    expect(inferredSections.length).toBeGreaterThan(0);
  });

  it("includes source notes section", async () => {
    const record = makeRecord();
    const guideData = makeStudyGuideResponse();
    setStudyGuideClient(createMockClient(JSON.stringify(guideData)));

    const artifact = await synthesizeStudyGuide(record, "run-1", {});

    const sourceNotesSection = artifact.content.sections.find((s) => s.heading === "Source Notes");
    expect(sourceNotesSection).toBeDefined();
    expect(sourceNotesSection!.body).toContain("gathered");
  });

  it("includes source URLs in artifact sources", async () => {
    const record = makeRecord();
    const guideData = makeStudyGuideResponse();
    setStudyGuideClient(createMockClient(JSON.stringify(guideData)));

    const artifact = await synthesizeStudyGuide(record, "run-1", {
      "fetch-materials": {
        browseResults: [{ url: "https://bio101.edu", status: "completed", data: { content: "notes" } }],
      },
    });

    expect(artifact.sources).toContain("https://bio101.edu");
  });

  it("handles events with no gathered materials gracefully", async () => {
    const record = makeRecord({ description: undefined, links: undefined });
    const guideData = makeStudyGuideResponse({
      confidence: "low",
      sourceNotes: "No external materials available. All content is inferred from the event title.",
      sections: [
        { heading: "Subject & Topic Overview", body: "Biology midterm", sourceType: "inferred" },
        { heading: "Key Concepts", items: ["General biology topics"], sourceType: "inferred" },
        { heading: "Review Priorities", items: ["Review all notes"], sourceType: "inferred" },
        { heading: "Definitions & Formulas", items: ["Standard biology terms"], sourceType: "inferred" },
        { heading: "Likely Questions", items: ["Common exam topics"], sourceType: "inferred" },
        { heading: "Study Checklist", items: ["Review materials"], sourceType: "inferred" },
      ],
    });
    setStudyGuideClient(createMockClient(JSON.stringify(guideData)));

    const artifact = await synthesizeStudyGuide(record, "run-1", {});

    expect(artifact.type).toBe("study_guide");
    expect(artifact.confidence).toBe("low");
    // All sections should be marked inferred
    const nonSourceSections = artifact.content.sections.filter((s) => s.heading !== "Source Notes");
    expect(nonSourceSections.every((s) => s.heading.includes("[Inferred]"))).toBe(true);
  });
});

// ── Edge Cases ───────────────────────────────────────

describe("edge cases", () => {
  beforeEach(resetStores);

  it("handles vague event title", async () => {
    const record = makeRecord({ title: "Exam", description: undefined, links: undefined });
    const guideData = makeStudyGuideResponse({
      title: "Study Guide: Exam",
      subject: "general",
      confidence: "low",
    });
    setStudyGuideClient(createMockClient(JSON.stringify(guideData)));

    const artifact = await synthesizeStudyGuide(record, "run-1", {});
    expect(artifact.title).toBe("Study Guide: Exam");
    expect(artifact.confidence).toBe("low");
  });

  it("handles no links in event (no web research steps)", () => {
    const plan = planActions(
      makeRecord({ links: undefined }),
      makeClassification({ needsWebResearch: false }),
      defaultContext,
    );
    expect(plan.steps.some((s) => s.type === "web_research")).toBe(false);
    // Should still have generate + artifact steps
    expect(plan.steps.some((s) => s.type === "claude_generate")).toBe(true);
    expect(plan.steps.some((s) => s.type === "artifact_create")).toBe(true);
  });

  it("handles malformed Claude response", async () => {
    const record = makeRecord();
    setStudyGuideClient(createMockClient("not valid json"));

    await expect(synthesizeStudyGuide(record, "run-1", {}))
      .rejects.toThrow("Failed to parse study guide response");
  });

  it("handles inaccessible materials (web research failure)", async () => {
    const record = makeRecord();
    const guideData = makeStudyGuideResponse({
      confidence: "medium",
      sourceNotes: "Course portal was inaccessible. Content is partially inferred.",
    });
    setStudyGuideClient(createMockClient(JSON.stringify(guideData)));

    // web research returned an error for the browse step
    const artifact = await synthesizeStudyGuide(record, "run-1", {
      "fetch-materials": {
        browseResults: [{ url: "https://bio101.edu", status: "failed", error: "403 Forbidden" }],
      },
    });

    expect(artifact.type).toBe("study_guide");
    expect(artifact.confidence).toBe("medium");
  });

  it("duplicate generation prevented by pipeline store", () => {
    const run: PipelineRun = {
      id: "run-active",
      eventRecordId: "rec-study-test",
      userId: "demo-user",
      stage: "executing",
      artifactIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      log: [],
    };
    pipelineStore.create(run);

    expect(pipelineStore.hasActiveRun("rec-study-test")).toBe(true);
  });

  it("event changed after guide creation marks artifact stale", () => {
    const artifact = {
      id: "art-stale-test",
      eventRecordId: "rec-study-test",
      pipelineRunId: "run-1",
      type: "study_guide" as const,
      title: "Study Guide",
      summary: "Test",
      content: { sections: [{ heading: "Test" }] },
      sources: [],
      confidence: "high" as const,
      stale: false,
      createdAt: new Date().toISOString(),
    };
    artifactStore.create(artifact);

    const count = artifactStore.markStaleForEvent("rec-study-test");
    expect(count).toBe(1);
    expect(artifactStore.get("art-stale-test")!.stale).toBe(true);
  });
});

// Cleanup
afterAll(() => {
  setStudyGuideClient(null);
});
