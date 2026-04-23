// ── Event Brief Generator ───────────────────────────
// Creates contextual "event briefs" that gather all related
// information for an upcoming event into a single view.

import Anthropic from "@anthropic-ai/sdk";
import type { SyncedCalendarEvent } from "../schema";
import type { EventBrief, ExtractedTask } from "./types";
import { isConnected } from "../integrations";

// ── Claude Client ───────────────────────────────────

let clientInstance: Anthropic | null = null;

function getClient(): Anthropic {
  if (!clientInstance) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is required");
    clientInstance = new Anthropic({ apiKey });
  }
  return clientInstance;
}

// ── Brief Generation ────────────────────────────────

const BRIEF_SYSTEM_PROMPT = `You are a calendar intelligence system that creates event preparation briefs.

Given an upcoming calendar event and related context (emails, tasks, etc.), create a concise brief that helps the user prepare.

Return ONLY valid JSON:
{
  "summary": "2-3 sentence overview of what this event is about and what the user should know",
  "preparationSuggestions": [
    "Specific, actionable preparation steps"
  ]
}

Rules:
- Be concise and specific
- Focus on actionable preparation, not generic advice
- Reference specific emails/tasks/people when relevant
- If context is limited, say so honestly
- Maximum 5 preparation suggestions
- Never fabricate names, dates, or facts not in the provided context`;

export async function generateEventBrief(
  userId: string,
  event: SyncedCalendarEvent,
  relatedEmails: Array<{ id: string; subject: string; from: string; date: string; snippet: string }>,
  relatedTasks: ExtractedTask[],
): Promise<EventBrief> {
  const client = getClient();

  const contextParts = [
    `Event: ${event.title}`,
    `Date: ${event.startTime} to ${event.endTime}`,
    event.description ? `Description: ${event.description}` : "",
    event.location ? `Location: ${event.location}` : "",
    event.attendees.length > 0 ? `Attendees: ${event.attendees.map((a) => `${a.name}${a.email ? ` (${a.email})` : ""}`).join(", ")}` : "",
  ].filter(Boolean);

  if (relatedEmails.length > 0) {
    contextParts.push("\nRelated emails:");
    for (const email of relatedEmails.slice(0, 10)) {
      contextParts.push(`  - "${email.subject}" from ${email.from} (${email.date}): ${email.snippet}`);
    }
  }

  if (relatedTasks.length > 0) {
    contextParts.push("\nRelated tasks:");
    for (const task of relatedTasks.slice(0, 10)) {
      contextParts.push(`  - [${task.status}] ${task.title}${task.dueDate ? ` (due: ${task.dueDate})` : ""}`);
    }
  }

  let summary = `Upcoming event: ${event.title}`;
  let preparationSuggestions: string[] = [];

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: BRIEF_SYSTEM_PROMPT,
      messages: [{ role: "user", content: contextParts.join("\n") }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (textBlock && textBlock.type === "text") {
      let jsonStr = textBlock.text.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      }
      const parsed = JSON.parse(jsonStr) as {
        summary: string;
        preparationSuggestions: string[];
      };
      summary = parsed.summary;
      preparationSuggestions = parsed.preparationSuggestions;
    }
  } catch (err) {
    console.error("[context-engine:event-brief] Brief generation failed:", err);
    preparationSuggestions = ["Review the event details and any related emails before attending"];
  }

  // Build people context
  const peopleContext = event.attendees.map((a) => ({
    name: a.name,
    email: a.email,
    recentInteractions: relatedEmails.filter((e) =>
      e.from.includes(a.email ?? "") || e.from.includes(a.name)
    ).length,
    lastInteraction: relatedEmails
      .filter((e) => e.from.includes(a.email ?? "") || e.from.includes(a.name))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date,
  }));

  // Extract links from event description
  const relatedLinks: string[] = [];
  if (event.description) {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
    const matches = event.description.match(urlRegex);
    if (matches) relatedLinks.push(...matches);
  }

  const now = new Date().toISOString();

  return {
    id: `brief-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId,
    eventId: event.id,
    eventTitle: event.title,
    eventStartAt: event.startTime,
    relatedEmails,
    relatedTasks: relatedTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate,
    })),
    relatedNotes: [],
    relatedLinks,
    peopleContext,
    preparationSuggestions,
    summary,
    generatedAt: now,
  };
}
