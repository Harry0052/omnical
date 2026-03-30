// ── Artifact Synthesizer ─────────────────────────────
// Generates final artifacts from pipeline step outputs using Claude.

import Anthropic from "@anthropic-ai/sdk";
import type {
  CalendarEventRecord,
  WorkflowType,
  Artifact,
  ArtifactType,
  ArtifactSection,
} from "./types";
import { ArtifactSchema, validateOrThrow } from "./validation";

// ── Workflow to Artifact Type Mapping ────────────────

const WORKFLOW_ARTIFACT_MAP: Record<WorkflowType, ArtifactType> = {
  study_guide_generation: "study_guide",
  meeting_research_brief: "meeting_brief",
  zoom_note_capture: "notes",
  slide_deck_generation: "slide_content",
  registration_or_rsvp: "action_summary",
  logistics_booking: "checklist",
  task_prep_bundle: "research_brief",
  generic_agent_task: "generic_output",
};

// ── Synthesis Prompts ────────────────────────────────

function buildSynthesisPrompt(
  record: CalendarEventRecord,
  workflowType: WorkflowType,
  stepOutputs: Record<string, unknown>,
): string {
  const context = JSON.stringify(stepOutputs, null, 2);

  const promptsByType: Record<WorkflowType, string> = {
    study_guide_generation: `Create a comprehensive study guide for the event "${record.title}".
Include: key concepts, important terms, practice questions, and study tips.
Structure with clear sections and bullet points.`,

    meeting_research_brief: `Create a meeting research brief for "${record.title}".
Include: meeting context, attendee background, key discussion points, suggested talking points, and preparation checklist.`,

    zoom_note_capture: `Create meeting preparation notes for "${record.title}".
Include: agenda items, key topics to discuss, questions to ask, and action items to track.`,

    slide_deck_generation: `Create a slide deck outline for "${record.title}".
Include: slide titles, key points per slide, suggested visuals, speaker notes, and flow recommendations.`,

    registration_or_rsvp: `Create an action summary for "${record.title}".
Include: registration status, required actions, deadlines, and confirmation details.`,

    logistics_booking: `Create a logistics checklist for "${record.title}".
Include: travel details, location info, what to bring, timing, and contingency plans.`,

    task_prep_bundle: `Create a comprehensive preparation bundle for "${record.title}".
Include: background research, key facts, preparation tasks, questions to consider, and relevant context.`,

    generic_agent_task: `Analyze the gathered context for the calendar event "${record.title}" and create the most useful output artifact you can.
Determine what kind of document would best serve the user for this event. Consider whether they need:
- A research brief or summary
- A checklist or action plan
- Key talking points or notes
- A preparation guide
- A task completion summary
Structure the output with clear sections. Be specific and actionable.`,
  };

  return `${promptsByType[workflowType]}

Event Details:
- Title: ${record.title}
- Date/Time: ${record.startAt} to ${record.endAt}
${record.description ? `- Description: ${record.description}` : ""}
${record.location ? `- Location: ${record.location}` : ""}
${record.attendees?.length ? `- Attendees: ${record.attendees.join(", ")}` : ""}

Gathered Context:
${context}

Return ONLY valid JSON in this format:
{
  "title": "artifact title",
  "summary": "1-2 sentence summary",
  "sections": [
    {
      "heading": "Section Title",
      "body": "Optional paragraph text",
      "items": ["Bullet point 1", "Bullet point 2"]
    }
  ],
  "confidence": "high" or "medium" or "low"
}

Create at least 3 sections. Be specific and actionable. Return ONLY the JSON.`;
}

// ── Synthesize ───────────────────────────────────────

let clientInstance: Anthropic | null = null;

function getClient(): Anthropic {
  if (!clientInstance) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is required");
    clientInstance = new Anthropic({ apiKey });
  }
  return clientInstance;
}

interface SynthesisOutput {
  title: string;
  summary: string;
  sections: ArtifactSection[];
  confidence: "high" | "medium" | "low";
}

export async function synthesizeArtifact(
  record: CalendarEventRecord,
  workflowType: WorkflowType,
  pipelineRunId: string,
  stepOutputs: Record<string, unknown>,
  sources: string[],
): Promise<Artifact> {
  const client = getClient();
  const prompt = buildSynthesisPrompt(record, workflowType, stepOutputs);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content for synthesis");
  }

  let parsed: SynthesisOutput;
  try {
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse synthesis response as JSON: ${textBlock.text.slice(0, 200)}`);
  }

  const artifactType = WORKFLOW_ARTIFACT_MAP[workflowType] ?? "research_brief";
  const now = new Date().toISOString();

  const artifact: Artifact = {
    id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    eventRecordId: record.id,
    pipelineRunId,
    type: artifactType,
    title: parsed.title,
    summary: parsed.summary,
    content: { sections: parsed.sections },
    sources,
    confidence: parsed.confidence ?? "medium",
    stale: false,
    createdAt: now,
  };

  return validateOrThrow(ArtifactSchema, artifact);
}
