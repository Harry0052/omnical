import { describe, it, expect, beforeEach } from "vitest";
import {
  ingestFromCalendarEvent,
  ingestFromSyncedEvent,
  generateRecordId,
  extractLinks,
} from "../ingest";
import { eventRecordStore } from "../index";
import { MemoryEventRecordStore } from "../store";
import type { CalendarEvent } from "../../types";
import type { SyncedCalendarEvent } from "../../schema";

// Reset store before each test by replacing the singleton
// We cast to allow reassignment for testing
function resetStore() {
  const fresh = new MemoryEventRecordStore();
  Object.assign(eventRecordStore, {
    upsert: fresh.upsert.bind(fresh),
    get: fresh.get.bind(fresh),
    getByExternalId: fresh.getByExternalId.bind(fresh),
    list: fresh.list.bind(fresh),
    markStale: fresh.markStale.bind(fresh),
  });
}

// ── Fixtures ─────────────────────────────────────────

const manualEvent: CalendarEvent = {
  id: "evt-manual-1",
  title: "Biology Exam Review",
  date: "2026-03-30",
  startTime: "14:00",
  endTime: "15:30",
  category: "academic",
  description: "Final exam review session. Materials at https://bio101.edu/review",
  location: "Room 204, Science Building",
  attendees: ["Alice", "Bob"],
  notes: "Bring laptop. Also see https://studyguide.com/bio",
  source: "local",
};

const googleEvent: SyncedCalendarEvent = {
  id: "synced-1",
  userId: "demo-user",
  externalId: "gcal-abc-123",
  source: "google-calendar",
  title: "Q1 Board Meeting",
  description: "Quarterly review with stakeholders. Agenda: https://docs.google.com/doc/agenda",
  startTime: "2026-04-01T09:00:00-05:00",
  endTime: "2026-04-01T10:30:00-05:00",
  location: "Zoom: https://zoom.us/j/123456",
  attendees: [
    { name: "Jane Doe", email: "jane@company.com", responseStatus: "accepted" },
    { name: "Bob Smith", email: "bob@company.com", responseStatus: "tentative" },
  ],
  category: "work",
  isAllDay: false,
  syncedAt: "2026-03-26T12:00:00Z",
};

// ── Helper Tests ─────────────────────────────────────

describe("generateRecordId", () => {
  it("produces a deterministic ID from source + title + startAt", () => {
    const id1 = generateRecordId("manual", "Test Event", "2026-03-30T14:00:00");
    const id2 = generateRecordId("manual", "Test Event", "2026-03-30T14:00:00");
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^rec-/);
  });

  it("produces different IDs for different inputs", () => {
    const id1 = generateRecordId("manual", "Event A", "2026-03-30T14:00:00");
    const id2 = generateRecordId("manual", "Event B", "2026-03-30T14:00:00");
    const id3 = generateRecordId("google_calendar", "Event A", "2026-03-30T14:00:00");
    expect(id1).not.toBe(id2);
    expect(id1).not.toBe(id3);
  });
});

describe("extractLinks", () => {
  it("extracts URLs from text", () => {
    const text = "Check out https://example.com and http://test.org/page for details";
    const links = extractLinks(text);
    expect(links).toEqual(["https://example.com", "http://test.org/page"]);
  });

  it("returns empty array for no URLs", () => {
    expect(extractLinks("no urls here")).toEqual([]);
    expect(extractLinks(undefined)).toEqual([]);
    expect(extractLinks("")).toEqual([]);
  });

  it("handles complex URLs", () => {
    const text = "Visit https://zoom.us/j/123456?pwd=abc123 for the meeting";
    const links = extractLinks(text);
    expect(links).toHaveLength(1);
    expect(links[0]).toContain("zoom.us");
  });
});

// ── Manual Event Normalization ───────────────────────

describe("ingestFromCalendarEvent", () => {
  beforeEach(resetStore);

  it("normalizes a manual event into CalendarEventRecord", () => {
    const record = ingestFromCalendarEvent(manualEvent);

    expect(record.id).toMatch(/^rec-/);
    expect(record.source).toBe("manual");
    expect(record.externalId).toBe("evt-manual-1");
    expect(record.title).toBe("Biology Exam Review");
    expect(record.description).toBe(manualEvent.description);
    expect(record.location).toBe("Room 204, Science Building");
    expect(record.attendees).toEqual(["Alice", "Bob"]);
    expect(record.startAt).toBe("2026-03-30T14:00:00");
    expect(record.endAt).toBe("2026-03-30T15:30:00");
    expect(record.timezone).toBeTruthy();
    expect(record.status).toBe("new");
    expect(record.actionability).toBe("unknown");
    expect(record.createdAt).toBeTruthy();
    expect(record.updatedAt).toBeTruthy();
  });

  it("extracts links from description, location, and notes", () => {
    const record = ingestFromCalendarEvent(manualEvent);

    expect(record.links).toBeDefined();
    expect(record.links).toContain("https://bio101.edu/review");
    expect(record.links).toContain("https://studyguide.com/bio");
  });

  it("preserves source metadata", () => {
    const record = ingestFromCalendarEvent(manualEvent);

    expect(record.metadata).toBeDefined();
    expect(record.metadata!.category).toBe("academic");
    expect(record.metadata!.originalId).toBe("evt-manual-1");
  });

  it("maps google-calendar source correctly", () => {
    const gcalEvent: CalendarEvent = {
      ...manualEvent,
      source: "google-calendar",
    };
    const record = ingestFromCalendarEvent(gcalEvent);
    expect(record.source).toBe("google_calendar");
  });

  it("defaults to manual source when source is undefined", () => {
    const noSourceEvent: CalendarEvent = {
      ...manualEvent,
      source: undefined,
    };
    const record = ingestFromCalendarEvent(noSourceEvent);
    expect(record.source).toBe("manual");
  });

  it("handles events with no optional fields", () => {
    const minimal: CalendarEvent = {
      id: "evt-minimal",
      title: "Quick Meeting",
      date: "2026-04-01",
      startTime: "10:00",
      endTime: "10:30",
      category: "work",
    };
    const record = ingestFromCalendarEvent(minimal);

    expect(record.title).toBe("Quick Meeting");
    expect(record.description).toBeUndefined();
    expect(record.location).toBeUndefined();
    expect(record.attendees).toBeUndefined();
    expect(record.links).toBeUndefined();
  });

  it("is stored in eventRecordStore after ingestion", () => {
    const record = ingestFromCalendarEvent(manualEvent);
    const retrieved = eventRecordStore.get(record.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(record.id);
    expect(retrieved!.title).toBe(record.title);
  });
});

// ── Google Calendar Event Normalization ──────────────

describe("ingestFromSyncedEvent", () => {
  beforeEach(resetStore);

  it("normalizes a Google Calendar event into CalendarEventRecord", () => {
    const record = ingestFromSyncedEvent(googleEvent);

    expect(record.id).toMatch(/^rec-/);
    expect(record.source).toBe("google_calendar");
    expect(record.externalId).toBe("gcal-abc-123");
    expect(record.title).toBe("Q1 Board Meeting");
    expect(record.startAt).toBe("2026-04-01T09:00:00-05:00");
    expect(record.endAt).toBe("2026-04-01T10:30:00-05:00");
    expect(record.status).toBe("new");
    expect(record.actionability).toBe("unknown");
  });

  it("extracts attendee emails from EventAttendee objects", () => {
    const record = ingestFromSyncedEvent(googleEvent);

    expect(record.attendees).toEqual(["jane@company.com", "bob@company.com"]);
  });

  it("falls back to attendee name when email is missing", () => {
    const eventWithNameOnly: SyncedCalendarEvent = {
      ...googleEvent,
      attendees: [
        { name: "Charlie", responseStatus: "accepted" },
        { name: "Diana", email: "diana@test.com" },
      ],
    };
    const record = ingestFromSyncedEvent(eventWithNameOnly);
    expect(record.attendees).toEqual(["Charlie", "diana@test.com"]);
  });

  it("extracts links from description and location", () => {
    const record = ingestFromSyncedEvent(googleEvent);

    expect(record.links).toBeDefined();
    expect(record.links).toContain("https://docs.google.com/doc/agenda");
    expect(record.links).toContain("https://zoom.us/j/123456");
  });

  it("preserves sync metadata", () => {
    const record = ingestFromSyncedEvent(googleEvent);

    expect(record.metadata).toBeDefined();
    expect(record.metadata!.category).toBe("work");
    expect(record.metadata!.syncedAt).toBe("2026-03-26T12:00:00Z");
  });
});

// ── Malformed Input Rejection ────────────────────────

describe("malformed input rejection", () => {
  beforeEach(resetStore);

  it("rejects manual event with missing title", () => {
    const badEvent = { ...manualEvent, title: "" };
    expect(() => ingestFromCalendarEvent(badEvent)).toThrow();
  });

  it("rejects manual event with missing date", () => {
    const badEvent = { ...manualEvent, date: "" };
    expect(() => ingestFromCalendarEvent(badEvent)).toThrow();
  });

  it("rejects manual event with missing startTime", () => {
    const badEvent = { ...manualEvent, startTime: "" };
    expect(() => ingestFromCalendarEvent(badEvent)).toThrow();
  });

  it("rejects manual event with missing endTime", () => {
    const badEvent = { ...manualEvent, endTime: "" };
    expect(() => ingestFromCalendarEvent(badEvent)).toThrow();
  });

  it("rejects synced event with missing externalId", () => {
    const badEvent = { ...googleEvent, externalId: "" };
    expect(() => ingestFromSyncedEvent(badEvent)).toThrow();
  });

  it("rejects synced event with missing title", () => {
    const badEvent = { ...googleEvent, title: "" };
    expect(() => ingestFromSyncedEvent(badEvent)).toThrow();
  });
});

// ── Duplicate Event Handling ─────────────────────────

describe("duplicate event handling", () => {
  beforeEach(resetStore);

  it("returns existing record for duplicate manual event (same title + time)", () => {
    const first = ingestFromCalendarEvent(manualEvent);
    const second = ingestFromCalendarEvent(manualEvent);

    expect(first.id).toBe(second.id);
    expect(eventRecordStore.list()).toHaveLength(1);
  });

  it("returns existing record for duplicate synced event (same title + time)", () => {
    const first = ingestFromSyncedEvent(googleEvent);
    const second = ingestFromSyncedEvent(googleEvent);

    expect(first.id).toBe(second.id);
    expect(eventRecordStore.list()).toHaveLength(1);
  });

  it("deduplicates synced events by externalId", () => {
    // First event
    ingestFromSyncedEvent(googleEvent);

    // Same external ID but slightly different title (e.g., user renamed in Google)
    const renamed: SyncedCalendarEvent = {
      ...googleEvent,
      title: "Q1 Board Meeting (Updated)",
    };
    const second = ingestFromSyncedEvent(renamed);

    // Should return the original (dedup by externalId)
    expect(second.title).toBe("Q1 Board Meeting");
    expect(eventRecordStore.list()).toHaveLength(1);
  });

  it("creates separate records for different events", () => {
    ingestFromCalendarEvent(manualEvent);
    ingestFromCalendarEvent({
      ...manualEvent,
      id: "evt-different",
      title: "Chemistry Lab",
      startTime: "16:00",
      endTime: "17:00",
    });

    expect(eventRecordStore.list()).toHaveLength(2);
  });
});

// ── Timezone Correctness ─────────────────────────────

describe("timezone handling", () => {
  beforeEach(resetStore);

  it("sets timezone from the runtime environment for manual events", () => {
    const record = ingestFromCalendarEvent(manualEvent);

    expect(record.timezone).toBeTruthy();
    // Should be a valid IANA timezone string
    expect(record.timezone).toMatch(/^[A-Za-z]+\/[A-Za-z_]+/);
  });

  it("preserves ISO timezone offset in synced event datetimes", () => {
    const record = ingestFromSyncedEvent(googleEvent);

    // The original ISO string with offset should be preserved
    expect(record.startAt).toBe("2026-04-01T09:00:00-05:00");
    expect(record.endAt).toBe("2026-04-01T10:30:00-05:00");
  });

  it("constructs proper datetime for manual events without timezone offset", () => {
    const record = ingestFromCalendarEvent(manualEvent);

    // Manual events get date + time concatenated (no offset since they're local)
    expect(record.startAt).toBe("2026-03-30T14:00:00");
    expect(record.endAt).toBe("2026-03-30T15:30:00");
  });
});

// ── Store Interface Tests ────────────────────────────

describe("eventRecordStore", () => {
  beforeEach(resetStore);

  it("stores and retrieves records by ID", () => {
    const record = ingestFromCalendarEvent(manualEvent);
    const retrieved = eventRecordStore.get(record.id);
    expect(retrieved).toEqual(record);
  });

  it("retrieves records by externalId", () => {
    const record = ingestFromSyncedEvent(googleEvent);
    const retrieved = eventRecordStore.getByExternalId("gcal-abc-123");
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(record.id);
  });

  it("returns null for non-existent records", () => {
    expect(eventRecordStore.get("nonexistent")).toBeNull();
    expect(eventRecordStore.getByExternalId("nonexistent")).toBeNull();
  });

  it("lists all records", () => {
    ingestFromCalendarEvent(manualEvent);
    ingestFromSyncedEvent(googleEvent);
    expect(eventRecordStore.list()).toHaveLength(2);
  });

  it("marks records as stale", () => {
    const record = ingestFromCalendarEvent(manualEvent);
    eventRecordStore.markStale(record.id);

    const stale = eventRecordStore.get(record.id);
    expect(stale!.status).toBe("stale");
    expect(stale!.classificationStale).toBe(true);
  });
});
