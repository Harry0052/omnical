// ── Pipeline Artifact Detail API ─────────────────────
// GET /api/pipeline/artifacts/[artifactId]

import { NextRequest, NextResponse } from "next/server";
import { artifactStore } from "@/lib/pipeline";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const { artifactId } = await params;
  const artifact = artifactStore.get(artifactId);

  if (!artifact) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  return NextResponse.json({ artifact });
}
