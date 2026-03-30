// ── List Pipeline Runs ──────────────────────────────
// Returns all runs for the demo user, sorted newest first.
// Used by the /app/status page.

import { NextResponse } from "next/server";
import { pipelineStore, eventRecordStore, artifactStore } from "@/lib/pipeline";

export async function GET() {
  const userId = "demo-user";
  const runs = pipelineStore.listForUser(userId);

  // Sort newest first
  const sorted = [...runs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Enrich each run with event title and artifact info
  const enriched = sorted.map((run) => {
    const record = eventRecordStore.get(run.eventRecordId);
    const artifacts = artifactStore.listForEvent(run.eventRecordId);
    return {
      ...run,
      eventTitle: record?.title ?? "Unknown event",
      eventDescription: record?.description,
      artifacts: artifacts.map((a) => ({
        id: a.id,
        title: a.title,
        type: a.type,
        stale: a.stale,
        createdAt: a.createdAt,
      })),
    };
  });

  return NextResponse.json({ runs: enriched });
}
