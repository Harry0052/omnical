// ── Token Store ───────────────────────────────────────
// In-memory token store for development.
// In production, replace with a database (Neon Postgres, Redis, etc.)

import type { OAuthToken, IntegrationProvider } from "@/lib/schema";
import { getGoogleOAuthConfig, refreshAccessToken } from "./config";

const tokens = new Map<string, OAuthToken>();

function key(userId: string, provider: IntegrationProvider): string {
  return `${userId}:${provider}`;
}

export function storeToken(token: OAuthToken): void {
  tokens.set(key(token.userId, token.provider), token);
}

export function getToken(
  userId: string,
  provider: IntegrationProvider
): OAuthToken | undefined {
  return tokens.get(key(userId, provider));
}

export function removeToken(
  userId: string,
  provider: IntegrationProvider
): void {
  tokens.delete(key(userId, provider));
}

export function listTokens(userId: string): OAuthToken[] {
  const result: OAuthToken[] = [];
  for (const [k, v] of tokens) {
    if (k.startsWith(`${userId}:`)) {
      result.push(v);
    }
  }
  return result;
}

export async function getValidAccessToken(
  userId: string,
  provider: IntegrationProvider
): Promise<string | null> {
  const token = getToken(userId, provider);
  if (!token) return null;

  // Check if token is still valid (with 5-minute buffer)
  const bufferMs = 5 * 60 * 1000;
  if (token.expiresAt * 1000 > Date.now() + bufferMs) {
    return token.accessToken;
  }

  // Token expired — attempt refresh
  if (!token.refreshToken) {
    removeToken(userId, provider);
    return null;
  }

  try {
    const config = provider.startsWith("google")
      ? getGoogleOAuthConfig()
      : null;

    if (!config) {
      return null;
    }

    const refreshed = await refreshAccessToken(config, token.refreshToken);
    const updated: OAuthToken = {
      ...token,
      accessToken: refreshed.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + refreshed.expires_in,
    };
    storeToken(updated);
    return updated.accessToken;
  } catch {
    removeToken(userId, provider);
    return null;
  }
}
