// ── Pipeline Settings API ────────────────────────────
// GET/PUT /api/pipeline/settings

import { NextRequest, NextResponse } from "next/server";
import { settingsStore } from "@/lib/pipeline";
import { SettingsUpdateSchema, validateSafe } from "@/lib/pipeline/validation";

const USER_ID = "demo-user";

export async function GET() {
  const settings = settingsStore.get(USER_ID);
  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateSafe(SettingsUpdateSchema, body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const updated = settingsStore.update(USER_ID, validation.data);
  return NextResponse.json({ settings: updated });
}
