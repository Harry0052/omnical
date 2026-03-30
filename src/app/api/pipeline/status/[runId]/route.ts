// ── Pipeline Status API ──────────────────────────────
// GET /api/pipeline/status/[runId]

import { NextRequest, NextResponse } from "next/server";
import { pipelineStore } from "@/lib/pipeline";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const run = pipelineStore.get(runId);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({ run });
}
