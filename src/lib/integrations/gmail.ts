// ── Gmail Service ─────────────────────────────────────
// Real Gmail API integration for extracting scheduling context.
// Reads recent messages to find event-related information.

import { getValidAccessToken } from "./token-store";

const API_BASE = "https://gmail.googleapis.com/gmail/v1";

async function gmailFetch(path: string, accessToken: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body?: string;
  labels: string[];
}

export async function listRecentMessages(
  userId: string,
  options: {
    query?: string; // Gmail search query
    maxResults?: number;
    after?: string; // ISO date for "after:YYYY/MM/DD"
  } = {}
): Promise<GmailMessage[]> {
  const token = await getValidAccessToken(userId, "gmail");
  if (!token) throw new Error("Not connected to Gmail");

  let q = options.query || "";
  if (options.after) {
    const dateStr = options.after.replace(/-/g, "/");
    q += ` after:${dateStr}`;
  }

  const params = new URLSearchParams({
    maxResults: String(options.maxResults || 20),
  });
  if (q.trim()) params.set("q", q.trim());

  const data = await gmailFetch(`/users/me/messages?${params}`, token);
  const messageIds: string[] = (data.messages || []).map(
    (m: { id: string }) => m.id
  );

  const messages: GmailMessage[] = [];
  for (const id of messageIds.slice(0, options.maxResults || 20)) {
    try {
      const msg = await getMessage(token, id);
      if (msg) messages.push(msg);
    } catch {
      // Skip messages that fail to fetch
    }
  }
  return messages;
}

async function getMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessage | null> {
  const data = await gmailFetch(
    `/users/me/messages/${messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
    accessToken
  );

  const headers: Record<string, string> = {};
  for (const h of data.payload?.headers || []) {
    headers[h.name.toLowerCase()] = h.value;
  }

  return {
    id: data.id,
    threadId: data.threadId,
    subject: headers.subject || "(no subject)",
    from: headers.from || "",
    to: headers.to || "",
    date: headers.date || "",
    snippet: data.snippet || "",
    labels: data.labelIds || [],
  };
}

export async function searchForEventContext(
  userId: string,
  eventTitle: string,
  attendeeEmails: string[]
): Promise<GmailMessage[]> {
  const queries: string[] = [];

  // Search by event title keywords
  const keywords = eventTitle
    .replace(/[—–-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (keywords.length > 0) {
    queries.push(keywords.slice(0, 3).join(" "));
  }

  // Search by attendee emails
  for (const email of attendeeEmails.slice(0, 3)) {
    queries.push(`from:${email} OR to:${email}`);
  }

  const allMessages: GmailMessage[] = [];
  for (const q of queries) {
    try {
      const msgs = await listRecentMessages(userId, {
        query: q,
        maxResults: 5,
        after: getDateNDaysAgo(30),
      });
      allMessages.push(...msgs);
    } catch {
      // Continue with other queries
    }
  }

  // Deduplicate by message ID
  const seen = new Set<string>();
  return allMessages.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

function getDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}
