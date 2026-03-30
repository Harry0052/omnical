// ── Pipeline Stores ──────────────────────────────────
// Storage interfaces + in-memory implementations.
// All business logic uses interfaces — swap to Redis/Postgres later.

import type {
  CalendarEventRecord,
  PipelineRun,
  PipelineLogEntry,
  PipelineStage,
  Artifact,
  PipelineSettings,
  WorkflowType,
} from "./types";

// ── Interfaces ───────────────────────────────────────

export interface IEventRecordStore {
  upsert(record: CalendarEventRecord): void;
  get(id: string): CalendarEventRecord | null;
  getByExternalId(externalId: string): CalendarEventRecord | null;
  list(): CalendarEventRecord[];
  markStale(id: string): void;
}

export interface IPipelineStore {
  create(run: PipelineRun): void;
  get(id: string): PipelineRun | null;
  update(id: string, updates: Partial<PipelineRun>): void;
  listForEvent(eventRecordId: string): PipelineRun[];
  listForUser(userId: string): PipelineRun[];
  appendLog(id: string, entry: PipelineLogEntry): void;
  getActiveRun(eventRecordId: string): PipelineRun | null;
  hasActiveRun(eventRecordId: string): boolean;
}

export interface IArtifactStore {
  create(artifact: Artifact): void;
  get(id: string): Artifact | null;
  listForEvent(eventRecordId: string): Artifact[];
  listAll(options?: { includeStale?: boolean }): Artifact[];
  markStaleForEvent(eventRecordId: string): number;
}

export interface ISettingsStore {
  get(userId: string): PipelineSettings;
  update(userId: string, updates: Partial<PipelineSettings>): PipelineSettings;
}

// ── Active stage check ───────────────────────────────

const TERMINAL_STAGES: PipelineStage[] = ["completed", "failed"];

function isActiveRun(run: PipelineRun): boolean {
  return !TERMINAL_STAGES.includes(run.stage);
}

// ── In-Memory Event Record Store ─────────────────────

export class MemoryEventRecordStore implements IEventRecordStore {
  private records = new Map<string, CalendarEventRecord>();
  private externalIndex = new Map<string, string>(); // externalId -> id

  upsert(record: CalendarEventRecord): void {
    this.records.set(record.id, { ...record, updatedAt: new Date().toISOString() });
    if (record.externalId) {
      this.externalIndex.set(record.externalId, record.id);
    }
  }

  get(id: string): CalendarEventRecord | null {
    return this.records.get(id) ?? null;
  }

  getByExternalId(externalId: string): CalendarEventRecord | null {
    const id = this.externalIndex.get(externalId);
    if (!id) return null;
    return this.records.get(id) ?? null;
  }

  list(): CalendarEventRecord[] {
    return Array.from(this.records.values());
  }

  markStale(id: string): void {
    const record = this.records.get(id);
    if (record) {
      record.classificationStale = true;
      record.status = "stale";
      record.updatedAt = new Date().toISOString();
    }
  }
}

// ── In-Memory Pipeline Store ─────────────────────────

export class MemoryPipelineStore implements IPipelineStore {
  private runs = new Map<string, PipelineRun>();

  create(run: PipelineRun): void {
    this.runs.set(run.id, { ...run });
  }

  get(id: string): PipelineRun | null {
    return this.runs.get(id) ?? null;
  }

  update(id: string, updates: Partial<PipelineRun>): void {
    const run = this.runs.get(id);
    if (run) {
      Object.assign(run, updates, { updatedAt: new Date().toISOString() });
    }
  }

  listForEvent(eventRecordId: string): PipelineRun[] {
    return Array.from(this.runs.values()).filter((r) => r.eventRecordId === eventRecordId);
  }

  listForUser(userId: string): PipelineRun[] {
    return Array.from(this.runs.values()).filter((r) => r.userId === userId);
  }

  appendLog(id: string, entry: PipelineLogEntry): void {
    const run = this.runs.get(id);
    if (run) {
      run.log.push(entry);
      run.updatedAt = new Date().toISOString();
    }
  }

  getActiveRun(eventRecordId: string): PipelineRun | null {
    const runs = this.listForEvent(eventRecordId);
    return runs.find(isActiveRun) ?? null;
  }

  hasActiveRun(eventRecordId: string): boolean {
    return this.getActiveRun(eventRecordId) !== null;
  }
}

// ── In-Memory Artifact Store ─────────────────────────

export class MemoryArtifactStore implements IArtifactStore {
  private artifacts = new Map<string, Artifact>();

  create(artifact: Artifact): void {
    this.artifacts.set(artifact.id, { ...artifact });
  }

  get(id: string): Artifact | null {
    return this.artifacts.get(id) ?? null;
  }

  listForEvent(eventRecordId: string): Artifact[] {
    return Array.from(this.artifacts.values()).filter((a) => a.eventRecordId === eventRecordId);
  }

  listAll(options?: { includeStale?: boolean }): Artifact[] {
    const all = Array.from(this.artifacts.values());
    if (options?.includeStale) return all;
    return all.filter((a) => !a.stale);
  }

  markStaleForEvent(eventRecordId: string): number {
    let count = 0;
    for (const artifact of this.artifacts.values()) {
      if (artifact.eventRecordId === eventRecordId && !artifact.stale) {
        artifact.stale = true;
        count++;
      }
    }
    return count;
  }
}

// ── In-Memory Settings Store ─────────────────────────

const DEFAULT_SETTINGS: PipelineSettings = {
  enabled: true,
  approvalMode: "auto",
  retryPolicy: { maxRetries: 2, backoffMs: 3000 },
  rateLimits: { maxRunsPerHour: 10, maxRunsPerDay: 50 },
  disabledWorkflows: [],
};

export class MemorySettingsStore implements ISettingsStore {
  private settings = new Map<string, PipelineSettings>();

  get(userId: string): PipelineSettings {
    return this.settings.get(userId) ?? { ...DEFAULT_SETTINGS };
  }

  update(userId: string, updates: Partial<PipelineSettings>): PipelineSettings {
    const current = this.get(userId);
    const merged = { ...current, ...updates };
    this.settings.set(userId, merged);
    return merged;
  }
}
