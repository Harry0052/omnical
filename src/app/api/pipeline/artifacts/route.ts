// ── Pipeline Artifacts List API ───────────────────────
// GET /api/pipeline/artifacts

import { NextRequest, NextResponse } from "next/server";
import { artifactStore } from "@/lib/pipeline";

export async function GET(request: NextRequest) {
  const includeStale = request.nextUrl.searchParams.get("include_stale") === "true";
  const artifacts = artifactStore.listAll({ includeStale });
  return NextResponse.json({ artifacts });
}
