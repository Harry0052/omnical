// ── Slack OAuth: Callback Handler ─────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getSlackOAuthConfig } from "@/lib/integrations/config";
import { storeToken } from "@/lib/integrations/token-store";
import { markSlackConnected } from "@/lib/integrations";
import type { OAuthToken } from "@/lib/schema";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/app/integrations?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/app/integrations?error=missing_params", request.url)
    );
  }

  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    userId = decoded.userId;
  } catch {
    return NextResponse.redirect(
      new URL("/app/integrations?error=invalid_state", request.url)
    );
  }

  try {
    const config = getSlackOAuthConfig();

    // Slack token exchange is slightly different from standard OAuth
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    });

    const res = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = await res.json();
    if (!data.ok) {
      throw new Error(`Slack OAuth error: ${data.error}`);
    }

    // Slack returns user token under authed_user
    const userToken = data.authed_user;
    const teamName = data.team?.name || "Workspace";

    const oauthToken: OAuthToken = {
      provider: "slack",
      userId,
      accessToken: userToken.access_token,
      refreshToken: userToken.refresh_token || "",
      expiresAt: userToken.expires_in
        ? Math.floor(Date.now() / 1000) + userToken.expires_in
        : Math.floor(Date.now() / 1000) + 86400 * 365, // Slack tokens don't expire by default
      scopes: (userToken.scope || "").split(","),
      metadata: {
        teamId: data.team?.id || "",
        teamName,
      },
    };

    storeToken(oauthToken);
    markSlackConnected(userId, teamName);

    return NextResponse.redirect(
      new URL("/app/integrations?connected=slack", request.url)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.redirect(
      new URL(`/app/integrations?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
