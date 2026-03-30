// ── Pipeline Run Retry API ───────────────────────────
// POST /api/pipeline/runs/[runId]/retry

import { NextRequest, NextResponse } from "next/server";
import { pipelineStore, eventRecordStore } from "@/lib/pipeline";
import { runPipeline } from "@/lib/pipeline/orchestrator";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const run = pipelineStore.get(runId);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.stage !== "failed") {
    return NextResponse.json({ error: "Only failed runs can be retried" }, { status: 400 });
  }

  // Reset the event record status so a new run can start
  const record = eventRecordStore.get(run.eventRecordId);
  if (!record) {
    return NextResponse.json({ error: "Event record not found" }, { status: 404 });
  }

  eventRecordStore.upsert({ ...record, status: "new" });

  try {
    const newRunId = await runPipeline(run.eventRecordId, run.userId);
    return NextResponse.json({ runId: newRunId, status: "started", previousRunId: runId });
  } catch (err) {
    console.error(`[pipeline:retry] Failed for run ${runId}:`, err);
    return NextResponse.json({ error: "Retry failed" }, { status: 500 });
  }
}
