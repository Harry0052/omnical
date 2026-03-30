// ── Pipeline Trigger API ─────────────────────────────
// POST /api/pipeline/trigger
// Canonical entry point for starting a pipeline run.

import { NextRequest, NextResponse } from "next/server";
import { TriggerRequestSchema, validateSafe } from "@/lib/pipeline/validation";
import { ingestFromCalendarEvent } from "@/lib/pipeline/ingest";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import { pipelineStore } from "@/lib/pipeline";
import type { CalendarEvent } from "@/lib/types";

export async function POST(request: NextRequest) {
  const userId = "demo-user";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateSafe(TriggerRequestSchema, body);
  if (!validation.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const { eventId, source, eventData } = validation.data;

  // eventData is required — we don't create placeholder events
  if (!eventData) {
    return NextResponse.json(
      { error: "eventData is required. Provide title, date, startTime, and endTime." },
      { status: 400 },
    );
  }

  try {
    const calEvent: CalendarEvent = {
      id: eventId,
      title: eventData.title,
      date: eventData.date,
      startTime: eventData.startTime,
      endTime: eventData.endTime,
      category: (eventData.category as CalendarEvent["category"]) ?? "work",
      description: eventData.description,
      location: eventData.location,
      attendees: eventData.attendees,
      source: source === "google_calendar" ? "google-calendar" : "local",
    };
    const record = ingestFromCalendarEvent(calEvent);

    // Check for already running pipeline
    const activeRun = pipelineStore.getActiveRun(record.id);
    if (activeRun) {
      return NextResponse.json({
        runId: activeRun.id,
        status: "already_running",
        stage: activeRun.stage,
      });
    }

    // Start pipeline (fire-and-forget)
    const runId = await runPipeline(record.id, userId);

    return NextResponse.json({
      runId,
      status: "started",
      eventRecordId: record.id,
    });
  } catch (err) {
    // Sanitize error — don't leak internals
    const message = err instanceof Error ? err.message : "Pipeline trigger failed";
    const isUserError = message.includes("Rate limit") || message.includes("disabled") || message.includes("not configured");
    console.error("[pipeline:trigger]", message);
    return NextResponse.json(
      { error: isUserError ? message : "Pipeline trigger failed" },
      { status: isUserError ? 429 : 500 },
    );
  }
}
