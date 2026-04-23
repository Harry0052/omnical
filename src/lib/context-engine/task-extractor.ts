// ── Task Extractor ──────────────────────────────────
// Identifies actionable tasks from emails, notes, and messages
// and converts them into structured tasks.

import Anthropic from "@anthropic-ai/sdk";
import type { GmailMessage } from "../integrations/gmail";
import type { ExtractedTask, ItemSource } from "./types";

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

// ── Extraction Prompt ───────────────────────────────

const TASK_EXTRACTION_SYSTEM_PROMPT = `You are a task extraction system. Analyze the given content and extract any actionable tasks.

Return ONLY valid JSON:
{
  "tasks": [
    {
      "title": "Clear, actionable task title (imperative verb + object)",
      "dueDate": "ISO datetime if inferable, or null",
      "priority": "high" | "medium" | "low",
      "confidence": 0.0-1.0
    }
  ]
}

Rules:
- Only extract real, actionable tasks (things that need to be done)
- Do NOT extract informational statements or FYI items
- Task titles should be clear and start with a verb (Send, Review, Submit, etc.)
- Only set dueDate if there's a clear deadline mentioned
- Set priority based on urgency and importance signals
- Set confidence based on how clearly the task was stated
- If no tasks are found, return {"tasks": []}
- Maximum 5 tasks per source item`;

// ── Extract Tasks from Email ────────────────────────

export async function extractTasksFromEmail(
  userId: string,
  email: GmailMessage,
): Promise<ExtractedTask[]> {
  const client = getClient();

  const prompt = [
    `Subject: ${email.subject}`,
    `From: ${email.from}`,
    `Date: ${email.date}`,
    `Content: ${email.snippet}`,
    email.body ? `\nFull body:\n${email.body.slice(0, 2000)}` : "",
  ].filter(Boolean).join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: TASK_EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return [];

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    const parsed = JSON.parse(jsonStr) as {
      tasks: Array<{
        title: string;
        dueDate?: string | null;
        priority: "high" | "medium" | "low";
        confidence: number;
      }>;
    };

    const now = new Date().toISOString();

    return parsed.tasks.map((task) => ({
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId,
      title: task.title,
      source: "gmail" as ItemSource,
      sourceId: email.id,
      sourceSnippet: `${email.subject} — from ${email.from}`,
      dueDate: task.dueDate ?? undefined,
      priority: task.priority,
      status: "pending" as const,
      confidence: Math.max(0, Math.min(1, task.confidence)),
      createdAt: now,
      updatedAt: now,
    }));
  } catch (err) {
    console.error("[context-engine:task-extractor] Failed:", err);
    return [];
  }
}

// ── Extract Tasks from Text ─────────────────────────

export async function extractTasksFromText(
  userId: string,
  text: string,
  source: ItemSource,
  sourceId: string,
  sourceSnippet: string,
): Promise<ExtractedTask[]> {
  const client = getClient();

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: TASK_EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: text.slice(0, 3000) }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return [];

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    const parsed = JSON.parse(jsonStr) as {
      tasks: Array<{
        title: string;
        dueDate?: string | null;
        priority: "high" | "medium" | "low";
        confidence: number;
      }>;
    };

    const now = new Date().toISOString();

    return parsed.tasks.map((task) => ({
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId,
      title: task.title,
      source,
      sourceId,
      sourceSnippet,
      dueDate: task.dueDate ?? undefined,
      priority: task.priority,
      status: "pending" as const,
      confidence: Math.max(0, Math.min(1, task.confidence)),
      createdAt: now,
      updatedAt: now,
    }));
  } catch (err) {
    console.error("[context-engine:task-extractor] Failed:", err);
    return [];
  }
}
