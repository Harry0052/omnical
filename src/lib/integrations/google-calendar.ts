// ── Google Calendar Service ───────────────────────────
// Real Google Calendar API integration.
// Fetches calendars and events using OAuth access tokens.

import type { SyncedCalendarEvent, EventAttendee } from "@/lib/schema";
import { getValidAccessToken } from "./token-store";

const API_BASE = "https://www.googleapis.com/calendar/v3";

// ── Typed Google Calendar Error ─────────────────────

export type GoogleErrorReason =
  | "accessNotConfigured"
  | "rateLimitExceeded"
  | "authError"
  | "forbidden"
  | "notFound"
  | "unknown";

export class GoogleCalendarError extends Error {
  status: number;
  reason: GoogleErrorReason;

  constructor(status: number, reason: GoogleErrorReason, message: string) {
    super(message);
    this.name = "GoogleCalendarError";
    this.status = status;
    this.reason = reason;
  }
}

function parseGoogleErrorReason(status: number, body: string): GoogleErrorReason {
  try {
    const parsed = JSON.parse(body);
    const reason = parsed?.error?.errors?.[0]?.reason as string | undefined;
    if (reason === "accessNotConfigured") return "accessNotConfigured";
    if (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") return "rateLimitExceeded";
    if (reason === "authError" || reason === "expired" || reason === "invalid") return "authError";
    if (reason === "notFound") return "notFound";
    if (reason === "forbidden" || reason === "insufficientPermissions") return "forbidden";
  } catch {
    // Body was not JSON — fall through
  }
  if (status === 401) return "authError";
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 429) return "rateLimitExceeded";
  return "unknown";
}

async function googleFetch(path: string, accessToken: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const reason = parseGoogleErrorReason(res.status, body);
    throw new GoogleCalendarError(res.status, reason, `Google Calendar API error (${reason}): ${res.status}`);
  }
  return res.json();
}

export interface GoogleCalendarList {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor?: string;
}

export async function listCalendars(
  userId: string
): Promise<GoogleCalendarList[]> {
  const token = await getValidAccessToken(userId, "google-calendar");
  if (!token) throw new Error("Not connected to Google Calendar");

  const data = await googleFetch("/users/me/calendarList", token);
  return (data.items || []).map(
    (cal: { id: string; summary: string; primary?: boolean; backgroundColor?: string }) => ({
      id: cal.id,
      summary: cal.summary,
      primary: !!cal.primary,
      backgroundColor: cal.backgroundColor,
    })
  );
}

export async function listEvents(
  userId: string,
  options: {
    calendarId?: string;
    timeMin?: string; // ISO datetime
    timeMax?: string;
    maxResults?: number;
  } = {}
): Promise<SyncedCalendarEvent[]> {
  const token = await getValidAccessToken(userId, "google-calendar");
  if (!token) throw new Error("Not connected to Google Calendar");

  const calendarId = options.calendarId || "primary";
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(options.maxResults || 50),
  });
  if (options.timeMin) params.set("timeMin", options.timeMin);
  if (options.timeMax) params.set("timeMax", options.timeMax);

  const data = await googleFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    token
  );

  return (data.items || []).map((event: Record<string, unknown>) =>
    mapGoogleEvent(userId, event)
  );
}

export async function getEvent(
  userId: string,
  eventId: string,
  calendarId = "primary"
): Promise<SyncedCalendarEvent> {
  const token = await getValidAccessToken(userId, "google-calendar");
  if (!token) throw new Error("Not connected to Google Calendar");

  const data = await googleFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    token
  );
  return mapGoogleEvent(userId, data);
}

function mapGoogleEvent(
  userId: string,
  event: Record<string, unknown>
): SyncedCalendarEvent {
  const start = event.start as { dateTime?: string; date?: string } | undefined;
  const end = event.end as { dateTime?: string; date?: string } | undefined;
  const attendees = (event.attendees as Array<{ displayName?: string; email?: string; responseStatus?: string }>) || [];

  return {
    id: `gcal-${event.id}`,
    userId,
    externalId: event.id as string,
    source: "google-calendar",
    title: (event.summary as string) || "Untitled Event",
    description: (event.description as string) || undefined,
    startTime: start?.dateTime || start?.date || "",
    endTime: end?.dateTime || end?.date || "",
    location: (event.location as string) || undefined,
    attendees: attendees.map(
      (a): EventAttendee => ({
        name: a.displayName || a.email || "Unknown",
        email: a.email,
        responseStatus: a.responseStatus as EventAttendee["responseStatus"],
      })
    ),
    category: inferCategory(event),
    isAllDay: !start?.dateTime,
    recurrence: Array.isArray(event.recurrence)
      ? (event.recurrence as string[]).join("; ")
      : undefined,
    syncedAt: new Date().toISOString(),
    raw: event,
  };
}

function inferCategory(
  event: Record<string, unknown>
): SyncedCalendarEvent["category"] {
  const title = ((event.summary as string) || "").toLowerCase();
  const desc = ((event.description as string) || "").toLowerCase();
  const text = `${title} ${desc}`;

  if (/exam|midterm|final|quiz|test|study|lecture|class|lab|homework|assignment/i.test(text))
    return "academic";
  if (/gym|workout|yoga|run|exercise|health|doctor|dentist|therapy/i.test(text))
    return "health";
  if (/dinner|lunch|coffee|brunch|drinks|party|hangout|catch.?up|birthday/i.test(text))
    return "social";
  if (/meeting|standup|sync|review|sprint|retro|demo|investor|interview|call/i.test(text))
    return "work";
  return "personal";
}
