// ── Slide Deck Generation Workflow ───────────────────
// Produces structured slide deck drafts from event context.
//
// Output:
//   - Title suggestion
//   - Slide-by-slide outline with key points
//   - Talking points per slide
//   - Suggested visuals
//   - Speaker notes
//   - Source provenance (gathered vs inferred)

import Anthropic from "@anthropic-ai/sdk";
import type {
  CalendarEventRecord,
  Artifact,
  ArtifactSection,
  IntegrationContext,
  ActionStep,
} from "../types";
import { ArtifactSchema, validateOrThrow } from "../validation";

// ── Presentation Type Detection ──────────────────────

export type PresentationKind =
  | "class_presentation"
  | "work_presentation"
  | "pitch"
  | "demo"
  | "talk"
  | "general_presentation";

const PRESENTATION_PATTERNS: Array<{ kind: PresentationKind; patterns: RegExp[] }> = [
  { kind: "pitch", patterns: [/\bpitch\b/i, /\binvestor\b/i, /\bfundraising\b/i, /\bvc\b/i] },
  { kind: "demo", patterns: [/\bdemo\b/i, /\bproduct demo\b/i, /\bshowcase\b/i] },
  { kind: "talk", patterns: [/\btalk\b/i, /\bspeech\b/i, /\bkeynote\b/i, /\bpanel\b/i, /\bconference\b/i] },
  { kind: "class_presentation", patterns: [/\bclass\b/i, /\bcourse\b/i, /\blecture\b/i, /\bseminar\b/i, /\bacademic\b/i] },
  { kind: "work_presentation", patterns: [/\bquarterly\b/i, /\breview\b/i, /\bboard\b/i, /\bstakeholder\b/i, /\bstrategy\b/i, /\bupdate\b/i] },
];

export function detectPresentationKind(title: string, description?: string): PresentationKind {
  const text = `${title} ${description ?? ""}`;
  for (const { kind, patterns } of PRESENTATION_PATTERNS) {
    if (patterns.some((p) => p.test(text))) return kind;
  }
  return "general_presentation";
}

// ── Topic Extraction ─────────────────────────────────

export function extractTopicSignals(record: CalendarEventRecord): string[] {
  const signals: string[] = [];
  if (record.title) signals.push(record.title);
  if (record.description) {
    // Extract phrases that look like topics
    const sentences = record.description.split(/[.!?\n]+/).filter(Boolean);
    for (const s of sentences.slice(0, 5)) {
      signals.push(s.trim());
    }
  }
  return signals;
}

// ── Source Material Aggregation ───────────────────────

export interface SlideMaterial {
  source: string;
  type: "web_research" | "email" | "slack" | "event_context";
  content: string;
  url?: string;
}

export function aggregateSlideMaterials(
  record: CalendarEventRecord,
  stepOutputs: Record<string, unknown>,
): SlideMaterial[] {
  const materials: SlideMaterial[] = [];

  // Event context
  if (record.description) {
    materials.push({
      source: "Event description",
      type: "event_context",
      content: record.description,
    });
  }

  // Step outputs
  for (const [stepId, output] of Object.entries(stepOutputs)) {
    const out = output as Record<string, unknown>;

    if (out.browseResults) {
      const results = out.browseResults as Array<{
        url: string; data?: Record<string, unknown>; status?: string;
      }>;
      for (const r of results) {
        if (r.data) {
          materials.push({
            source: `Web: ${r.url}`,
            type: "web_research",
            content: typeof r.data.content === "string" ? r.data.content : JSON.stringify(r.data),
            url: r.url,
          });
        }
      }
    }

    if (out.source === "gmail" && out.messages) {
      const messages = out.messages as Array<{ subject?: string; snippet?: string }>;
      for (const m of messages) {
        materials.push({
          source: `Email: ${m.subject ?? "untitled"}`,
          type: "email",
          content: m.snippet ?? "",
        });
      }
    }

    if (out.source === "slack" && out.messages) {
      const messages = out.messages as Array<{ text?: string; channel?: string; user?: string }>;
      for (const m of messages) {
        materials.push({
          source: `Slack #${m.channel ?? "unknown"}`,
          type: "slack",
          content: m.text ?? "",
        });
      }
    }

    if (out.generatedContent && typeof out.generatedContent === "string") {
      materials.push({
        source: `AI analysis (${stepId})`,
        type: "event_context",
        content: out.generatedContent,
      });
    }
  }

  return materials;
}

// ── Slide Data Contract ──────────────────────────────

export interface SlideEntry {
  slideNumber: number;
  title: string;
  keyPoints: string[];
  talkingPoints: string[];
  suggestedVisual?: string;
  speakerNotes?: string;
  sourceType: "gathered" | "inferred";
}

export interface SlideDeckData {
  deckTitle: string;
  summary: string;
  presentationKind: string;
  totalSlides: number;
  slides: SlideEntry[];
  confidence: "high" | "medium" | "low";
  sourceNotes: string;
}

// ── Step Builder ─────────────────────────────────────

export function buildSlideDeckSteps(
  record: CalendarEventRecord,
  needsWebResearch: boolean,
  context: IntegrationContext,
): ActionStep[] {
  const steps: ActionStep[] = [];

  if (record.links?.length && needsWebResearch) {
    steps.push({
      id: "fetch-materials",
      type: "web_research",
      description: "Browse linked resources for presentation content",
      input: {
        urls: record.links,
        instructions: `Extract content, data, key points, and any visual references for a presentation about: ${record.title}. Look for statistics, charts, quotes, and supporting evidence.`,
      },
      status: "pending",
    });
  }

  if (context.gmailConnected) {
    steps.push({
      id: "fetch-email-context",
      type: "integration_fetch",
      description: "Search email for presentation materials and feedback",
      input: {
        type: "gmail",
        query: record.title,
        attendees: record.attendees,
      },
      status: "pending",
    });
  }

  if (context.slackConnected) {
    steps.push({
      id: "fetch-slack-context",
      type: "integration_fetch",
      description: "Search Slack for related discussions and shared content",
      input: {
        type: "slack",
        query: record.title,
      },
      status: "pending",
    });
  }

  const priorIds = steps.map((s) => s.id);
  steps.push({
    id: "generate-outline",
    type: "claude_generate",
    description: "Generate slide deck outline with talking points and visuals",
    input: {
      prompt: "slide_deck",
      eventTitle: record.title,
      eventDescription: record.description,
      attendees: record.attendees,
    },
    dependsOn: priorIds.length > 0 ? priorIds : undefined,
    status: "pending",
  });

  steps.push({
    id: "create-artifact",
    type: "artifact_create",
    description: "Create slide deck content artifact",
    input: { artifactType: "slide_content" },
    dependsOn: ["generate-outline"],
    status: "pending",
  });

  return steps;
}

// ── Synthesis Prompt ─────────────────────────────────

export const SLIDE_DECK_SYSTEM_PROMPT = `You are an expert presentation designer creating a structured slide deck outline.

Return ONLY valid JSON matching this schema:

{
  "deckTitle": "Suggested presentation title",
  "summary": "1-2 sentence summary of the presentation",
  "presentationKind": "class_presentation" or "work_presentation" or "pitch" or "demo" or "talk" or "general_presentation",
  "totalSlides": number,
  "slides": [
    {
      "slideNumber": 1,
      "title": "Slide Title",
      "keyPoints": ["Point 1", "Point 2"],
      "talkingPoints": ["What to say about this slide"],
      "suggestedVisual": "Description of a recommended visual (chart, image, diagram, etc.)" or null,
      "speakerNotes": "Detailed notes for the presenter" or null,
      "sourceType": "gathered" or "inferred"
    }
  ],
  "confidence": "high" or "medium" or "low",
  "sourceNotes": "Brief explanation of what sources were used and what was inferred"
}

REQUIRED SLIDE STRUCTURE:
1. Title Slide — presentation title, presenter name placeholder, date
2. Agenda/Overview — outline of what will be covered
3-N. Content Slides — 5-12 content slides depending on complexity
N+1. Summary/Key Takeaways — recap of main points
N+2. Q&A / Next Steps — closing slide

RULES:
- Aim for 8-12 slides total unless the topic clearly demands more or fewer
- Each slide should have 2-4 key points (not walls of text)
- Talking points should be conversational guidance, not scripts
- Suggested visuals should be specific: "bar chart showing quarterly revenue" not just "chart"
- If source materials were gathered, base content on those and mark as "gathered"
- If no source materials, infer reasonable content and mark as "inferred"
- NEVER hallucinate specific data, statistics, or quotes unless they appear in gathered materials
- For inferred content, use placeholder language: "[Insert specific data]" or "Based on [topic], consider showing..."
- Speaker notes should include transition phrases and key emphasis points
- Confidence: "high" if substantial context, "medium" if some, "low" if mostly inferred

Return ONLY the JSON object.`;

export function buildSlideDeckPrompt(
  record: CalendarEventRecord,
  materials: SlideMaterial[],
  kind: PresentationKind,
  topicSignals: string[],
): string {
  const parts = [
    `Presentation: ${record.title}`,
    `Presentation Type: ${kind.replace(/_/g, " ")}`,
    `Date/Time: ${record.startAt} to ${record.endAt}`,
  ];

  if (record.description) parts.push(`Description: ${record.description}`);
  if (record.location) parts.push(`Venue/Location: ${record.location}`);
  if (record.attendees?.length) parts.push(`Audience/Attendees: ${record.attendees.join(", ")}`);

  if (topicSignals.length > 1) {
    parts.push(`\nTopic signals: ${topicSignals.slice(0, 5).join("; ")}`);
  }

  if (materials.length > 0) {
    parts.push("\n--- GATHERED MATERIALS ---");
    for (const mat of materials) {
      parts.push(`\n[Source: ${mat.source}]`);
      parts.push(mat.content.slice(0, 2000));
    }
  } else {
    parts.push("\n--- NO EXTERNAL MATERIALS GATHERED ---");
    parts.push("Generate the deck outline based on the title and description only.");
    parts.push("Mark all slides as 'inferred'. Use placeholder language for specific data.");
  }

  return parts.join("\n");
}

// ── Synthesize Slide Deck ────────────────────────────

let clientInstance: Anthropic | null = null;

function getClient(): Anthropic {
  if (!clientInstance) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is required");
    clientInstance = new Anthropic({ apiKey });
  }
  return clientInstance;
}

export function setSlideDeckClient(client: Anthropic | null): void {
  clientInstance = client;
}

export async function synthesizeSlideDeck(
  record: CalendarEventRecord,
  pipelineRunId: string,
  stepOutputs: Record<string, unknown>,
): Promise<Artifact> {
  const client = getClient();

  const kind = detectPresentationKind(record.title, record.description);
  const topicSignals = extractTopicSignals(record);
  const materials = aggregateSlideMaterials(record, stepOutputs);
  const prompt = buildSlideDeckPrompt(record, materials, kind, topicSignals);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: SLIDE_DECK_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text for slide deck synthesis");
  }

  let parsed: SlideDeckData;
  try {
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse slide deck response: ${textBlock.text.slice(0, 200)}`);
  }

  // Convert slides to artifact sections
  const sections: ArtifactSection[] = [];

  // Deck overview section
  sections.push({
    heading: "Deck Overview",
    body: `${parsed.summary}\n\nPresentation type: ${parsed.presentationKind?.replace(/_/g, " ") ?? kind}\nTotal slides: ${parsed.totalSlides ?? parsed.slides.length}`,
  });

  // Each slide as a section
  for (const slide of parsed.slides) {
    const items: string[] = [];

    if (slide.keyPoints?.length) {
      items.push("KEY POINTS:");
      items.push(...slide.keyPoints.map((p) => `  • ${p}`));
    }

    if (slide.talkingPoints?.length) {
      items.push("TALKING POINTS:");
      items.push(...slide.talkingPoints.map((p) => `  → ${p}`));
    }

    if (slide.suggestedVisual) {
      items.push(`VISUAL: ${slide.suggestedVisual}`);
    }

    const heading = slide.sourceType === "inferred"
      ? `Slide ${slide.slideNumber}: ${slide.title} [Inferred]`
      : `Slide ${slide.slideNumber}: ${slide.title}`;

    sections.push({
      heading,
      body: slide.speakerNotes ?? undefined,
      items,
    });
  }

  // Source notes
  if (parsed.sourceNotes) {
    sections.push({
      heading: "Source Notes",
      body: parsed.sourceNotes,
    });
  }

  // Build sources list
  const sources = materials
    .filter((m) => m.type !== "event_context")
    .map((m) => m.url ?? m.source);

  const now = new Date().toISOString();
  const artifact: Artifact = {
    id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    eventRecordId: record.id,
    pipelineRunId,
    type: "slide_content",
    title: parsed.deckTitle ?? `Slide Deck: ${record.title}`,
    summary: parsed.summary,
    content: { sections },
    sources,
    confidence: parsed.confidence ?? "medium",
    stale: false,
    createdAt: now,
  };

  return validateOrThrow(ArtifactSchema, artifact);
}
