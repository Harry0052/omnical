// ── Google OAuth: Callback Handler ────────────────────
// Exchanges the authorization code for tokens and stores them.

import { NextRequest, NextResponse } from "next/server";
import {
  getGoogleOAuthConfig,
  exchangeCodeForTokens,
} from "@/lib/integrations/config";
import { storeToken } from "@/lib/integrations/token-store";
import { markGoogleConnected } from "@/lib/integrations";
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
    const config = getGoogleOAuthConfig();
    const tokens = await exchangeCodeForTokens(config, code);

    // Fetch user email for metadata
    let email = "";
    try {
      const userInfo = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const user = await userInfo.json();
      email = user.email || "";
    } catch {
      // Non-critical
    }

    // Store token (shared across all Google services)
    const oauthToken: OAuthToken = {
      provider: "google-calendar", // Primary provider key
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || "",
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
      scopes: tokens.scope.split(" "),
      metadata: { email },
    };

    storeToken(oauthToken);

    // Also store under other Google provider keys for lookup
    storeToken({ ...oauthToken, provider: "gmail" });
    storeToken({ ...oauthToken, provider: "google-docs" });
    storeToken({ ...oauthToken, provider: "google-drive" });

    // Mark all Google services as connected
    markGoogleConnected(userId, email);

    return NextResponse.redirect(
      new URL("/app/integrations?connected=google", request.url)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.redirect(
      new URL(`/app/integrations?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
