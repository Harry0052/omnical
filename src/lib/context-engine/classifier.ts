// ── Context Engine Classifier ────────────────────────
// Claude-powered classification for incoming items (emails, messages).
// Evaluates each item and routes to categories with structured JSON output.

import Anthropic from "@anthropic-ai/sdk";
import type { GmailMessage } from "../integrations/gmail";
import type {
  EmailClassification,
  ItemCategory,
  EmailValueTier,
  ProtectedCategory,
  RecommendedAction,
} from "./types";

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

// ── Classification Prompt ───────────────────────────

const EMAIL_CLASSIFICATION_SYSTEM_PROMPT = `You are a background email intelligence system. Classify incoming emails to help the user manage information overload.

For each email, determine:
1. Value tier: how important is this email?
2. Categories: what kind of content is it?
3. Protected categories: does it contain protected content that should never be auto-deleted?
4. Priority and actionability scores
5. Time sensitivity
6. Recommended action

Return ONLY valid JSON matching this exact schema:

{
  "valueTier": "high" | "mid" | "low" | "noise",
  "categories": ["urgent", "action_required", "calendar_related", "follow_up", "reference", "low_priority", "noise"],
  "protectedCategories": [],
  "priorityScore": 0-100,
  "actionabilityScore": 0-100,
  "timeSensitivity": "immediate" | "today" | "this_week" | "low" | "none",
  "recommendedAction": "surface_now" | "surface_before_event" | "archive" | "trash" | "label" | "extract_task" | "link_to_event" | "ignore",
  "summary": "1-2 sentence summary of what this email is about and why it matters (or doesn't)",
  "confidence": 0.0-1.0,
  "relatedEventId": null or "event ID if this relates to a calendar event"
}

VALUE TIER RULES:
- "high": Financial, security, travel, legal, account-related, human conversation, hiring, school, invoices, receipts, contracts, calendar-related, direct messages from known contacts
- "mid": Informational, newsletters you subscribed to, reference material, updates from services you use
- "low": Promotional, mass marketing, cold outreach, social media notifications
- "noise": Spam, repetitive automated notifications, old promotional blasts

PROTECTED CATEGORIES (never auto-delete):
- "financial": bank, payment, transaction, invoice, receipt
- "security": password reset, 2FA, login alert, security notice
- "travel": flight, hotel, booking, itinerary, travel confirmation
- "legal": legal notice, terms update, compliance, subpoena
- "account_related": account creation, subscription, service notice
- "hiring": job application, interview, offer letter
- "school": academic, grades, enrollment, assignment
- "invoice": billing, invoice, payment due
- "receipt": purchase confirmation, order receipt
- "contract": agreement, contract, NDA
- "calendar_related": meeting invite, event update, RSVP
- "starred": user marked as important
- "important": Gmail importance markers

RECOMMENDED ACTION:
- "surface_now": urgent, time-sensitive, requires immediate attention
- "surface_before_event": related to upcoming event, show in event brief
- "archive": low value, read or not needed, safe to archive
- "trash": noise/spam, safe for trash (only with high confidence)
- "label": categorize for organization
- "extract_task": contains actionable task/request
- "link_to_event": relates to a calendar event
- "ignore": no action needed

Return ONLY the JSON object.`;

// ── Classify Email ──────────────────────────────────

export async function classifyEmail(
  userId: string,
  email: GmailMessage,
  upcomingEventTitles: string[] = [],
): Promise<EmailClassification> {
  const client = getClient();

  const prompt = [
    `Subject: ${email.subject}`,
    `From: ${email.from}`,
    `To: ${email.to}`,
    `Date: ${email.date}`,
    `Snippet: ${email.snippet}`,
    `Labels: ${email.labels.join(", ")}`,
  ];

  if (upcomingEventTitles.length > 0) {
    prompt.push(`\nUpcoming calendar events: ${upcomingEventTitles.slice(0, 10).join("; ")}`);
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: EMAIL_CLASSIFICATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt.join("\n") }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude returned no text for email classification");
    }

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    const parsed = JSON.parse(jsonStr) as {
      valueTier: EmailValueTier;
      categories: ItemCategory[];
      protectedCategories: ProtectedCategory[];
      priorityScore: number;
      actionabilityScore: number;
      timeSensitivity: "immediate" | "today" | "this_week" | "low" | "none";
      recommendedAction: RecommendedAction;
      summary: string;
      confidence: number;
      relatedEventId?: string | null;
    };

    const now = new Date().toISOString();
    const isProtected = parsed.protectedCategories.length > 0;

    return {
      id: `ec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      emailId: email.id,
      userId,
      subject: email.subject,
      from: email.from,
      date: email.date,
      valueTier: parsed.valueTier,
      categories: parsed.categories,
      protectedCategories: parsed.protectedCategories,
      isProtected,
      priorityScore: Math.max(0, Math.min(100, parsed.priorityScore)),
      actionabilityScore: Math.max(0, Math.min(100, parsed.actionabilityScore)),
      timeSensitivity: parsed.timeSensitivity,
      recommendedAction: isProtected && parsed.recommendedAction === "trash" ? "archive" : parsed.recommendedAction,
      summary: parsed.summary,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      relatedEventId: parsed.relatedEventId ?? undefined,
      classifiedAt: now,
    };
  } catch (err) {
    // Graceful degradation: return safe defaults on model failure
    console.error("[context-engine:classifier] Email classification failed:", err);
    return {
      id: `ec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      emailId: email.id,
      userId,
      subject: email.subject,
      from: email.from,
      date: email.date,
      valueTier: "mid",
      categories: ["reference"],
      protectedCategories: [],
      isProtected: false,
      priorityScore: 50,
      actionabilityScore: 30,
      timeSensitivity: "low",
      recommendedAction: "label",
      summary: `Email from ${email.from}: ${email.subject}`,
      confidence: 0.3,
      classifiedAt: new Date().toISOString(),
    };
  }
}

// ── Batch Classification ────────────────────────────

export async function classifyEmails(
  userId: string,
  emails: GmailMessage[],
  upcomingEventTitles: string[] = [],
): Promise<EmailClassification[]> {
  const results: EmailClassification[] = [];

  // Process sequentially to respect rate limits
  for (const email of emails) {
    const classification = await classifyEmail(userId, email, upcomingEventTitles);
    results.push(classification);
  }

  return results;
}
