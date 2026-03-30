// ── Pipeline Events API ──────────────────────────────
// GET /api/pipeline/events

import { NextResponse } from "next/server";
import { eventRecordStore } from "@/lib/pipeline";

export async function GET() {
  const records = eventRecordStore.list();
  return NextResponse.json({ records });
}
