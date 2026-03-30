// ── Pipeline Event Detail API ────────────────────────
// GET /api/pipeline/events/[eventId]
// Supports lookup by pipeline record ID or by original/external event ID.

import { NextRequest, NextResponse } from "next/server";
import { eventRecordStore, pipelineStore, artifactStore } from "@/lib/pipeline";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  // Try direct lookup by pipeline record ID
  let record = eventRecordStore.get(eventId);

  // If not found, try lookup by externalId (e.g. Google Calendar ID like "gcal-xxx")
  if (!record) {
    record = eventRecordStore.getByExternalId(eventId);
  }

  // If still not found, scan all records for matching externalId or original ID in metadata
  if (!record) {
    const allRecords = eventRecordStore.list();
    record = allRecords.find((r) =>
      r.externalId === eventId ||
      (r.metadata?.originalId as string) === eventId
    ) ?? null;
  }

  if (!record) {
    return NextResponse.json({ error: "Event record not found", record: null, runs: [], artifacts: [] }, { status: 404 });
  }

  const runs = pipelineStore.listForEvent(record.id);
  const artifacts = artifactStore.listForEvent(record.id);

  return NextResponse.json({ record, runs, artifacts });
}
