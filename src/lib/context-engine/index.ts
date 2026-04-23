// ── Context Engine Module ────────────────────────────
// Barrel export + singleton store instances for the
// background intelligence system.

export * from "./types";
export { classifyEmail, classifyEmails } from "./classifier";
export { extractTasksFromEmail, extractTasksFromText } from "./task-extractor";
export { generateEventBrief } from "./event-brief";
export {
  evaluateCleanupCandidates,
  executeCleanupAction,
  undoCleanupAction,
  getDefaultCleanupPolicies,
} from "./email-cleanup";

import {
  MemoryClassifiedItemStore,
  MemoryEmailClassificationStore,
  MemoryExtractedTaskStore,
  MemoryEventBriefStore,
  MemoryCleanupPolicyStore,
  MemoryCleanupCandidateStore,
  MemoryAuditLogStore,
  MemoryContextEngineSettingsStore,
} from "./store";

export type {
  IClassifiedItemStore,
  IEmailClassificationStore,
  IExtractedTaskStore,
  IEventBriefStore,
  ICleanupPolicyStore,
  ICleanupCandidateStore,
  IAuditLogStore,
  IContextEngineSettingsStore,
} from "./store";

// Singleton store instances
export const classifiedItemStore = new MemoryClassifiedItemStore();
export const emailClassificationStore = new MemoryEmailClassificationStore();
export const extractedTaskStore = new MemoryExtractedTaskStore();
export const eventBriefStore = new MemoryEventBriefStore();
export const cleanupPolicyStore = new MemoryCleanupPolicyStore();
export const cleanupCandidateStore = new MemoryCleanupCandidateStore();
export const auditLogStore = new MemoryAuditLogStore();
export const contextEngineSettingsStore = new MemoryContextEngineSettingsStore();
