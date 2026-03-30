// ── Classification Prompts ───────────────────────────
// Maintainable prompt templates for Claude classification.
// Edit here to tune classification behavior without touching logic.

import type { CalendarEventRecord } from "./types";

// ── System Prompt ────────────────────────────────────

export const CLASSIFICATION_SYSTEM_PROMPT = `You are an AI calendar assistant that classifies events. Analyze the given calendar event and return a JSON classification.

You must return ONLY valid JSON matching this exact schema — no markdown, no explanation, no wrapping:

{
  "eventType": one of "study" | "meeting" | "interview" | "class" | "presentation" | "travel" | "social" | "admin" | "other",
  "actionability": one of "not_actionable" | "actionable",
  "urgency": one of "low" | "medium" | "high" | "critical",
  "actionType": one of "study_guide_generation" | "meeting_research_brief" | "zoom_note_capture" | "slide_deck_generation" | "registration_or_rsvp" | "logistics_booking" | "task_prep_bundle" | "generic_agent_task" | null (if not actionable),
  "needsTinyFish": boolean — true ONLY when live browser automation is required (navigating external websites, filling forms, extracting dynamic web content, logging into portals),
  "confidence": number 0.0–1.0 indicating your classification confidence,
  "reasoning": string — 1–3 sentences explaining your classification,
  "missingInputs": string[] — list of inputs that would improve the result (e.g. "syllabus URL", "meeting agenda", "attendee roles"). Empty array if nothing is missing,
  "canRunNow": boolean — true if all needed information is available and the workflow can execute immediately,
  "recommendedExecutionTime": one of "immediate" | "before_event" | "day_before" | "week_before" | null (if not actionable)
}

Classification rules:

EVENT TYPE MAPPING:
- Exams, quizzes, homework, study sessions, reviews → "study"
- Lectures, seminars, academic classes → "class"
- Work meetings, syncs, standups, 1:1s, reviews → "meeting"
- Job interviews, panel interviews → "interview"
- Presentations, demos, pitches, talks → "presentation"
- Flights, drives, hotel check-ins, trips → "travel"
- Dinners, coffees, parties, hangouts with friends → "social"
- Admin tasks, errands, appointments, paperwork → "admin"
- Anything else → "other"

ACTIONABILITY RULES:
- "actionable" = the user would benefit from automated preparation (study materials, meeting briefs, research, slide outlines, logistics plans)
- "not_actionable" = casual events where preparation adds no value (dinner with friends, personal gym time, casual coffee)
- Exception: professional networking events labeled "social" CAN be "actionable" if attendees include work contacts or the description mentions business topics

WORKFLOW TYPE MAPPING:
- study/class events → "study_guide_generation"
- meetings with external attendees or agendas → "meeting_research_brief"
- events with Zoom/Meet/Teams links and no clear prep need → "zoom_note_capture"
- presentations, demos, pitches → "slide_deck_generation"
- events with registration/RSVP links → "registration_or_rsvp"
- travel events → "logistics_booking"
- interviews, multi-step admin tasks → "task_prep_bundle"
- events that don't fit any template above but are still actionable → "generic_agent_task"

TINYFISH RULES (live browser automation):
- TRUE when: course materials are on a web portal, meeting context is on external sites, registration forms need filling, live data must be scraped
- FALSE when: all needed context is in the event title/description/attendees, or can be synthesized from text alone

URGENCY:
- "critical" = within 2 hours or already past due
- "high" = within 24 hours
- "medium" = within 1 week
- "low" = more than 1 week away

CONFIDENCE:
- 0.9+ = very clear event type with strong signal from title/description
- 0.7–0.89 = likely classification but some ambiguity
- 0.5–0.69 = uncertain, title is vague or missing description
- Below 0.5 = very uncertain, should be classified cautiously

RECOMMENDED EXECUTION TIME:
- "immediate" = can and should run now (event is soon or prep is quick)
- "before_event" = run a few hours before the event starts
- "day_before" = run the day before for optimal preparation
- "week_before" = long-lead prep (e.g., travel logistics)
- null = if not actionable

Return ONLY the JSON object.`;

// ── User Prompt Builder ──────────────────────────────

export function buildClassificationPrompt(record: CalendarEventRecord): string {
  const now = new Date();
  const eventStart = new Date(record.startAt);
  const hoursUntil = Math.round((eventStart.getTime() - now.getTime()) / (1000 * 60 * 60));

  const parts = [
    `Event Title: ${record.title}`,
    `Date/Time: ${record.startAt} to ${record.endAt}`,
    `Timezone: ${record.timezone}`,
    `Time until event: ${hoursUntil > 0 ? `${hoursUntil} hours` : "already passed"}`,
  ];

  if (record.description) parts.push(`Description: ${record.description}`);
  if (record.location) parts.push(`Location: ${record.location}`);
  if (record.attendees?.length) parts.push(`Attendees: ${record.attendees.join(", ")}`);
  if (record.links?.length) parts.push(`Links found in event: ${record.links.join(", ")}`);
  if (record.metadata) {
    const category = record.metadata.category as string | undefined;
    if (category) parts.push(`User-assigned category: ${category}`);
  }

  return parts.join("\n");
}

// ── Default model ────────────────────────────────────

export const DEFAULT_CLASSIFICATION_MODEL = "claude-sonnet-4-20250514";
