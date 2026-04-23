// ── Email Cleanup Engine ────────────────────────────
// Safe email cleanup with configurable policies.
// NEVER permanently deletes — "trash" means move to trash (soft-delete).
// All actions are logged and undoable where provider supports it.

import type {
  EmailClassification,
  CleanupPolicy,
  CleanupCandidate,
  AuditLogEntry,
  ContextEngineSettings,
} from "./types";
import { getValidAccessToken } from "../integrations/token-store";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

// ── Evaluate Cleanup Candidates ─────────────────────

export function evaluateCleanupCandidates(
  classifications: EmailClassification[],
  policies: CleanupPolicy[],
  settings: ContextEngineSettings,
): CleanupCandidate[] {
  const candidates: CleanupCandidate[] = [];
  const now = new Date();

  for (const classification of classifications) {
    // Never touch protected emails
    if (classification.isProtected) continue;

    // Check each enabled policy
    for (const policy of policies.filter((p) => p.enabled)) {
      if (!matchesPolicy(classification, policy, now)) continue;

      // Check confidence thresholds
      const actionThreshold = policy.action === "trash"
        ? settings.trashConfidenceThreshold
        : settings.confidenceThreshold;

      if (classification.confidence < actionThreshold) continue;

      candidates.push({
        id: `cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        emailId: classification.emailId,
        userId: classification.userId,
        subject: classification.subject,
        from: classification.from,
        date: classification.date,
        policyId: policy.id,
        action: policy.action,
        reason: buildReason(classification, policy),
        confidence: classification.confidence,
        isProtected: false,
        reviewed: !policy.requireReview && !settings.reviewBeforeAction,
        approved: !policy.requireReview && !settings.reviewBeforeAction,
        createdAt: new Date().toISOString(),
      });

      break; // Only apply first matching policy per email
    }
  }

  return candidates;
}

function matchesPolicy(
  classification: EmailClassification,
  policy: CleanupPolicy,
  now: Date,
): boolean {
  const emailDate = new Date(classification.date);
  const ageDays = Math.floor((now.getTime() - emailDate.getTime()) / (1000 * 60 * 60 * 24));

  // Check age bounds
  if (ageDays < policy.conditions.minAgeDays) return false;
  if (policy.conditions.maxAgeDays && ageDays > policy.conditions.maxAgeDays) return false;

  // Check value tier
  if (policy.conditions.valueTier && !policy.conditions.valueTier.includes(classification.valueTier)) {
    return false;
  }

  // Check categories
  if (policy.conditions.categories) {
    const hasMatch = classification.categories.some((c) => policy.conditions.categories!.includes(c));
    if (!hasMatch) return false;
  }

  // Check protected exclusion
  if (policy.conditions.excludeProtected && classification.isProtected) {
    return false;
  }

  return true;
}

function buildReason(
  classification: EmailClassification,
  policy: CleanupPolicy,
): string {
  const parts: string[] = [];
  parts.push(`Matched policy "${policy.name}"`);
  parts.push(`Value: ${classification.valueTier}`);
  parts.push(`Categories: ${classification.categories.join(", ")}`);
  parts.push(`Confidence: ${Math.round(classification.confidence * 100)}%`);
  return parts.join(" — ");
}

// ── Execute Cleanup Actions ─────────────────────────

export async function executeCleanupAction(
  userId: string,
  candidate: CleanupCandidate,
): Promise<AuditLogEntry> {
  const now = new Date().toISOString();
  const auditEntry: AuditLogEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId,
    action: candidate.action === "trash" ? "email_trashed" : candidate.action === "archive" ? "email_archived" : "email_labeled",
    targetId: candidate.emailId,
    targetType: "email",
    description: `${candidate.action === "trash" ? "Moved to trash" : candidate.action === "archive" ? "Archived" : "Labeled"}: "${candidate.subject}" from ${candidate.from}`,
    reason: candidate.reason,
    confidence: candidate.confidence,
    undoable: true,
    createdAt: now,
  };

  try {
    const token = await getValidAccessToken(userId, "gmail");
    if (!token) {
      throw new Error("Gmail not connected");
    }

    switch (candidate.action) {
      case "trash":
        // Move to trash — NOT permanent delete
        await gmailModify(token, candidate.emailId, { addLabelIds: ["TRASH"] });
        break;
      case "archive":
        // Remove from inbox (archive)
        await gmailModify(token, candidate.emailId, { removeLabelIds: ["INBOX"] });
        break;
      case "label":
        // Add organizational label
        await gmailModify(token, candidate.emailId, { addLabelIds: ["CATEGORY_UPDATES"] });
        break;
    }
  } catch (err) {
    console.error(`[context-engine:cleanup] Action failed for ${candidate.emailId}:`, err);
    auditEntry.description += ` (FAILED: ${err instanceof Error ? err.message : String(err)})`;
    auditEntry.undoable = false;
  }

  return auditEntry;
}

// ── Undo Cleanup Action ─────────────────────────────

export async function undoCleanupAction(
  userId: string,
  auditEntry: AuditLogEntry,
): Promise<boolean> {
  if (!auditEntry.undoable) return false;

  try {
    const token = await getValidAccessToken(userId, "gmail");
    if (!token) return false;

    switch (auditEntry.action) {
      case "email_trashed":
        await gmailModify(token, auditEntry.targetId, { removeLabelIds: ["TRASH"] });
        break;
      case "email_archived":
        await gmailModify(token, auditEntry.targetId, { addLabelIds: ["INBOX"] });
        break;
      case "email_labeled":
        await gmailModify(token, auditEntry.targetId, { removeLabelIds: ["CATEGORY_UPDATES"] });
        break;
      default:
        return false;
    }

    return true;
  } catch (err) {
    console.error(`[context-engine:cleanup] Undo failed:`, err);
    return false;
  }
}

// ── Gmail API Helpers ───────────────────────────────

async function gmailModify(
  accessToken: string,
  messageId: string,
  modifications: { addLabelIds?: string[]; removeLabelIds?: string[] },
): Promise<void> {
  const res = await fetch(
    `${GMAIL_API_BASE}/users/me/messages/${messageId}/modify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(modifications),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gmail modify failed (${res.status}): ${body}`);
  }
}

// ── Default Cleanup Policies ────────────────────────

export function getDefaultCleanupPolicies(userId: string): CleanupPolicy[] {
  const now = new Date().toISOString();
  return [
    {
      id: `policy-${userId}-promo-30`,
      userId,
      name: "Archive old promotions",
      enabled: false, // OFF by default
      action: "archive",
      conditions: {
        minAgeDays: 30,
        valueTier: ["low", "noise"],
        categories: ["low_priority", "noise"],
        excludeProtected: true,
      },
      requireReview: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `policy-${userId}-noise-90`,
      userId,
      name: "Trash old noise emails",
      enabled: false,
      action: "trash",
      conditions: {
        minAgeDays: 90,
        valueTier: ["noise"],
        categories: ["noise"],
        excludeProtected: true,
      },
      requireReview: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `policy-${userId}-archive-180`,
      userId,
      name: "Archive stale low-priority",
      enabled: false,
      action: "archive",
      conditions: {
        minAgeDays: 180,
        valueTier: ["low"],
        excludeProtected: true,
      },
      requireReview: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}
