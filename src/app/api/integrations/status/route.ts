// ── Integration Status API ────────────────────────────
// Returns the connection status of all integrations for the current user.

import { NextResponse } from "next/server";
import { listConnections } from "@/lib/integrations";
import type { ConnectionStatus, IntegrationProvider } from "@/lib/schema";

interface IntegrationStatusResponse {
  provider: IntegrationProvider;
  name: string;
  status: ConnectionStatus;
  connectedAt?: string;
  metadata?: Record<string, string>;
  category: string;
  description: string;
}

const INTEGRATION_CATALOG: Omit<IntegrationStatusResponse, "status" | "connectedAt" | "metadata">[] = [
  { provider: "google-calendar", name: "Google Calendar", category: "calendar", description: "Sync your events, schedules, and availability in real time." },
  { provider: "gmail", name: "Gmail", category: "email", description: "Pull context from emails to prepare you for meetings and events." },
  { provider: "google-docs", name: "Google Docs", category: "productivity", description: "Export AI-generated prep materials as real Google Docs." },
  { provider: "google-drive", name: "Google Drive", category: "productivity", description: "Store generated documents in a dedicated Omni Cal folder." },
  { provider: "slack", name: "Slack", category: "messaging", description: "Surface relevant Slack threads and channel context before meetings." },
  { provider: "groupme", name: "GroupMe", category: "messaging", description: "Pull group plans and social events into your calendar." },
  { provider: "whatsapp", name: "WhatsApp", category: "messaging", description: "Understand social context from recent conversations." },
];

const COMING_SOON: IntegrationProvider[] = ["groupme", "whatsapp"];

export async function GET() {
  const userId = "demo-user";
  const connections = listConnections(userId);
  const connMap = new Map(connections.map((c) => [c.provider, c]));

  const statuses: IntegrationStatusResponse[] = INTEGRATION_CATALOG.map((item) => {
    if (COMING_SOON.includes(item.provider)) {
      return { ...item, status: "coming-soon" as const };
    }
    const conn = connMap.get(item.provider);
    return {
      ...item,
      status: conn?.status || ("disconnected" as const),
      connectedAt: conn?.connectedAt,
      metadata: conn?.metadata,
    };
  });

  return NextResponse.json({ integrations: statuses });
}
