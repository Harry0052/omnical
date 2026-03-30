// ── Calendar Events API ───────────────────────────────
// Fetches real events from Google Calendar if connected.
// Returns empty array if not connected — no fake data.
// Triggers pipeline for newly synced events.
// Returns structured error types for truthful UI display.

import { NextRequest, NextResponse } from "next/server";
import { isConnected } from "@/lib/integrations";
import { listEvents, GoogleCalendarError } from "@/lib/integrations/google-calendar";
import { ingestFromSyncedEvent } from "@/lib/pipeline/ingest";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import { settingsStore } from "@/lib/pipeline";

export async function GET(request: NextRequest) {
  const userId = "demo-user";
  const timeMin = request.nextUrl.searchParams.get("timeMin") || undefined;
  const timeMax = request.nextUrl.searchParams.get("timeMax") || undefined;

  // Check connection status — returns false after server restart (in-memory tokens are lost)
  if (!isConnected(userId, "google-calendar")) {
    return NextResponse.json({ events: [], source: "none" });
  }

  let events;
  try {
    events = await listEvents(userId, {
      timeMin,
      timeMax,
      maxResults: 50,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[calendar-events] Google Calendar fetch failed for ${userId}:`, message);

    // Structured error handling for GoogleCalendarError
    if (err instanceof GoogleCalendarError) {
      switch (err.reason) {
        case "accessNotConfigured":
          return NextResponse.json({
            events: [],
            source: "api_disabled",
            error: "Google Calendar API is not enabled. Enable it in Google Cloud Console → APIs & Services → Library → Google Calendar API.",
          });
        case "rateLimitExceeded":
          return NextResponse.json({
            events: [],
            source: "rate_limited",
            error: "Google Calendar rate limited. Will retry automatically.",
          });
        case "authError":
          return NextResponse.json({
            events: [],
            source: "disconnected",
            error: "Google Calendar token expired or revoked. Please reconnect at /app/integrations.",
          });
        case "forbidden":
          return NextResponse.json({
            events: [],
            source: "permission_denied",
            error: "Permission denied. Check that your Google account has Calendar access.",
          });
        default:
          return NextResponse.json(
            { events: [], source: "error", error: message },
            { status: 500 },
          );
      }
    }

    // Legacy fallback for non-GoogleCalendarError (e.g., "Not connected")
    if (message.includes("Not connected")) {
      return NextResponse.json({
        events: [],
        source: "disconnected",
        error: "Google Calendar not connected. Please connect at /app/integrations.",
      });
    }

    return NextResponse.json(
      { events: [], source: "error", error: message },
      { status: 500 },
    );
  }

  console.log(`[calendar-events] Fetched ${events.length} events from Google Calendar`);

  // Trigger pipeline for each newly synced event (single boundary)
  const settings = settingsStore.get(userId);
  let pipelineTriggered = 0;
  if (settings.enabled) {
    for (const event of events) {
      try {
        const record = ingestFromSyncedEvent(event);
        // Only trigger if newly ingested (status is "new")
        if (record.status === "new") {
          pipelineTriggered++;
          runPipeline(record.id, userId).catch((err) => {
            console.error(`[calendar-events] Pipeline trigger failed for ${record.id}:`, err);
          });
        }
      } catch (err) {
        console.error(`[calendar-events] Failed to ingest event ${event.id}:`, err);
      }
    }
  }

  if (pipelineTriggered > 0) {
    console.log(`[calendar-events] Triggered pipeline for ${pipelineTriggered} new event(s)`);
  }

  return NextResponse.json({ events, source: "google-calendar" });
}
