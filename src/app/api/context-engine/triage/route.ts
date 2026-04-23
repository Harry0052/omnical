import { NextRequest, NextResponse } from "next/server";
import { listRecentMessages } from "@/lib/integrations/gmail";
import { classifyEmails } from "@/lib/context-engine/classifier";
import { extractTasksFromEmail } from "@/lib/context-engine/task-extractor";
import {
  emailClassificationStore,
  extractedTaskStore,
  auditLogStore,
  contextEngineSettingsStore,
} from "@/lib/context-engine";
import { isConnected } from "@/lib/integrations";

export async function POST(request: NextRequest) {
  const userId = "demo-user";

  const settings = contextEngineSettingsStore.get(userId);
  if (!settings.enabled || !settings.emailTriageEnabled) {
    return NextResponse.json({ error: "Email triage is disabled" }, { status: 400 });
  }

  if (!isConnected(userId, "gmail")) {
    return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });
  }

  try {
    const emails = await listRecentMessages(userId, { maxResults: 20 });
    const classifications = await classifyEmails(userId, emails);

    // Store classifications
    for (const c of classifications) {
      emailClassificationStore.upsert(c);
      auditLogStore.append({
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        userId,
        action: "item_classified",
        targetId: c.emailId,
        targetType: "email",
        description: `Classified: "${c.subject}" as ${c.valueTier} (${c.categories.join(", ")})`,
        reason: c.summary,
        confidence: c.confidence,
        undoable: false,
        createdAt: new Date().toISOString(),
      });
    }

    // Extract tasks from actionable emails
    const tasks = [];
    const actionableEmails = emails.filter((e) => {
      const c = classifications.find((cl) => cl.emailId === e.id);
      return c && (c.categories.includes("action_required") || c.recommendedAction === "extract_task");
    });

    for (const email of actionableEmails.slice(0, 5)) {
      const extracted = await extractTasksFromEmail(userId, email);
      for (const task of extracted) {
        extractedTaskStore.create(task);
        tasks.push(task);
      }
    }

    return NextResponse.json({
      classifications,
      tasks,
      emailsProcessed: emails.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Triage failed" },
      { status: 500 },
    );
  }
}
