// ── Pipeline Run Approve API ─────────────────────────
// POST /api/pipeline/runs/[runId]/approve
// Resumes a pipeline paused at awaiting_approval.

import { NextRequest, NextResponse } from "next/server";
import { pipelineStore, eventRecordStore } from "@/lib/pipeline";
import { resumePipelineFromApproval } from "@/lib/pipeline/orchestrator";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const run = pipelineStore.get(runId);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.stage !== "awaiting_approval") {
    return NextResponse.json(
      { error: `Run is not awaiting approval (current stage: ${run.stage})` },
      { status: 400 },
    );
  }

  const record = eventRecordStore.get(run.eventRecordId);
  if (!record) {
    return NextResponse.json({ error: "Event record not found" }, { status: 404 });
  }

  // Resume execution asynchronously
  resumePipelineFromApproval(runId, record).catch((err) => {
    console.error(`Pipeline resume failed for run ${runId}:`, err);
  });

  return NextResponse.json({ runId, status: "approved" });
}
