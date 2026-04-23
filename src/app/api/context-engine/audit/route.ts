import { NextRequest, NextResponse } from "next/server";
import { auditLogStore } from "@/lib/context-engine";
import { undoCleanupAction } from "@/lib/context-engine/email-cleanup";

export async function GET() {
  const userId = "demo-user";
  const entries = auditLogStore.listForUser(userId, 100);
  return NextResponse.json({ entries });
}

export async function PUT(request: NextRequest) {
  const userId = "demo-user";
  const body = await request.json();
  const { entryId } = body;

  const entry = auditLogStore.get(entryId);
  if (!entry) {
    return NextResponse.json({ error: "Audit entry not found" }, { status: 404 });
  }

  if (!entry.undoable) {
    return NextResponse.json({ error: "Action cannot be undone" }, { status: 400 });
  }

  const success = await undoCleanupAction(userId, entry);
  if (success) {
    auditLogStore.update(entryId, { undoneAt: new Date().toISOString() });
    return NextResponse.json({ status: "undone" });
  }

  return NextResponse.json({ error: "Undo failed" }, { status: 500 });
}
