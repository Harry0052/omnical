// ── Study Guide Workflow ─────────────────────────────
// Dedicated executor for study_guide_generation workflow.
// Handles: exams, quizzes, lecture reviews, study sessions, assignment prep.
//
// Steps:
//   1. Parse event for course/subject signals
//   2. Gather materials (web research if links, email if connected)
//   3. Build study guide via Claude with gathered + event context
//   4. Label each section as "gathered" or "inferred"
//   5. Produce structured artifact

import Anthropic from "@anthropic-ai/sdk";
import type {
  CalendarEventRecord,
  Artifact,
  ArtifactSection,
} from "../types";
import { ArtifactSchema, validateOrThrow } from "../validation";

// ── Study Guide Sections Contract ────────────────────

export interface StudyGuideData {
  title: string;
  summary: string;
  subject: string;
  sections: StudyGuideSection[];
  confidence: "high" | "medium" | "low";
  sourceNotes: string;
}

interface StudyGuideSection {
  heading: string;
  body?: string;
  items?: string[];
  sourceType: "gathered" | "inferred";
}

// ── Subject Detection ────────────────────────────────

const SUBJECT_KEYWORDS: Record<string, string[]> = {
  biology: ["biology", "bio", "genetics", "ecology", "anatomy", "cell", "organism", "mitosis"],
  chemistry: ["chemistry", "chem", "organic", "inorganic", "reaction", "molecule", "compound"],
  physics: ["physics", "mechanics", "thermodynamics", "electromagnetism", "quantum", "velocity"],
  mathematics: ["math", "calculus", "algebra", "statistics", "probability", "geometry", "linear"],
  "computer science": ["cs", "computer", "programming", "algorithm", "data structure", "software"],
  history: ["history", "historical", "civilization", "revolution", "century", "war"],
  english: ["english", "literature", "essay", "writing", "composition", "rhetoric"],
  psychology: ["psychology", "psych", "cognitive", "behavioral", "developmental"],
  economics: ["economics", "econ", "macro", "micro", "supply", "demand", "gdp"],
};

export function detectSubject(title: string, description?: string): string {
  const text = `${title} ${description ?? ""}`.toLowerCase();
  for (const [subject, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      return subject;
    }
  }
  return "general";
}

// ── Event Type Detection ─────────────────────────────

export type StudyEventKind = "exam" | "quiz" | "lecture_review" | "study_session" | "assignment" | "general_study";

const EVENT_KIND_PATTERNS: Array<{ kind: StudyEventKind; patterns: RegExp[] }> = [
  { kind: "exam", patterns: [/\bexam\b/i, /\bmidterm\b/i, /\bfinal\b/i, /\btest\b/i] },
  { kind: "quiz", patterns: [/\bquiz\b/i, /\bquizzes\b/i] },
  { kind: "lecture_review", patterns: [/\breview\b/i, /\blecture\b/i, /\brecap\b/i] },
  { kind: "assignment", patterns: [/\bassignment\b/i, /\bhomework\b/i, /\bproject\b/i, /\bpaper\b/i, /\blab\b/i] },
  { kind: "study_session", patterns: [/\bstudy\b/i, /\bstudy group\b/i, /\bstudy session\b/i] },
];

export function detectStudyEventKind(title: string, description?: string): StudyEventKind {
  const text = `${title} ${description ?? ""}`;
  for (const { kind, patterns } of EVENT_KIND_PATTERNS) {
    if (patterns.some((p) => p.test(text))) {
      return kind;
    }
  }
  return "general_study";
}

// ── Source Material Aggregator ────────────────────────

export interface GatheredMaterial {
  source: string;
  type: "web_research" | "email" | "slack" | "event_description" | "event_links";
  content: string;
  url?: string;
}

export function extractEventMaterials(record: CalendarEventRecord): GatheredMaterial[] {
  const materials: GatheredMaterial[] = [];

  if (record.description) {
    materials.push({
      source: "Event description",
      type: "event_description",
      content: record.description,
    });
  }

  if (record.links?.length) {
    for (const link of record.links) {
      materials.push({
        source: `Event link: ${link}`,
        type: "event_links",
        content: link,
        url: link,
      });
    }
  }

  return materials;
}

export function aggregateStepOutputs(
  stepOutputs: Record<string, unknown>,
): GatheredMaterial[] {
  const materials: GatheredMaterial[] = [];

  for (const [stepId, output] of Object.entries(stepOutputs)) {
    const out = output as Record<string, unknown>;

    // Web research results
    if (out.browseResults) {
      const results = out.browseResults as Array<{
        url: string;
        data?: Record<string, unknown>;
        status?: string;
      }>;
      for (const r of results) {
        if (r.data) {
          materials.push({
            source: `Web: ${r.url}`,
            type: "web_research",
            content: typeof r.data.content === "string"
              ? r.data.content
              : JSON.stringify(r.data),
            url: r.url,
          });
        }
      }
    }

    // Email results
    if (out.source === "gmail" && out.messages) {
      const messages = out.messages as Array<{
        subject?: string;
        snippet?: string;
        from?: string;
      }>;
      for (const m of messages) {
        materials.push({
          source: `Email: ${m.subject ?? "untitled"}`,
          type: "email",
          content: m.snippet ?? "",
        });
      }
    }

    // Slack results
    if (out.source === "slack" && out.messages) {
      const messages = out.messages as Array<{
        text?: string;
        channel?: string;
        user?: string;
      }>;
      for (const m of messages) {
        materials.push({
          source: `Slack #${m.channel ?? "unknown"}: ${m.user ?? ""}`,
          type: "slack",
          content: m.text ?? "",
        });
      }
    }

    // Claude generated content
    if (out.generatedContent && typeof out.generatedContent === "string") {
      materials.push({
        source: `AI analysis (${stepId})`,
        type: "event_description",
        content: out.generatedContent,
      });
    }
  }

  return materials;
}

// ── Study Guide Synthesis Prompt ─────────────────────

export const STUDY_GUIDE_SYSTEM_PROMPT = `You are an expert academic tutor creating a study guide. Your output must be structured, actionable, and honest about what is gathered vs inferred.

Return ONLY valid JSON matching this schema:

{
  "title": "Study Guide: [Subject/Topic]",
  "summary": "1-2 sentence summary of what this guide covers",
  "subject": "detected subject area",
  "sections": [
    {
      "heading": "Section Title",
      "body": "Optional paragraph of explanation",
      "items": ["Bullet point 1", "Bullet point 2"],
      "sourceType": "gathered" or "inferred"
    }
  ],
  "confidence": "high" or "medium" or "low",
  "sourceNotes": "Brief note on what sources were used and what was inferred"
}

REQUIRED SECTIONS (in order):
1. "Subject & Topic Overview" — what the event is about, the subject area, and scope
2. "Key Concepts" — the most important concepts to understand (sourceType reflects whether these came from gathered materials or were inferred from the title)
3. "Review Priorities" — ordered list of what to focus on, from most to least important
4. "Definitions & Formulas" — key terms, definitions, formulas, or equations if relevant to the subject
5. "Likely Questions" — practice questions or topics likely to appear on the exam/quiz
6. "Study Checklist" — actionable checklist of what to study next

RULES:
- If source materials were gathered (from web, email, or Slack), base content on those and mark sections as "gathered"
- If no source materials are available, infer reasonable content from the event title/description and mark sections as "inferred"
- NEVER hallucinate specific page numbers, textbook content, or professor quotes unless they appear in gathered materials
- For inferred content, use phrases like "Based on the topic, key concepts likely include..." or "Common exam topics in this area include..."
- If the event title is vague, acknowledge uncertainty and provide general study strategies for the detected subject
- Confidence: "high" if substantial gathered materials, "medium" if some context, "low" if mostly inferred

Return ONLY the JSON object.`;

export function buildStudyGuidePrompt(
  record: CalendarEventRecord,
  materials: GatheredMaterial[],
  eventKind: StudyEventKind,
  subject: string,
): string {
  const parts = [
    `Event: ${record.title}`,
    `Event Type: ${eventKind.replace(/_/g, " ")}`,
    `Subject Area: ${subject}`,
    `Date/Time: ${record.startAt} to ${record.endAt}`,
  ];

  if (record.description) parts.push(`Description: ${record.description}`);
  if (record.location) parts.push(`Location: ${record.location}`);

  if (materials.length > 0) {
    parts.push("\n--- GATHERED MATERIALS ---");
    for (const mat of materials) {
      parts.push(`\n[Source: ${mat.source}]`);
      parts.push(mat.content.slice(0, 2000)); // Cap per source
    }
  } else {
    parts.push("\n--- NO EXTERNAL MATERIALS GATHERED ---");
    parts.push("Generate the study guide based on the event title and description only.");
    parts.push("Mark all content sections as 'inferred'.");
  }

  return parts.join("\n");
}

// ── Synthesize Study Guide ───────────────────────────

let clientInstance: Anthropic | null = null;

function getClient(): Anthropic {
  if (!clientInstance) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is required");
    clientInstance = new Anthropic({ apiKey });
  }
  return clientInstance;
}

export function setStudyGuideClient(client: Anthropic | null): void {
  clientInstance = client;
}

export async function synthesizeStudyGuide(
  record: CalendarEventRecord,
  pipelineRunId: string,
  stepOutputs: Record<string, unknown>,
): Promise<Artifact> {
  const client = getClient();

  const subject = detectSubject(record.title, record.description);
  const eventKind = detectStudyEventKind(record.title, record.description);

  // Aggregate all gathered materials
  const eventMaterials = extractEventMaterials(record);
  const stepMaterials = aggregateStepOutputs(stepOutputs);
  const allMaterials = [...eventMaterials, ...stepMaterials];

  const prompt = buildStudyGuidePrompt(record, allMaterials, eventKind, subject);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: STUDY_GUIDE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text for study guide synthesis");
  }

  let parsed: StudyGuideData;
  try {
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse study guide response: ${textBlock.text.slice(0, 200)}`);
  }

  // Map StudyGuideSection to ArtifactSection (drop sourceType for storage, prepend label)
  const sections: ArtifactSection[] = parsed.sections.map((s) => ({
    heading: s.sourceType === "inferred"
      ? `${s.heading} [Inferred]`
      : s.heading,
    body: s.body,
    items: s.items,
  }));

  // Add source notes section
  if (parsed.sourceNotes) {
    sections.push({
      heading: "Source Notes",
      body: parsed.sourceNotes,
    });
  }

  // Build sources list
  const sources = allMaterials
    .filter((m) => m.type !== "event_description")
    .map((m) => m.url ?? m.source);

  const now = new Date().toISOString();
  const artifact: Artifact = {
    id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    eventRecordId: record.id,
    pipelineRunId,
    type: "study_guide",
    title: parsed.title,
    summary: parsed.summary,
    content: { sections },
    sources,
    confidence: parsed.confidence ?? "medium",
    stale: false,
    createdAt: now,
  };

  return validateOrThrow(ArtifactSchema, artifact);
}
