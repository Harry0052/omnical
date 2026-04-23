import { NextRequest, NextResponse } from "next/server";
import { extractedTaskStore } from "@/lib/context-engine";

export async function GET() {
  const userId = "demo-user";
  const tasks = extractedTaskStore.listForUser(userId);
  return NextResponse.json({ tasks });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { taskId, status } = body;

  if (!taskId || !status) {
    return NextResponse.json({ error: "taskId and status required" }, { status: 400 });
  }

  const task = extractedTaskStore.get(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  extractedTaskStore.update(taskId, { status });
  return NextResponse.json({ task: extractedTaskStore.get(taskId) });
}
