// ── Slack Service ─────────────────────────────────────
// Real Slack API integration for reading workspace context.
// Reads channels and recent messages for event-related context.

import { getValidAccessToken } from "./token-store";

const API_BASE = "https://slack.com/api";

async function slackFetch(
  method: string,
  accessToken: string,
  params: Record<string, string> = {}
) {
  const url = new URL(`${API_BASE}/${method}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Slack API error: ${res.status}`);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }
  return data;
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  memberCount: number;
  topic?: string;
  purpose?: string;
}

export interface SlackMessage {
  channelId: string;
  channelName: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: string;
}

export interface SlackWorkspace {
  id: string;
  name: string;
  domain: string;
}

export async function getWorkspaceInfo(
  userId: string
): Promise<SlackWorkspace> {
  const token = await getValidAccessToken(userId, "slack");
  if (!token) throw new Error("Not connected to Slack");

  const data = await slackFetch("team.info", token);
  return {
    id: data.team.id,
    name: data.team.name,
    domain: data.team.domain,
  };
}

export async function listChannels(
  userId: string
): Promise<SlackChannel[]> {
  const token = await getValidAccessToken(userId, "slack");
  if (!token) throw new Error("Not connected to Slack");

  const data = await slackFetch("conversations.list", token, {
    types: "public_channel,private_channel",
    limit: "100",
    exclude_archived: "true",
  });

  return (data.channels || []).map(
    (ch: {
      id: string;
      name: string;
      is_private: boolean;
      num_members: number;
      topic?: { value: string };
      purpose?: { value: string };
    }) => ({
      id: ch.id,
      name: ch.name,
      isPrivate: ch.is_private,
      memberCount: ch.num_members,
      topic: ch.topic?.value,
      purpose: ch.purpose?.value,
    })
  );
}

export async function getRecentMessages(
  userId: string,
  channelId: string,
  limit = 20
): Promise<SlackMessage[]> {
  const token = await getValidAccessToken(userId, "slack");
  if (!token) throw new Error("Not connected to Slack");

  const data = await slackFetch("conversations.history", token, {
    channel: channelId,
    limit: String(limit),
  });

  return (data.messages || [])
    .filter((m: { type: string }) => m.type === "message")
    .map(
      (m: { user?: string; text: string; ts: string }): SlackMessage => ({
        channelId,
        channelName: "",
        userId: m.user || "unknown",
        userName: "",
        text: m.text,
        timestamp: m.ts,
      })
    );
}

export async function searchMessages(
  userId: string,
  query: string,
  count = 10
): Promise<SlackMessage[]> {
  const token = await getValidAccessToken(userId, "slack");
  if (!token) throw new Error("Not connected to Slack");

  try {
    const data = await slackFetch("search.messages", token, {
      query,
      count: String(count),
      sort: "timestamp",
      sort_dir: "desc",
    });

    return (data.messages?.matches || []).map(
      (m: {
        channel: { id: string; name: string };
        username: string;
        user: string;
        text: string;
        ts: string;
      }): SlackMessage => ({
        channelId: m.channel.id,
        channelName: m.channel.name,
        userId: m.user,
        userName: m.username,
        text: m.text,
        timestamp: m.ts,
      })
    );
  } catch {
    // search.messages requires specific scopes, gracefully degrade
    return [];
  }
}
