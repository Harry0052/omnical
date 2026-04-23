import { NextRequest, NextResponse } from "next/server";
import {
  emailClassificationStore,
  cleanupPolicyStore,
  cleanupCandidateStore,
  auditLogStore,
  contextEngineSettingsStore,
} from "@/lib/context-engine";
import { evaluateCleanupCandidates, executeCleanupAction, getDefaultCleanupPolicies } from "@/lib/context-engine/email-cleanup";

export async function GET() {
  const userId = "demo-user";
  const candidates = cleanupCandidateStore.listForUser(userId);
  const pendingReview = cleanupCandidateStore.listPendingReview(userId);
  return NextResponse.json({ candidates, pendingReview });
}

export async function POST() {
  const userId = "demo-user";
  const settings = contextEngineSettingsStore.get(userId);

  if (!settings.emailCleanupEnabled) {
    return NextResponse.json({ error: "Email cleanup is disabled" }, { status: 400 });
  }

  // Ensure default policies exist
  let policies = cleanupPolicyStore.listForUser(userId);
  if (policies.length === 0) {
    const defaults = getDefaultCleanupPolicies(userId);
    for (const p of defaults) cleanupPolicyStore.create(p);
    policies = defaults;
  }

  const classifications = emailClassificationStore.listForUser(userId);
  const candidates = evaluateCleanupCandidates(classifications, policies, settings);

  for (const c of candidates) {
    cleanupCandidateStore.create(c);
  }

  return NextResponse.json({ candidates, count: candidates.length });
}

export async function PUT(request: NextRequest) {
  const userId = "demo-user";
  const body = await request.json();
  const { candidateId, approved } = body;

  const candidate = cleanupCandidateStore.get(candidateId);
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  cleanupCandidateStore.update(candidateId, { reviewed: true, approved });

  if (approved) {
    const auditEntry = await executeCleanupAction(userId, candidate);
    auditLogStore.append(auditEntry);
    cleanupCandidateStore.update(candidateId, { executedAt: new Date().toISOString() });
    return NextResponse.json({ auditEntry });
  }

  return NextResponse.json({ status: "rejected" });
}
