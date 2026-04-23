// ── Context Engine Stores ────────────────────────────
// In-memory stores for context engine data.
// Replace with persistent storage in production.

import type {
  ClassifiedItem,
  EmailClassification,
  ExtractedTask,
  EventBrief,
  CleanupPolicy,
  CleanupCandidate,
  AuditLogEntry,
  ContextEngineSettings,
} from "./types";
import { DEFAULT_CONTEXT_ENGINE_SETTINGS } from "./types";

// ── Interfaces ──────────────────────────────────────

export interface IClassifiedItemStore {
  upsert(item: ClassifiedItem): void;
  get(id: string): ClassifiedItem | null;
  listForUser(userId: string): ClassifiedItem[];
  listImportant(userId: string): ClassifiedItem[];
}

export interface IEmailClassificationStore {
  upsert(classification: EmailClassification): void;
  get(id: string): EmailClassification | null;
  getByEmailId(emailId: string): EmailClassification | null;
  listForUser(userId: string): EmailClassification[];
  listByValueTier(userId: string, tier: EmailClassification["valueTier"]): EmailClassification[];
}

export interface IExtractedTaskStore {
  create(task: ExtractedTask): void;
  get(id: string): ExtractedTask | null;
  update(id: string, updates: Partial<ExtractedTask>): void;
  listForUser(userId: string): ExtractedTask[];
  listPending(userId: string): ExtractedTask[];
}

export interface IEventBriefStore {
  upsert(brief: EventBrief): void;
  get(id: string): EventBrief | null;
  getForEvent(eventId: string): EventBrief | null;
  listForUser(userId: string): EventBrief[];
}

export interface ICleanupPolicyStore {
  create(policy: CleanupPolicy): void;
  get(id: string): CleanupPolicy | null;
  update(id: string, updates: Partial<CleanupPolicy>): void;
  listForUser(userId: string): CleanupPolicy[];
  delete(id: string): void;
}

export interface ICleanupCandidateStore {
  create(candidate: CleanupCandidate): void;
  get(id: string): CleanupCandidate | null;
  listForUser(userId: string): CleanupCandidate[];
  listPendingReview(userId: string): CleanupCandidate[];
  update(id: string, updates: Partial<CleanupCandidate>): void;
}

export interface IAuditLogStore {
  append(entry: AuditLogEntry): void;
  listForUser(userId: string, limit?: number): AuditLogEntry[];
  get(id: string): AuditLogEntry | null;
  update(id: string, updates: Partial<AuditLogEntry>): void;
}

export interface IContextEngineSettingsStore {
  get(userId: string): ContextEngineSettings;
  update(userId: string, updates: Partial<ContextEngineSettings>): ContextEngineSettings;
}

// ── In-Memory Implementations ───────────────────────

export class MemoryClassifiedItemStore implements IClassifiedItemStore {
  private items = new Map<string, ClassifiedItem>();

  upsert(item: ClassifiedItem): void {
    this.items.set(item.id, { ...item });
  }

  get(id: string): ClassifiedItem | null {
    return this.items.get(id) ?? null;
  }

  listForUser(userId: string): ClassifiedItem[] {
    return Array.from(this.items.values())
      .filter((i) => i.userId === userId)
      .sort((a, b) => b.priorityScore - a.priorityScore);
  }

  listImportant(userId: string): ClassifiedItem[] {
    return this.listForUser(userId)
      .filter((i) => i.priorityScore >= 50 || i.categories.includes("urgent") || i.categories.includes("action_required"));
  }
}

export class MemoryEmailClassificationStore implements IEmailClassificationStore {
  private classifications = new Map<string, EmailClassification>();
  private emailIndex = new Map<string, string>();

  upsert(classification: EmailClassification): void {
    this.classifications.set(classification.id, { ...classification });
    this.emailIndex.set(classification.emailId, classification.id);
  }

  get(id: string): EmailClassification | null {
    return this.classifications.get(id) ?? null;
  }

  getByEmailId(emailId: string): EmailClassification | null {
    const id = this.emailIndex.get(emailId);
    if (!id) return null;
    return this.classifications.get(id) ?? null;
  }

  listForUser(userId: string): EmailClassification[] {
    return Array.from(this.classifications.values())
      .filter((c) => c.userId === userId)
      .sort((a, b) => b.priorityScore - a.priorityScore);
  }

  listByValueTier(userId: string, tier: EmailClassification["valueTier"]): EmailClassification[] {
    return this.listForUser(userId).filter((c) => c.valueTier === tier);
  }
}

export class MemoryExtractedTaskStore implements IExtractedTaskStore {
  private tasks = new Map<string, ExtractedTask>();

  create(task: ExtractedTask): void {
    this.tasks.set(task.id, { ...task });
  }

  get(id: string): ExtractedTask | null {
    return this.tasks.get(id) ?? null;
  }

  update(id: string, updates: Partial<ExtractedTask>): void {
    const task = this.tasks.get(id);
    if (task) {
      Object.assign(task, updates, { updatedAt: new Date().toISOString() });
    }
  }

  listForUser(userId: string): ExtractedTask[] {
    return Array.from(this.tasks.values())
      .filter((t) => t.userId === userId)
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          const order = { high: 0, medium: 1, low: 2 };
          return order[a.priority] - order[b.priority];
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }

  listPending(userId: string): ExtractedTask[] {
    return this.listForUser(userId).filter((t) => t.status === "pending");
  }
}

export class MemoryEventBriefStore implements IEventBriefStore {
  private briefs = new Map<string, EventBrief>();
  private eventIndex = new Map<string, string>();

  upsert(brief: EventBrief): void {
    this.briefs.set(brief.id, { ...brief });
    this.eventIndex.set(brief.eventId, brief.id);
  }

  get(id: string): EventBrief | null {
    return this.briefs.get(id) ?? null;
  }

  getForEvent(eventId: string): EventBrief | null {
    const id = this.eventIndex.get(eventId);
    if (!id) return null;
    return this.briefs.get(id) ?? null;
  }

  listForUser(userId: string): EventBrief[] {
    return Array.from(this.briefs.values())
      .filter((b) => b.userId === userId)
      .sort((a, b) => new Date(a.eventStartAt).getTime() - new Date(b.eventStartAt).getTime());
  }
}

export class MemoryCleanupPolicyStore implements ICleanupPolicyStore {
  private policies = new Map<string, CleanupPolicy>();

  create(policy: CleanupPolicy): void {
    this.policies.set(policy.id, { ...policy });
  }

  get(id: string): CleanupPolicy | null {
    return this.policies.get(id) ?? null;
  }

  update(id: string, updates: Partial<CleanupPolicy>): void {
    const policy = this.policies.get(id);
    if (policy) {
      Object.assign(policy, updates, { updatedAt: new Date().toISOString() });
    }
  }

  listForUser(userId: string): CleanupPolicy[] {
    return Array.from(this.policies.values()).filter((p) => p.userId === userId);
  }

  delete(id: string): void {
    this.policies.delete(id);
  }
}

export class MemoryCleanupCandidateStore implements ICleanupCandidateStore {
  private candidates = new Map<string, CleanupCandidate>();

  create(candidate: CleanupCandidate): void {
    this.candidates.set(candidate.id, { ...candidate });
  }

  get(id: string): CleanupCandidate | null {
    return this.candidates.get(id) ?? null;
  }

  listForUser(userId: string): CleanupCandidate[] {
    return Array.from(this.candidates.values())
      .filter((c) => c.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  listPendingReview(userId: string): CleanupCandidate[] {
    return this.listForUser(userId).filter((c) => !c.reviewed && !c.executedAt);
  }

  update(id: string, updates: Partial<CleanupCandidate>): void {
    const candidate = this.candidates.get(id);
    if (candidate) {
      Object.assign(candidate, updates);
    }
  }
}

export class MemoryAuditLogStore implements IAuditLogStore {
  private entries: AuditLogEntry[] = [];
  private index = new Map<string, number>();

  append(entry: AuditLogEntry): void {
    this.index.set(entry.id, this.entries.length);
    this.entries.push({ ...entry });
  }

  listForUser(userId: string, limit = 100): AuditLogEntry[] {
    return this.entries
      .filter((e) => e.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  get(id: string): AuditLogEntry | null {
    const idx = this.index.get(id);
    if (idx === undefined) return null;
    return this.entries[idx] ?? null;
  }

  update(id: string, updates: Partial<AuditLogEntry>): void {
    const idx = this.index.get(id);
    if (idx !== undefined && this.entries[idx]) {
      Object.assign(this.entries[idx], updates);
    }
  }
}

export class MemoryContextEngineSettingsStore implements IContextEngineSettingsStore {
  private settings = new Map<string, ContextEngineSettings>();

  get(userId: string): ContextEngineSettings {
    return this.settings.get(userId) ?? { ...DEFAULT_CONTEXT_ENGINE_SETTINGS };
  }

  update(userId: string, updates: Partial<ContextEngineSettings>): ContextEngineSettings {
    const current = this.get(userId);
    const merged = { ...current, ...updates };
    this.settings.set(userId, merged);
    return merged;
  }
}
