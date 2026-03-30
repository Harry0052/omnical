// ── Slack OAuth: Initiate Connection ──────────────────

import { NextResponse } from "next/server";
import { getSlackOAuthConfig, buildAuthUrl } from "@/lib/integrations/config";

export async function GET() {
  const config = getSlackOAuthConfig();

  if (!config.clientId) {
    return NextResponse.json(
      { error: "Slack OAuth not configured. Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET." },
      { status: 500 }
    );
  }

  const userId = "demo-user";
  const state = Buffer.from(JSON.stringify({ userId })).toString("base64url");

  // Slack uses user_scope for user token (not bot token)
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    user_scope: config.scopes.join(","),
    state,
  });

  return NextResponse.redirect(`${config.authUrl}?${params.toString()}`);
}
