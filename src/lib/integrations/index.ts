// ── Integration Manager ───────────────────────────────
// Central module for managing integration state and connections.
// Server-side only — do not import in client components.

export { getGoogleOAuthConfig, getSlackOAuthConfig, buildAuthUrl, exchangeCodeForTokens } from "./config";
export { storeToken, getToken, removeToken, listTokens, getValidAccessToken } from "./token-store";
export * as googleCalendar from "./google-calendar";
export * as gmail from "./gmail";
export * as googleDocs from "./google-docs";
export * as slack from "./slack";

import type { ConnectedIntegration, IntegrationProvider } from "@/lib/schema";
import { getToken, listTokens } from "./token-store";

// In-memory connection state (replace with DB in production)
const connections = new Map<string, ConnectedIntegration>();

function connKey(userId: string, provider: IntegrationProvider): string {
  return `${userId}:${provider}`;
}

export function setConnection(conn: ConnectedIntegration): void {
  connections.set(connKey(conn.userId, conn.provider), conn);
}

export function getConnection(
  userId: string,
  provider: IntegrationProvider
): ConnectedIntegration | undefined {
  return connections.get(connKey(userId, provider));
}

export function listConnections(userId: string): ConnectedIntegration[] {
  const result: ConnectedIntegration[] = [];
  for (const [k, v] of connections) {
    if (k.startsWith(`${userId}:`)) result.push(v);
  }
  return result;
}

export function isConnected(
  userId: string,
  provider: IntegrationProvider
): boolean {
  const conn = getConnection(userId, provider);
  return conn?.status === "connected" && !!getToken(userId, provider);
}

// For Google, all services share one OAuth token
const GOOGLE_PROVIDERS: IntegrationProvider[] = [
  "google-calendar",
  "gmail",
  "google-docs",
  "google-drive",
];

export function markGoogleConnected(
  userId: string,
  email: string
): void {
  const now = new Date().toISOString();
  for (const provider of GOOGLE_PROVIDERS) {
    setConnection({
      id: `conn-${userId}-${provider}`,
      userId,
      provider,
      status: "connected",
      connectedAt: now,
      lastSyncAt: now,
      metadata: { email },
    });
  }
}

export function markSlackConnected(
  userId: string,
  workspaceName: string
): void {
  setConnection({
    id: `conn-${userId}-slack`,
    userId,
    provider: "slack",
    status: "connected",
    connectedAt: new Date().toISOString(),
    metadata: { workspace: workspaceName },
  });
}
