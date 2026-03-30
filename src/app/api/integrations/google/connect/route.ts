// ── Google OAuth: Initiate Connection ─────────────────
// Redirects the user to Google's OAuth consent screen.
// State parameter carries the user ID for the callback.

import { NextResponse } from "next/server";
import { getGoogleOAuthConfig, buildAuthUrl } from "@/lib/integrations/config";

export async function GET() {
  const config = getGoogleOAuthConfig();

  if (!config.clientId) {
    return NextResponse.json(
      { error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 500 }
    );
  }

  // In production, get userId from session/auth.
  // For now, use a demo user ID.
  const userId = "demo-user";
  const state = Buffer.from(JSON.stringify({ userId })).toString("base64url");

  const authUrl = buildAuthUrl(config, state);
  return NextResponse.redirect(authUrl);
}
