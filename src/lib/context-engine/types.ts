// ── Context Engine Types ─────────────────────────────
// Types for the background intelligence system that organizes
// user data, triages email, extracts tasks, and builds event briefs.

// ── Item Classification ─────────────────────────────

export type ItemCategory =
  | "urgent"
  | "action_required"
  | "calendar_related"
  | "follow_up"
  | "reference"
  | "low_priority"
  | "noise";

export type ItemSource = "gmail" | "google_calendar" | "slack" | "manual";

export interface ClassifiedItem {
  id: string;
  userId: string;
  source: ItemSource;
  externalId: string;
  title: string;
  snippet: string;
  from?: string;
  to?: string;
  date: string;
  categories: ItemCategory[];
  priorityScore: number; // 0-100
  actionabilityScore: number; // 0-100
  timeSensitivity: "immediate" | "today" | "this_week" | "low" | "none";
  relatedEventId?: string;
  relatedPerson?: string;
  recommendedAction: RecommendedAction;
  summary: string;
  confidence: number; // 0-1
  classifiedAt: string;
  metadata?: Record<string, unknown>;
}

export type RecommendedAction =
  | "surface_now"
  | "surface_before_event"
  | "archive"
  | "trash"
  | "label"
  | "extract_task"
  | "link_to_event"
  | "ignore";

// ── Email Classification ────────────────────────────

export type EmailValueTier = "high" | "mid" | "low" | "noise";

export type ProtectedCategory =
  | "financial"
  | "security"
  | "travel"
  | "legal"
  | "account_related"
  | "hiring"
  | "school"
  | "invoice"
  | "receipt"
  | "contract"
  | "calendar_related"
  | "starred"
  | "important";

export interface EmailClassification {
  id: string;
  emailId: string;
  userId: string;
  subject: string;
  from: string;
  date: string;
  valueTier: EmailValueTier;
  categories: ItemCategory[];
  protectedCategories: ProtectedCategory[];
  isProtected: boolean;
  priorityScore: number;
  actionabilityScore: number;
  timeSensitivity: "immediate" | "today" | "this_week" | "low" | "none";
  recommendedAction: RecommendedAction;
  summary: string;
  confidence: number;
  relatedEventId?: string;
  classifiedAt: string;
}

// ── Extracted Tasks ─────────────────────────────────

export type TaskStatus = "pending" | "in_progress" | "completed" | "dismissed";

export interface ExtractedTask {
  id: string;
  userId: string;
  title: string;
  source: ItemSource;
  sourceId: string; // email ID, message ID, etc.
  sourceSnippet: string;
  dueDate?: string; // ISO datetime
  priority: "high" | "medium" | "low";
  status: TaskStatus;
  linkedEventId?: string;
  linkedConversationId?: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

// ── Event Briefs ────────────────────────────────────

export interface EventBrief {
  id: string;
  userId: string;
  eventId: string;
  eventTitle: string;
  eventStartAt: string;
  relatedEmails: Array<{
    id: string;
    subject: string;
    from: string;
    date: string;
    snippet: string;
  }>;
  relatedTasks: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    dueDate?: string;
  }>;
  relatedNotes: string[];
  relatedLinks: string[];
  peopleContext: Array<{
    name: string;
    email?: string;
    recentInteractions: number;
    lastInteraction?: string;
  }>;
  preparationSuggestions: string[];
  summary: string;
  generatedAt: string;
}

// ── Email Cleanup ───────────────────────────────────

export type CleanupAction = "archive" | "trash" | "label" | "keep";

export interface CleanupPolicy {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  action: CleanupAction;
  conditions: {
    minAgeDays: number;
    maxAgeDays?: number;
    valueTier?: EmailValueTier[];
    categories?: ItemCategory[];
    unreadOnly?: boolean;
    excludeProtected: boolean;
  };
  requireReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CleanupCandidate {
  id: string;
  emailId: string;
  userId: string;
  subject: string;
  from: string;
  date: string;
  policyId: string;
  action: CleanupAction;
  reason: string;
  confidence: number;
  isProtected: boolean;
  reviewed: boolean;
  approved: boolean;
  executedAt?: string;
  createdAt: string;
}

// ── Audit Log ───────────────────────────────────────

export type AuditAction =
  | "email_archived"
  | "email_trashed"
  | "email_labeled"
  | "task_extracted"
  | "event_brief_generated"
  | "item_classified"
  | "cleanup_executed"
  | "cleanup_undone";

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: AuditAction;
  targetId: string;
  targetType: "email" | "task" | "event_brief" | "item";
  description: string;
  reason: string;
  confidence: number;
  undoable: boolean;
  undoneAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ── Context Engine Settings ─────────────────────────

export interface ContextEngineSettings {
  enabled: boolean;
  emailTriageEnabled: boolean;
  emailCleanupEnabled: boolean;
  taskExtractionEnabled: boolean;
  eventBriefsEnabled: boolean;
  cleanupAction: "archive" | "trash";
  archiveAgeDays: number; // auto-archive low-priority after X days
  trashAgeDays: number; // auto-trash noise after X days
  protectedCategories: ProtectedCategory[];
  reviewBeforeAction: boolean;
  triageAggressiveness: "conservative" | "moderate" | "aggressive";
  confidenceThreshold: number; // min confidence for auto-actions (0-1)
  trashConfidenceThreshold: number; // higher threshold for trash (0-1)
}

export const DEFAULT_CONTEXT_ENGINE_SETTINGS: ContextEngineSettings = {
  enabled: true,
  emailTriageEnabled: true,
  emailCleanupEnabled: false, // OFF by default per requirements
  taskExtractionEnabled: true,
  eventBriefsEnabled: true,
  cleanupAction: "archive",
  archiveAgeDays: 90,
  trashAgeDays: 365,
  protectedCategories: [
    "financial", "security", "travel", "legal", "account_related",
    "hiring", "school", "invoice", "receipt", "contract",
    "calendar_related", "starred", "important",
  ],
  reviewBeforeAction: true,
  triageAggressiveness: "moderate",
  confidenceThreshold: 0.7,
  trashConfidenceThreshold: 0.9,
};
