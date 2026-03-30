// ── Zoom Notes Workflow ──────────────────────────────
// Detects Zoom/Meet/Teams meetings and produces structured notes.
//
// Architecture:
//   - Meeting platform detection (Zoom, Google Meet, Teams, etc.)
//   - Live capture interface (pluggable, not yet connected)
//   - Pre-meeting prep notes (always available)
//   - Post-meeting notes synthesis (when live capture is available)
//   - Honest "integration unavailable" states
//
// The live capture integration does not exist yet. This module
// builds the correct architecture so it can plug in later without
// restructuring anything.

import Anthropic from "@anthropic-ai/sdk";
import type {
  CalendarEventRecord,
  Artifact,
  ArtifactSection,
  IntegrationContext,
  ActionStep,
} from "../types";
import { ArtifactSchema, validateOrThrow } from "../validation";

// ── Meeting Platform Detection ───────────────────────

export type MeetingPlatform = "zoom" | "google_meet" | "microsoft_teams" | "webex" | "unknown";

export interface MeetingLink {
  platform: MeetingPlatform;
  url: string;
  meetingId?: string;
}

const PLATFORM_PATTERNS: Array<{
  platform: MeetingPlatform;
  urlPattern: RegExp;
  titlePattern: RegExp;
  extractId?: (url: string) => string | undefined;
}> = [
  {
    platform: "zoom",
    urlPattern: /https?:\/\/[\w.-]*zoom\.us\/j\/(\d+)/i,
    titlePattern: /\bzoom\b/i,
    extractId: (url) => url.match(/\/j\/(\d+)/)?.[1],
  },
  {
    platform: "google_meet",
    urlPattern: /https?:\/\/meet\.google\.com\/[\w-]+/i,
    titlePattern: /\bgoogle\s*meet\b/i,
    extractId: (url) => url.match(/meet\.google\.com\/([\w-]+)/)?.[1],
  },
  {
    platform: "microsoft_teams",
    urlPattern: /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\//i,
    titlePattern: /\b(teams|microsoft teams)\b/i,
  },
  {
    platform: "webex",
    urlPattern: /https?:\/\/[\w.-]*webex\.com\//i,
    titlePattern: /\bwebex\b/i,
  },
];

export function detectMeetingPlatform(
  title: string,
  description?: string,
  location?: string,
  links?: string[],
): MeetingLink | null {
  const allText = [title, description, location, ...(links ?? [])].filter(Boolean);
  const allUrls = links ?? [];

  // Also extract URLs from description and location
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
  for (const text of [description, location]) {
    if (text) {
      const found = text.match(urlPattern);
      if (found) allUrls.push(...found);
    }
  }

  // Check URLs first (most reliable)
  for (const url of allUrls) {
    for (const { platform, urlPattern: pattern, extractId } of PLATFORM_PATTERNS) {
      if (pattern.test(url)) {
        return {
          platform,
          url,
          meetingId: extractId?.(url),
        };
      }
    }
  }

  // Fall back to title/description keyword matching
  const searchText = allText.join(" ");
  for (const { platform, titlePattern } of PLATFORM_PATTERNS) {
    if (titlePattern.test(searchText)) {
      return { platform, url: "" };
    }
  }

  return null;
}

export function isMeetingEvent(record: CalendarEventRecord): boolean {
  return detectMeetingPlatform(
    record.title,
    record.description,
    record.location,
    record.links,
  ) !== null;
}

// ── Live Capture Interface ───────────────────────────
// This interface defines the contract for a real-time meeting
// capture integration. Implementations can be plugged in later.

export type CaptureStatus =
  | "not_available"    // Integration not connected
  | "scheduled"        // Will capture when meeting starts
  | "capturing"        // Actively capturing
  | "completed"        // Capture finished, transcript available
  | "failed";          // Capture attempted but failed

export interface LiveCaptureResult {
  status: CaptureStatus;
  transcript?: string;
  timestamps?: Array<{ time: string; text: string }>;
  speakers?: string[];
  duration?: number; // seconds
  error?: string;
}

export interface ILiveCaptureProvider {
  readonly platform: MeetingPlatform;
  readonly isAvailable: boolean;
  canCapture(meetingLink: MeetingLink): Promise<boolean>;
  startCapture(meetingLink: MeetingLink): Promise<string>; // returns capture session ID
  getStatus(sessionId: string): Promise<CaptureStatus>;
  getResult(sessionId: string): Promise<LiveCaptureResult>;
}

// ── Stub Provider (not yet connected) ────────────────

export class StubCaptureProvider implements ILiveCaptureProvider {
  readonly platform: MeetingPlatform;
  readonly isAvailable = false;

  constructor(platform: MeetingPlatform) {
    this.platform = platform;
  }

  async canCapture(_meetingLink: MeetingLink): Promise<boolean> {
    return false;
  }

  async startCapture(_meetingLink: MeetingLink): Promise<string> {
    throw new Error(`Live capture for ${this.platform} is not yet available. The system will generate prep notes instead.`);
  }

  async getStatus(_sessionId: string): Promise<CaptureStatus> {
    return "not_available";
  }

  async getResult(_sessionId: string): Promise<LiveCaptureResult> {
    return {
      status: "not_available",
      error: `${this.platform} live capture integration is not yet connected.`,
    };
  }
}

// ── Provider Registry ────────────────────────────────

const captureProviders = new Map<MeetingPlatform, ILiveCaptureProvider>([
  ["zoom", new StubCaptureProvider("zoom")],
  ["google_meet", new StubCaptureProvider("google_meet")],
  ["microsoft_teams", new StubCaptureProvider("microsoft_teams")],
  ["webex", new StubCaptureProvider("webex")],
]);

export function getCaptureProvider(platform: MeetingPlatform): ILiveCaptureProvider {
  return captureProviders.get(platform) ?? new StubCaptureProvider(platform);
}

export function registerCaptureProvider(provider: ILiveCaptureProvider): void {
  captureProviders.set(provider.platform, provider);
}

export function isCaptureAvailable(platform: MeetingPlatform): boolean {
  const provider = captureProviders.get(platform);
  return provider?.isAvailable ?? false;
}

// ── Notes Data Contract ──────────────────────────────

export interface ZoomNotesData {
  title: string;
  summary: string;
  platform: string;
  captureStatus: CaptureStatus;
  sections: ZoomNotesSection[];
  confidence: "high" | "medium" | "low";
}

interface ZoomNotesSection {
  heading: string;
  body?: string;
  items?: string[];
}

// ── Step Builder ─────────────────────────────────────

export function buildZoomNoteSteps(
  record: CalendarEventRecord,
  meetingLink: MeetingLink | null,
  context: IntegrationContext,
): ActionStep[] {
  const steps: ActionStep[] = [];
  const captureAvailable = meetingLink
    ? isCaptureAvailable(meetingLink.platform)
    : false;

  // Step 1: Search email for meeting agenda/context
  if (context.gmailConnected) {
    steps.push({
      id: "fetch-email-context",
      type: "integration_fetch",
      description: "Search email for meeting agenda and prior context",
      input: {
        type: "gmail",
        query: record.title,
        attendees: record.attendees,
      },
      status: "pending",
    });
  }

  // Step 2: Search Slack for discussion threads
  if (context.slackConnected) {
    steps.push({
      id: "fetch-slack-context",
      type: "integration_fetch",
      description: "Search Slack for related discussions",
      input: {
        type: "slack",
        query: record.title,
      },
      status: "pending",
    });
  }

  // Step 3: If live capture is available, add capture step
  if (captureAvailable && meetingLink) {
    steps.push({
      id: "live-capture",
      type: "integration_fetch",
      description: `Capture live notes from ${meetingLink.platform} meeting`,
      input: {
        type: "live_capture",
        platform: meetingLink.platform,
        meetingId: meetingLink.meetingId,
        url: meetingLink.url,
      },
      status: "pending",
    });
  }

  // Step 4: Generate notes (depends on all prior context)
  const priorIds = steps.map((s) => s.id);
  steps.push({
    id: "generate-notes",
    type: "claude_generate",
    description: captureAvailable
      ? "Synthesize meeting notes from live capture and context"
      : "Generate pre-meeting prep notes from available context",
    input: {
      prompt: "zoom_notes",
      eventTitle: record.title,
      eventDescription: record.description,
      attendees: record.attendees,
      platform: meetingLink?.platform ?? "unknown",
      captureAvailable,
    },
    dependsOn: priorIds.length > 0 ? priorIds : undefined,
    status: "pending",
  });

  // Step 5: Create artifact
  steps.push({
    id: "create-artifact",
    type: "artifact_create",
    description: "Create meeting notes artifact",
    input: { artifactType: "notes" },
    dependsOn: ["generate-notes"],
    status: "pending",
  });

  return steps;
}

// ── Synthesis Prompt ─────────────────────────────────

export const ZOOM_NOTES_SYSTEM_PROMPT = `You are an AI meeting assistant creating structured notes for a meeting.

Return ONLY valid JSON matching this schema:

{
  "title": "Meeting Notes: [Meeting Title]",
  "summary": "2-3 sentence summary of the meeting purpose and key context",
  "platform": "zoom" or "google_meet" or "microsoft_teams" or "webex" or "unknown",
  "captureStatus": "not_available" or "completed",
  "sections": [
    {
      "heading": "Section Title",
      "body": "Optional paragraph text",
      "items": ["Bullet point 1", "Bullet point 2"]
    }
  ],
  "confidence": "high" or "medium" or "low"
}

REQUIRED SECTIONS:

If live capture transcript IS available:
1. "Meeting Summary" — concise overview of what was discussed
2. "Key Discussion Points" — main topics covered with details
3. "Decisions Made" — any decisions reached during the meeting
4. "Action Items" — specific tasks assigned, with owners if identifiable
5. "Follow-ups" — next steps, follow-up meetings, deadlines mentioned
6. "Raw Notes" — condensed version of key quotes or moments

If live capture IS NOT available (prep mode):
1. "Meeting Overview" — what this meeting is about based on available context
2. "Agenda & Topics" — likely discussion topics based on title, description, and gathered context
3. "Key Questions" — questions to ask or topics to raise
4. "Talking Points" — prepared talking points based on prior discussions
5. "Action Items to Review" — outstanding items from prior meetings if found
6. "Follow-up Prep" — what to prepare for potential follow-ups
7. "Integration Status" — note that live capture is not yet connected

RULES:
- If live capture data is available, prioritize it over inferred content
- If no live capture, be transparent: label the notes as "Pre-meeting Prep" in the title
- Never fabricate meeting content that wasn't captured or gathered
- Confidence: "high" if transcript available, "medium" if good context from email/Slack, "low" if minimal context
- For prep notes, use phrases like "Based on the meeting title..." or "Prior email threads suggest..."

Return ONLY the JSON object.`;

export function buildZoomNotesPrompt(
  record: CalendarEventRecord,
  meetingLink: MeetingLink | null,
  stepOutputs: Record<string, unknown>,
  captureAvailable: boolean,
): string {
  const parts = [
    `Meeting: ${record.title}`,
    `Platform: ${meetingLink?.platform ?? "unknown"}`,
    `Date/Time: ${record.startAt} to ${record.endAt}`,
    `Live Capture Available: ${captureAvailable ? "Yes" : "No — generate prep notes instead"}`,
  ];

  if (record.description) parts.push(`Description: ${record.description}`);
  if (record.location) parts.push(`Location: ${record.location}`);
  if (record.attendees?.length) parts.push(`Attendees: ${record.attendees.join(", ")}`);
  if (meetingLink?.url) parts.push(`Meeting Link: ${meetingLink.url}`);
  if (meetingLink?.meetingId) parts.push(`Meeting ID: ${meetingLink.meetingId}`);

  // Gathered context
  const contextParts: string[] = [];
  for (const [stepId, output] of Object.entries(stepOutputs)) {
    const out = output as Record<string, unknown>;

    if (out.source === "gmail" && out.messages) {
      const messages = out.messages as Array<{ subject?: string; snippet?: string }>;
      for (const m of messages) {
        contextParts.push(`[Email: ${m.subject}] ${m.snippet}`);
      }
    }

    if (out.source === "slack" && out.messages) {
      const messages = out.messages as Array<{ text?: string; channel?: string; user?: string }>;
      for (const m of messages) {
        contextParts.push(`[Slack #${m.channel}: ${m.user}] ${m.text}`);
      }
    }

    // Live capture transcript
    if (stepId === "live-capture" && out.transcript) {
      parts.push("\n--- LIVE CAPTURE TRANSCRIPT ---");
      parts.push(String(out.transcript));
    }

    if (out.generatedContent) {
      contextParts.push(`[AI Context] ${String(out.generatedContent).slice(0, 1000)}`);
    }
  }

  if (contextParts.length > 0) {
    parts.push("\n--- GATHERED CONTEXT ---");
    parts.push(...contextParts);
  } else {
    parts.push("\n--- NO EXTERNAL CONTEXT GATHERED ---");
    parts.push("Generate prep notes based on the meeting title and description only.");
  }

  return parts.join("\n");
}

// ── Synthesize Zoom Notes ────────────────────────────

let clientInstance: Anthropic | null = null;

function getClient(): Anthropic {
  if (!clientInstance) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is required");
    clientInstance = new Anthropic({ apiKey });
  }
  return clientInstance;
}

export function setZoomNotesClient(client: Anthropic | null): void {
  clientInstance = client;
}

export async function synthesizeZoomNotes(
  record: CalendarEventRecord,
  pipelineRunId: string,
  stepOutputs: Record<string, unknown>,
): Promise<Artifact> {
  const client = getClient();

  const meetingLink = detectMeetingPlatform(
    record.title, record.description, record.location, record.links,
  );
  const captureAvailable = meetingLink ? isCaptureAvailable(meetingLink.platform) : false;

  const prompt = buildZoomNotesPrompt(record, meetingLink, stepOutputs, captureAvailable);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: ZOOM_NOTES_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text for zoom notes synthesis");
  }

  let parsed: ZoomNotesData;
  try {
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse zoom notes response: ${textBlock.text.slice(0, 200)}`);
  }

  // Build artifact sections
  const sections: ArtifactSection[] = parsed.sections.map((s) => ({
    heading: s.heading,
    body: s.body,
    items: s.items,
  }));

  // Add integration status section if capture wasn't available
  if (!captureAvailable) {
    sections.push({
      heading: "Integration Status",
      body: meetingLink
        ? `Live note capture for ${meetingLink.platform} is not yet connected. These are pre-meeting prep notes generated from available context. Connect the ${meetingLink.platform} integration to enable automatic live capture in future meetings.`
        : "No meeting platform detected. These are general meeting prep notes.",
    });
  }

  // Build sources
  const sources: string[] = [];
  if (meetingLink?.url) sources.push(meetingLink.url);
  for (const [, output] of Object.entries(stepOutputs)) {
    const out = output as Record<string, unknown>;
    if (out.source) sources.push(String(out.source));
  }

  const now = new Date().toISOString();
  const artifact: Artifact = {
    id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    eventRecordId: record.id,
    pipelineRunId,
    type: "notes",
    title: captureAvailable ? parsed.title : `Pre-meeting Prep: ${record.title}`,
    summary: parsed.summary,
    content: { sections },
    sources,
    confidence: parsed.confidence ?? (captureAvailable ? "high" : "medium"),
    stale: false,
    createdAt: now,
  };

  return validateOrThrow(ArtifactSchema, artifact);
}
