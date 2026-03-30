// ── Calendar Sync Service ────────────────────────────
// Reusable hook for Google Calendar sync with:
// - Initial sync on mount
// - Periodic re-sync (configurable, default 5 min)
// - Manual refresh trigger
// - Overlap prevention (lock)
// - Tab visibility awareness (pause when hidden)
// - Observable state (loading, error, lastSyncAt, stats)
// - Safe merge into the client event store
// - Pipeline compatibility (server handles ingestion + pipeline trigger)

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getEvents, importEvents, updateEvent } from "./event-store";
import type { CalendarEvent } from "./types";

// ── Types ────────────────────────────────────────────

export interface SyncStats {
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
}

export type SyncErrorType = "none" | "api_disabled" | "token_expired" | "rate_limited" | "permission_denied" | "unknown";

export interface CalendarSyncState {
  /** Whether a sync is currently in progress */
  isSyncing: boolean;
  /** Last successful sync timestamp (ISO string) */
  lastSyncAt: string | null;
  /** Last sync error message, cleared on next successful sync */
  lastError: string | null;
  /** Structured error type for UI display */
  errorType: SyncErrorType;
  /** Stats from the most recent sync */
  lastStats: SyncStats | null;
  /** Whether Google Calendar is connected (based on last API response) */
  isConnected: boolean;
}

export interface CalendarSyncOptions {
  /** Polling interval in ms. Default: 300_000 (5 minutes) */
  intervalMs?: number;
  /** Whether to pause polling when the tab is hidden. Default: true */
  pauseWhenHidden?: boolean;
}

const DEFAULT_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ── Material change detection ────────────────────────

const MATERIAL_FIELDS: (keyof CalendarEvent)[] = [
  "title", "date", "startTime", "endTime", "description", "location", "attendees",
];

function hasMaterialChange(existing: CalendarEvent, incoming: CalendarEvent): boolean {
  return MATERIAL_FIELDS.some((field) => {
    const oldVal = JSON.stringify(existing[field]);
    const newVal = JSON.stringify(incoming[field]);
    return oldVal !== newVal;
  });
}

// ── Convert API response to CalendarEvent[] ──────────

function mapSyncedEvents(events: Array<Record<string, unknown>>): CalendarEvent[] {
  return events.map((ev) => {
    const startTime = ev.startTime as string;
    const endTime = ev.endTime as string;
    const startDate = startTime.includes("T") ? startTime.split("T")[0] : startTime;
    const startTimePart = startTime.includes("T")
      ? startTime.split("T")[1]?.slice(0, 5) || "00:00"
      : "00:00";
    const endTimePart = endTime.includes("T")
      ? endTime.split("T")[1]?.slice(0, 5) || "23:59"
      : "23:59";

    const attendees = ev.attendees as Array<{ email?: string; name?: string }> | undefined;

    return {
      id: ev.id as string,
      title: ev.title as string,
      date: startDate,
      startTime: startTimePart,
      endTime: endTimePart,
      category: ((ev.category as string) || "work") as CalendarEvent["category"],
      description: ev.description as string | undefined,
      location: ev.location as string | undefined,
      attendees: attendees?.map((a) => a.email || a.name || "Unknown"),
      source: "google-calendar" as const,
    };
  });
}

// ── Smart merge with stats tracking ──────────────────
// Returns stats and does NOT notify the event store for unchanged events.
// Preserves local-only fields (pipelineStatus, pipelineRunId, artifactIds, notes, inboxItemId).

export function mergeGoogleEvents(incoming: CalendarEvent[]): SyncStats {
  const existingById = new Map(getEvents().map((e) => [e.id, e]));
  const stats: SyncStats = { fetched: incoming.length, created: 0, updated: 0, unchanged: 0 };

  const toImport: CalendarEvent[] = [];

  for (const event of incoming) {
    const existing = existingById.get(event.id);
    if (!existing) {
      // New event
      toImport.push(event);
      stats.created++;
    } else if (hasMaterialChange(existing, event)) {
      // Changed event — merge, preserving local-only fields
      const merged: CalendarEvent = {
        ...existing, // preserve pipelineStatus, pipelineRunId, artifactIds, notes, inboxItemId
        ...event,    // overwrite title, date, times, description, location, attendees, category
      };

      // If the event had pipeline results and content materially changed, mark stale
      if (existing.pipelineStatus && !["none", "stale"].includes(existing.pipelineStatus)) {
        merged.pipelineStatus = "stale";
        // Fire invalidation (best-effort, non-blocking)
        fetch(`/api/pipeline/events/${existing.id}/invalidate`, { method: "POST" }).catch(() => {});
        console.log(`[calendar-sync] Event "${event.title}" materially changed — marking pipeline artifacts stale`);
      }

      toImport.push(merged);
      stats.updated++;
    } else {
      // Unchanged
      stats.unchanged++;
    }
  }

  if (toImport.length > 0) {
    importEvents(toImport);
  }

  return stats;
}

// ── Core fetch function ──────────────────────────────

async function fetchGoogleCalendarEvents(): Promise<{
  events: CalendarEvent[];
  source: string;
  error?: string;
}> {
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();

  const res = await fetch(
    `/api/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`
  );

  const data = await res.json().catch(() => ({ events: [], source: "error", error: `HTTP ${res.status}` }));

  // Non-OK status with a real error message from the server
  if (!res.ok) {
    throw new Error(data.error || `API returned ${res.status}`);
  }

  // Known non-error states: not connected, API disabled, rate limited, etc.
  const knownSources = ["none", "disconnected", "api_disabled", "rate_limited", "permission_denied"];
  if (knownSources.includes(data.source)) {
    if (data.error) {
      console.warn(`[calendar-sync] Google Calendar (${data.source}): ${data.error}`);
    }
    return { events: [], source: data.source, error: data.error };
  }

  if (data.source === "google-calendar" && Array.isArray(data.events)) {
    return { events: mapSyncedEvents(data.events), source: data.source };
  }

  return { events: [], source: data.source || "none" };
}

// ── React Hook ──────────────────────────────────────

export function useCalendarSync(options: CalendarSyncOptions = {}) {
  const { intervalMs = DEFAULT_INTERVAL, pauseWhenHidden = true } = options;

  const [state, setState] = useState<CalendarSyncState>({
    isSyncing: false,
    lastSyncAt: null,
    lastError: null,
    errorType: "none",
    lastStats: null,
    isConnected: false,
  });

  // Lock to prevent overlapping syncs
  const syncingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const performSync = useCallback(async (reason: "initial" | "periodic" | "manual") => {
    // Overlap guard
    if (syncingRef.current) {
      console.log(`[calendar-sync] Skipping ${reason} sync — already in progress`);
      return;
    }

    syncingRef.current = true;
    if (mountedRef.current) {
      setState((s) => ({ ...s, isSyncing: true }));
    }

    const startTime = Date.now();
    console.log(`[calendar-sync] Starting ${reason} sync`);

    try {
      const { events, source, error: disconnectReason } = await fetchGoogleCalendarEvents();
      const connected = source === "google-calendar";

      let stats: SyncStats = { fetched: 0, created: 0, updated: 0, unchanged: 0 };

      if (connected && events.length > 0) {
        stats = mergeGoogleEvents(events);
      }

      const elapsed = Date.now() - startTime;
      const now = new Date().toISOString();

      if (connected) {
        console.log(
          `[calendar-sync] ${reason} sync complete in ${elapsed}ms — ` +
          `fetched: ${stats.fetched}, created: ${stats.created}, updated: ${stats.updated}, unchanged: ${stats.unchanged}`
        );
      } else {
        console.log(`[calendar-sync] ${reason} sync complete in ${elapsed}ms — Google Calendar not connected (source: ${source})`);
      }

      // Map API source to structured error type
      let errorType: SyncErrorType = "none";
      if (source === "api_disabled") errorType = "api_disabled";
      else if (source === "disconnected") errorType = "token_expired";
      else if (source === "rate_limited") errorType = "rate_limited";
      else if (source === "permission_denied") errorType = "permission_denied";

      if (mountedRef.current) {
        setState({
          isSyncing: false,
          lastSyncAt: now,
          lastError: disconnectReason || null,
          errorType,
          lastStats: stats,
          isConnected: connected,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const elapsed = Date.now() - startTime;
      console.error(`[calendar-sync] ${reason} sync failed after ${elapsed}ms:`, message);

      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          isSyncing: false,
          lastError: message,
          errorType: "unknown",
        }));
      }
    } finally {
      syncingRef.current = false;
    }
  }, []);

  // Manual refresh — callable from UI
  const refresh = useCallback(() => {
    return performSync("manual");
  }, [performSync]);

  // Initial sync + periodic polling
  useEffect(() => {
    mountedRef.current = true;

    // Initial sync
    performSync("initial");

    // Set up periodic polling
    intervalRef.current = setInterval(() => {
      // Skip if tab is hidden and pauseWhenHidden is enabled
      if (pauseWhenHidden && typeof document !== "undefined" && document.hidden) {
        console.log("[calendar-sync] Skipping periodic sync — tab is hidden");
        return;
      }
      performSync("periodic");
    }, intervalMs);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [performSync, intervalMs, pauseWhenHidden]);

  // Resume sync when tab becomes visible after being hidden
  useEffect(() => {
    if (!pauseWhenHidden || typeof document === "undefined") return;

    function handleVisibilityChange() {
      if (!document.hidden) {
        console.log("[calendar-sync] Tab became visible — triggering sync");
        performSync("periodic");
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [pauseWhenHidden, performSync]);

  return { ...state, refresh };
}
