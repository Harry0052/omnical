import { NextRequest, NextResponse } from "next/server";
import { eventBriefStore, emailClassificationStore, extractedTaskStore } from "@/lib/context-engine";
import { generateEventBrief } from "@/lib/context-engine/event-brief";
import { isConnected } from "@/lib/integrations";
import { searchForEventContext } from "@/lib/integrations/gmail";
import type { SyncedCalendarEvent } from "@/lib/schema";

export async function GET() {
  const userId = "demo-user";
  const briefs = eventBriefStore.listForUser(userId);
  return NextResponse.json({ briefs });
}

export async function POST(request: NextRequest) {
  const userId = "demo-user";
  const body = await request.json();
  const { event } = body as { event: SyncedCalendarEvent };

  if (!event?.id || !event?.title) {
    return NextResponse.json({ error: "Event data required" }, { status: 400 });
  }

  try {
    // Gather related emails
    let relatedEmails: Array<{ id: string; subject: string; from: string; date: string; snippet: string }> = [];
    if (isConnected(userId, "gmail")) {
      try {
        const emails = await searchForEventContext(userId, event.title, event.attendees?.map(a => a.email).filter(Boolean) as string[] ?? []);
        relatedEmails = emails.map(e => ({ id: e.id, subject: e.subject, from: e.from, date: e.date, snippet: e.snippet }));
      } catch { /* continue without emails */ }
    }

    // Get related tasks
    const allTasks = extractedTaskStore.listForUser(userId);
    const relatedTasks = allTasks.filter(t =>
      t.linkedEventId === event.id ||
      event.title.toLowerCase().split(/\s+/).some(w => w.length > 3 && t.title.toLowerCase().includes(w))
    );

    const brief = await generateEventBrief(userId, event, relatedEmails, relatedTasks);
    eventBriefStore.upsert(brief);

    return NextResponse.json({ brief });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Brief generation failed" },
      { status: 500 },
    );
  }
}
