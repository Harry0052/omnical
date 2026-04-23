import { NextRequest, NextResponse } from "next/server";
import { contextEngineSettingsStore } from "@/lib/context-engine";

export async function GET() {
  const userId = "demo-user";
  const settings = contextEngineSettingsStore.get(userId);
  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const userId = "demo-user";
  const updates = await request.json();
  const settings = contextEngineSettingsStore.update(userId, updates);
  return NextResponse.json({ settings });
}
