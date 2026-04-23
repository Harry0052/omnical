// ── Event Enrichment Layer ───────────────────────────
// Claude-driven enrichment for minimal events.
// Gathers context from connected sources, infers missing details,
// and produces an enriched event record before classification.

import Anthropic from "@anthropic-ai/sdk";
import type { CalendarEventRecord, IntegrationContext } from "./types";
import { eventRecordStore, pipelineStore } from "./index";
import { isConnected } from "../integrations";

// ── Claude Client ────────────────────────────────────

let clientInstance: Anthropic | null = null;

function getClient(): Anthropic {
  if (!clientInstance) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is required");
    clientInstance = new Anthropic({ apiKey });
  }
  return clientInstance;
}

// ── Types ────────────────────────────────────────────

export interface EnrichmentResult {
  /** Inferred or improved description */
  description?: string;
  /** Suggested notes for the event */
  notes?: string;
  /** Inferred event context (what this event is about) */
  inferredContext: string;
  /** Keywords for searching integrations */
  searchQueries: string[];
  /** Whether web research would be useful */
  suggestWebResearch: boolean;
  /** Specific web research suggestion if applicable */
  webResearchSuggestion?: string;
  /** Confidence in the enrichment (0-1) */
  confidence: number;
  /** What additional context would help */
  missingContext: string[];
  /** Gathered integration context */
  gatheredContext: GatheredContext;
}

export interface GatheredContext {
  emails: Array<{ subject: string; from: string; date: string; snippet: string }>;
  slackMessages: Array<{ channel: string; user: string; text: string; timestamp: string }>;
}

// ── Context Gathering ────────────────────────────────

async function gatherContext(
  record: CalendarEventRecord,
  searchQueries: string[],
): Promise<GatheredContext> {
  const userId = "demo-user";
  const result: GatheredContext = { emails: [], slackMessages: [] };

  // Search Gmail if connected
  if (isConnected(userId, "gmail")) {
    try {
      const { searchForEventContext } = await import("../integrations/gmail");
      const messages = await searchForEventContext(
        userId,
        record.title,
        record.attendees ?? [],
      );
      result.emails = messages.map((m) => ({
        subject: m.subject,
        from: m.from,
        date: m.date,
        snippet: m.snippet,
      }));
    } catch (err) {
      console.error("[enrich] Gmail search failed:", err);
    }
  }

  // Search Slack if connected
  if (isConnected(userId, "slack")) {
    try {
      const { searchMessages } = await import("../integrations/slack");
      for (const query of searchQueries.slice(0, 2)) {
        const messages = await searchMessages(userId, query);
        for (const m of messages) {
          if (!result.slackMessages.some((s) => s.timestamp === m.timestamp)) {
            result.slackMessages.push({
              channel: m.channelName,
              user: m.userName,
              text: m.text,
              timestamp: m.timestamp,
            });
          }
        }
      }
    } catch (err) {
      console.error("[enrich] Slack search failed:", err);
    }
  }

  return result;
}

// ── Enrichment Prompt ────────────────────────────────

const ENRICHMENT_SYSTEM_PROMPT = `You are an AI calendar assistant that enriches minimal event entries.

The user may have entered only a short title like "O chem midterm" or "Team standup" with no description or details.

Your job is to:
1. Infer what this event likely is
2. Identify what context would make an automated workflow most useful
3. Generate search queries to find related content in Gmail/Slack
4. Determine if web research would be helpful
5. Provide an enriched context summary

Return ONLY valid JSON:
{
  "description": "A 1-2 sentence enriched description of what this event likely is",
  "notes": "Suggested preparation notes or context that would help the user",
  "inferredContext": "What this event is about, what the user likely needs",
  "searchQueries": ["query1", "query2", "query3"],
  "suggestWebResearch": boolean,
  "webResearchSuggestion": "Specific research task if web research is needed, or null",
  "confidence": 0.0-1.0,
  "missingContext": ["list of things that would improve results"]
}

Rules:
- Keep descriptions factual and inferred, not invented
- Search queries should target Gmail subjects, Slack messages, or calendar context
- suggestWebResearch should be true when additional web-based context would meaningfully improve the output (e.g., finding course materials, research background)
- If the title is very vague, say so in missingContext but still try your best
- Do NOT hallucinate specific dates, professor names, or course numbers unless clearly implied
- Confidence should reflect how much you can infer from just the title`;

function buildEnrichmentPrompt(record: CalendarEventRecord): string {
  const parts = [
    `Event Title: ${record.title}`,
    `Date: ${record.startAt} to ${record.endAt}`,
  ];
  if (record.description) parts.push(`Description: ${record.description}`);
  if (record.location) parts.push(`Location: ${record.location}`);
  if (record.attendees?.length) parts.push(`Attendees: ${record.attendees.join(", ")}`);
  if (record.links?.length) parts.push(`Links: ${record.links.join(", ")}`);

  const isMinimal = !record.description && !record.location && (!record.attendees || record.attendees.length === 0);
  if (isMinimal) {
    parts.push("\nNote: This event has a minimal entry — only a short title was provided. Enrich it as best you can.");
  }

  return parts.join("\n");
}

// ── Main Enrichment Function ────────────────────────

export async function enrichEvent(
  record: CalendarEventRecord,
  runId?: string,
): Promise<EnrichmentResult> {
  const client = getClient();

  // Log enrichment start
  if (runId) {
    pipelineStore.appendLog(runId, {
      timestamp: new Date().toISOString(),
      stage: "classifying",
      message: `Enriching event: ${record.title}`,
      service: "claude",
      label: "Claude is understanding this event",
    });
  }

  // Step 1: Ask Claude to infer context and generate search queries
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: ENRICHMENT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildEnrichmentPrompt(record) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text for enrichment");
  }

  let parsed: Record<string, unknown>;
  try {
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error("[enrich] Failed to parse enrichment JSON:", textBlock.text.slice(0, 200));
    // Return minimal enrichment on parse failure
    return {
      inferredContext: `Event: ${record.title}`,
      searchQueries: [record.title],
      suggestWebResearch: false,
      confidence: 0.3,
      missingContext: ["Could not parse enrichment response"],
      gatheredContext: { emails: [], slackMessages: [] },
    };
  }

  const searchQueries = (parsed.searchQueries as string[]) ?? [record.title];

  // Step 2: Gather context from connected sources using Claude's search queries
  if (runId) {
    pipelineStore.appendLog(runId, {
      timestamp: new Date().toISOString(),
      stage: "classifying",
      message: `Searching connected sources for context`,
      service: "integration",
      label: "Looking for related context",
    });
  }

  const gatheredContext = await gatherContext(record, searchQueries);

  if (runId && gatheredContext.emails.length > 0) {
    pipelineStore.appendLog(runId, {
      timestamp: new Date().toISOString(),
      stage: "classifying",
      message: `Found ${gatheredContext.emails.length} related email(s)`,
      service: "integration",
      label: `Found ${gatheredContext.emails.length} related email(s)`,
    });
  }

  if (runId && gatheredContext.slackMessages.length > 0) {
    pipelineStore.appendLog(runId, {
      timestamp: new Date().toISOString(),
      stage: "classifying",
      message: `Found ${gatheredContext.slackMessages.length} related Slack message(s)`,
      service: "integration",
      label: `Found ${gatheredContext.slackMessages.length} Slack message(s)`,
    });
  }

  // Step 3: Update the event record with enriched data
  const enrichedDescription = parsed.description as string | undefined;
  if (enrichedDescription && !record.description) {
    eventRecordStore.upsert({
      ...record,
      description: enrichedDescription,
      updatedAt: new Date().toISOString(),
    });
  }

  return {
    description: parsed.description as string | undefined,
    notes: parsed.notes as string | undefined,
    inferredContext: (parsed.inferredContext as string) ?? `Event: ${record.title}`,
    searchQueries,
    suggestWebResearch: (parsed.suggestWebResearch as boolean) ?? false,
    webResearchSuggestion: parsed.webResearchSuggestion as string | undefined,
    confidence: (parsed.confidence as number) ?? 0.5,
    missingContext: (parsed.missingContext as string[]) ?? [],
    gatheredContext,
  };
}
