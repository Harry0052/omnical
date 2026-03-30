// ── Calendar Sync Tests ──────────────────────────────
// Tests for mergeGoogleEvents and importEvents behavior.

import { describe, it, expect, beforeEach } from "vitest";
import {
  getEvents,
  addEvent,
  importEvents,
  deleteEvent,
} from "../event-store";
import { mergeGoogleEvents } from "../calendar-sync";
import type { CalendarEvent } from "../types";

// ── Helpers ──────────────────────────────────────────

function clearStore() {
  // Remove all events to start clean
  for (const e of getEvents()) {
    deleteEvent(e.id);
  }
}

function makeGoogleEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: `gcal-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: "Test Event",
    date: "2026-04-01",
    startTime: "10:00",
    endTime: "11:00",
    category: "work",
    source: "google-calendar",
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────

describe("importEvents", () => {
  beforeEach(() => clearStore());

  it("adds new events", () => {
    const events = [
      makeGoogleEvent({ id: "gcal-a", title: "Event A" }),
      makeGoogleEvent({ id: "gcal-b", title: "Event B" }),
    ];
    importEvents(events);
    expect(getEvents()).toHaveLength(2);
    expect(getEvents().map((e) => e.id)).toEqual(["gcal-a", "gcal-b"]);
  });

  it("does not duplicate existing events with same ID", () => {
    const event = makeGoogleEvent({ id: "gcal-dup", title: "Original" });
    importEvents([event]);
    expect(getEvents()).toHaveLength(1);

    // Import again — same ID, same data
    importEvents([{ ...event }]);
    expect(getEvents()).toHaveLength(1);
    expect(getEvents()[0].title).toBe("Original");
  });

  it("updates existing events when content changes", () => {
    const event = makeGoogleEvent({ id: "gcal-upd", title: "Before" });
    importEvents([event]);
    expect(getEvents()[0].title).toBe("Before");

    // Import with changed title
    importEvents([{ ...event, title: "After" }]);
    expect(getEvents()).toHaveLength(1);
    expect(getEvents()[0].title).toBe("After");
  });

  it("preserves local events alongside imported ones", () => {
    addEvent({ title: "Local Event", date: "2026-04-01", startTime: "09:00", endTime: "10:00", category: "personal" });
    expect(getEvents()).toHaveLength(1);

    importEvents([makeGoogleEvent({ id: "gcal-new", title: "Google Event" })]);
    expect(getEvents()).toHaveLength(2);
    expect(getEvents().map((e) => e.title).sort()).toEqual(["Google Event", "Local Event"]);
  });
});

describe("mergeGoogleEvents", () => {
  beforeEach(() => clearStore());

  it("returns correct stats for all-new events", () => {
    const events = [
      makeGoogleEvent({ id: "gcal-1", title: "New 1" }),
      makeGoogleEvent({ id: "gcal-2", title: "New 2" }),
      makeGoogleEvent({ id: "gcal-3", title: "New 3" }),
    ];
    const stats = mergeGoogleEvents(events);
    expect(stats.fetched).toBe(3);
    expect(stats.created).toBe(3);
    expect(stats.updated).toBe(0);
    expect(stats.unchanged).toBe(0);
    expect(getEvents()).toHaveLength(3);
  });

  it("returns correct stats for unchanged events", () => {
    const event = makeGoogleEvent({ id: "gcal-same", title: "Same" });
    importEvents([event]);

    const stats = mergeGoogleEvents([event]);
    expect(stats.fetched).toBe(1);
    expect(stats.created).toBe(0);
    expect(stats.updated).toBe(0);
    expect(stats.unchanged).toBe(1);
  });

  it("detects and counts updated events", () => {
    const event = makeGoogleEvent({ id: "gcal-change", title: "Before" });
    importEvents([event]);

    const stats = mergeGoogleEvents([{ ...event, title: "After" }]);
    expect(stats.fetched).toBe(1);
    expect(stats.created).toBe(0);
    expect(stats.updated).toBe(1);
    expect(stats.unchanged).toBe(0);
    expect(getEvents()[0].title).toBe("After");
  });

  it("returns mixed stats correctly", () => {
    const existing = makeGoogleEvent({ id: "gcal-exist", title: "Existing" });
    importEvents([existing]);

    const stats = mergeGoogleEvents([
      existing, // unchanged
      { ...existing, id: "gcal-new-one", title: "Brand New" }, // new
      { ...existing, title: "Changed Title" }, // updated (same id as existing)
    ]);
    // Note: existing appears twice — once unchanged check, once update check
    // The update with changed title should win
    expect(stats.fetched).toBe(3);
    expect(stats.created).toBe(1); // gcal-new-one
    expect(stats.updated).toBe(1); // gcal-exist with changed title
    expect(stats.unchanged).toBe(1); // first pass of gcal-exist is unchanged? No — it appears in order
    // Actually the merge processes in order: existing (unchanged first time),
    // but wait — the third item also has id gcal-exist but different title.
    // Let me reconsider: mergeGoogleEvents iterates in order:
    // 1. gcal-exist with "Existing" — matches store, no change → unchanged
    // 2. gcal-new-one with "Brand New" — not in store → created
    // 3. gcal-exist with "Changed Title" — matches store... but store was NOT updated by #1
    //    because #1 was unchanged. So #3 compares against original "Existing" → material change → updated

    // Actually wait — mergeGoogleEvents reads from getEvents() at the start.
    // It builds existingById from the snapshot. So:
    // 1. gcal-exist "Existing" vs store "Existing" → unchanged
    // 2. gcal-new-one "Brand New" → not in existingById → created
    // 3. gcal-exist "Changed Title" vs existingById "Existing" → hasMaterialChange → updated
    // The existingById map doesn't update during iteration, so both #1 and #3 compare against original.
    // That means we get: unchanged=1, created=1, updated=1
    expect(stats.unchanged).toBe(1);
  });

  it("preserves pipeline status on unchanged events", () => {
    const event = makeGoogleEvent({ id: "gcal-pipe", title: "With Pipeline" });
    importEvents([{ ...event, pipelineStatus: "completed", pipelineRunId: "run-123" }]);

    const stats = mergeGoogleEvents([event]);
    expect(stats.unchanged).toBe(1);

    // The event should still have its pipeline status
    const stored = getEvents().find((e) => e.id === "gcal-pipe");
    expect(stored?.pipelineStatus).toBe("completed");
    expect(stored?.pipelineRunId).toBe("run-123");
  });

  it("marks pipeline as stale when event materially changes", () => {
    const event = makeGoogleEvent({ id: "gcal-stale", title: "Original" });
    importEvents([{ ...event, pipelineStatus: "completed", pipelineRunId: "run-456" }]);

    // Simulate global fetch mock for the invalidation call
    const originalFetch = globalThis.fetch;
    const fetchCalls: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/invalidate")) {
        fetchCalls.push(url);
        return new Response(JSON.stringify({ invalidated: 1 }), { status: 200 });
      }
      return originalFetch(url, init);
    }) as typeof fetch;

    try {
      const stats = mergeGoogleEvents([{ ...event, title: "Changed Title" }]);
      expect(stats.updated).toBe(1);

      const stored = getEvents().find((e) => e.id === "gcal-stale");
      expect(stored?.pipelineStatus).toBe("stale");
      // Pipeline run ID should be preserved
      expect(stored?.pipelineRunId).toBe("run-456");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("preserves local-only fields (notes, inboxItemId) on update", () => {
    const event = makeGoogleEvent({ id: "gcal-local", title: "With Notes" });
    importEvents([{ ...event, notes: "My personal notes", inboxItemId: "inbox-1" }]);

    // Update with changed description but mergeGoogleEvents preserves local fields
    const stats = mergeGoogleEvents([{ ...event, description: "New desc" }]);
    expect(stats.updated).toBe(1);

    const stored = getEvents().find((e) => e.id === "gcal-local");
    expect(stored?.notes).toBe("My personal notes");
    expect(stored?.inboxItemId).toBe("inbox-1");
    expect(stored?.description).toBe("New desc");
  });

  it("does not duplicate events across multiple sync cycles", () => {
    const events = [
      makeGoogleEvent({ id: "gcal-c1", title: "Event 1" }),
      makeGoogleEvent({ id: "gcal-c2", title: "Event 2" }),
    ];

    // Sync cycle 1
    mergeGoogleEvents(events);
    expect(getEvents()).toHaveLength(2);

    // Sync cycle 2 — same events
    mergeGoogleEvents(events);
    expect(getEvents()).toHaveLength(2);

    // Sync cycle 3 — one new event added
    mergeGoogleEvents([...events, makeGoogleEvent({ id: "gcal-c3", title: "Event 3" })]);
    expect(getEvents()).toHaveLength(3);

    // Sync cycle 4 — same three events
    const stats = mergeGoogleEvents([
      makeGoogleEvent({ id: "gcal-c1", title: "Event 1" }),
      makeGoogleEvent({ id: "gcal-c2", title: "Event 2" }),
      makeGoogleEvent({ id: "gcal-c3", title: "Event 3" }),
    ]);
    expect(getEvents()).toHaveLength(3);
    expect(stats.unchanged).toBe(3);
    expect(stats.created).toBe(0);
    expect(stats.updated).toBe(0);
  });

  it("does not re-trigger pipeline for unchanged events", () => {
    // The pipeline trigger only happens server-side in /api/calendar/events
    // via ingestFromSyncedEvent which checks record.status === "new".
    // On the client side, mergeGoogleEvents only marks stale on material changes.
    // Unchanged events → no stale marking → no re-trigger.

    const event = makeGoogleEvent({ id: "gcal-no-retrigger", title: "Stable" });
    importEvents([{ ...event, pipelineStatus: "completed", pipelineRunId: "run-789" }]);

    const stats = mergeGoogleEvents([event]);
    expect(stats.unchanged).toBe(1);

    const stored = getEvents().find((e) => e.id === "gcal-no-retrigger");
    // Status should remain completed — not stale, not re-triggered
    expect(stored?.pipelineStatus).toBe("completed");
  });
});

describe("material change detection in mergeGoogleEvents", () => {
  beforeEach(() => clearStore());

  it("detects title change as material", () => {
    const event = makeGoogleEvent({ id: "gcal-m1", title: "Old Title" });
    importEvents([{ ...event, pipelineStatus: "completed" }]);

    mergeGoogleEvents([{ ...event, title: "New Title" }]);
    expect(getEvents()[0].pipelineStatus).toBe("stale");
  });

  it("detects time change as material", () => {
    const event = makeGoogleEvent({ id: "gcal-m2", title: "Same" });
    importEvents([{ ...event, pipelineStatus: "completed" }]);

    mergeGoogleEvents([{ ...event, startTime: "14:00" }]);
    expect(getEvents()[0].pipelineStatus).toBe("stale");
  });

  it("detects date change as material", () => {
    const event = makeGoogleEvent({ id: "gcal-m3", title: "Same" });
    importEvents([{ ...event, pipelineStatus: "completed" }]);

    mergeGoogleEvents([{ ...event, date: "2026-05-15" }]);
    expect(getEvents()[0].pipelineStatus).toBe("stale");
  });

  it("detects description change as material", () => {
    const event = makeGoogleEvent({ id: "gcal-m4", title: "Same", description: "Old" });
    importEvents([{ ...event, pipelineStatus: "completed" }]);

    mergeGoogleEvents([{ ...event, description: "New" }]);
    expect(getEvents()[0].pipelineStatus).toBe("stale");
  });

  it("does NOT mark stale if event has no pipeline results", () => {
    const event = makeGoogleEvent({ id: "gcal-m5", title: "Old" });
    importEvents([event]); // no pipelineStatus

    mergeGoogleEvents([{ ...event, title: "New" }]);
    const stored = getEvents()[0];
    expect(stored.pipelineStatus).toBeUndefined();
    expect(stored.title).toBe("New");
  });

  it("does NOT mark stale if pipelineStatus is already 'none'", () => {
    const event = makeGoogleEvent({ id: "gcal-m6", title: "Old" });
    importEvents([{ ...event, pipelineStatus: "none" }]);

    mergeGoogleEvents([{ ...event, title: "New" }]);
    const stored = getEvents()[0];
    // "none" is not an active pipeline state — it should not transition to stale
    expect(stored.pipelineStatus).not.toBe("stale");
  });
});
