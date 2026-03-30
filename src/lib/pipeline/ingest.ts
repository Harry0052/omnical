// ── Event Ingestion ──────────────────────────────────
// Normalizes events from different sources into CalendarEventRecord.
// Validates inputs and deduplicates by deterministic ID + externalId.

import type { CalendarEvent } from "../types";
import type { SyncedCalendarEvent } from "../schema";
import type { CalendarEventRecord, EventSource } from "./types";
import { CalendarEventRecordSchema, validateOrThrow } from "./validation";
import { eventRecordStore } from "./index";

// Deterministic ID to prevent duplicates
export function generateRecordId(source: EventSource, title: string, startAt: string): string {
  const raw = `${source}:${title}:${startAt}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `rec-${Math.abs(hash).toString(36)}`;
}

// Extract URLs from text
export function extractLinks(text?: string): string[] {
  if (!text) return [];
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
  return text.match(urlPattern) ?? [];
}

export function ingestFromCalendarEvent(event: CalendarEvent): CalendarEventRecord {
  // Validate required fields
  if (!event.title || !event.date || !event.startTime || !event.endTime) {
    throw new Error("Invalid event: title, date, startTime, and endTime are required");
  }

  const startAt = `${event.date}T${event.startTime}:00`;
  const endAt = `${event.date}T${event.endTime}:00`;
  const source: EventSource = event.source === "google-calendar" ? "google_calendar" : "manual";

  const recordId = generateRecordId(source, event.title, startAt);

  // Check if already ingested (dedup by deterministic ID)
  const existing = eventRecordStore.get(recordId);
  if (existing) return existing;

  const links = [
    ...extractLinks(event.description),
    ...extractLinks(event.location),
    ...extractLinks(event.notes),
  ];

  const now = new Date().toISOString();
  const record: CalendarEventRecord = {
    id: recordId,
    source,
    externalId: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    attendees: event.attendees,
    startAt,
    endAt,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    links: links.length > 0 ? links : undefined,
    metadata: { category: event.category, originalId: event.id },
    status: "new",
    actionability: "unknown",
    createdAt: now,
    updatedAt: now,
  };

  // Validate the normalized record before storing
  validateOrThrow(CalendarEventRecordSchema, record);

  eventRecordStore.upsert(record);
  return record;
}

export function ingestFromSyncedEvent(event: SyncedCalendarEvent): CalendarEventRecord {
  // Validate required fields
  if (!event.title || !event.startTime || !event.endTime || !event.externalId) {
    throw new Error("Invalid synced event: title, startTime, endTime, and externalId are required");
  }

  const recordId = generateRecordId("google_calendar", event.title, event.startTime);

  // Check if already ingested (dedup by deterministic ID)
  const existing = eventRecordStore.get(recordId);
  if (existing) return existing;

  // Also dedup by externalId (Google Calendar event ID)
  const existingByExternal = eventRecordStore.getByExternalId(event.externalId);
  if (existingByExternal) return existingByExternal;

  const links = [
    ...extractLinks(event.description),
    ...extractLinks(event.location),
  ];

  const now = new Date().toISOString();
  const record: CalendarEventRecord = {
    id: recordId,
    source: "google_calendar",
    externalId: event.externalId,
    title: event.title,
    description: event.description,
    location: event.location,
    attendees: event.attendees.map((a) => a.email ?? a.name),
    startAt: event.startTime,
    endAt: event.endTime,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    links: links.length > 0 ? links : undefined,
    metadata: { category: event.category, syncedAt: event.syncedAt },
    status: "new",
    actionability: "unknown",
    createdAt: now,
    updatedAt: now,
  };

  // Validate the normalized record before storing
  validateOrThrow(CalendarEventRecordSchema, record);

  eventRecordStore.upsert(record);
  return record;
}
