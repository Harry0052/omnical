// ── Pipeline Event Invalidation API ──────────────────
// POST /api/pipeline/events/[eventId]/invalidate
// Marks artifacts as stale when an event is materially edited.
// Supports lookup by pipeline record ID or original UI event ID.

import { NextRequest, NextResponse } from "next/server";
import { eventRecordStore, artifactStore } from "@/lib/pipeline";

function findRecord(eventId: string) {
  let record = eventRecordStore.get(eventId);
  if (!record) record = eventRecordStore.getByExternalId(eventId);
  if (!record) {
    const all = eventRecordStore.list();
    record = all.find((r) =>
      r.externalId === eventId ||
      (r.metadata?.originalId as string) === eventId
    ) ?? null;
  }
  return record;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const record = findRecord(eventId);

  if (!record) {
    // Not an error — the event may not have entered the pipeline yet
    return NextResponse.json({ invalidated: 0, eventId });
  }

  // Mark event record classification as stale
  eventRecordStore.markStale(record.id);

  // Mark all artifacts for this event as stale
  const invalidated = artifactStore.markStaleForEvent(record.id);

  return NextResponse.json({ invalidated, eventId: record.id });
}
