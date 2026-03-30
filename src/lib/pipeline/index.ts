// ── Pipeline Module ──────────────────────────────────
// Barrel export + singleton store instances.

export * from "./types";
export * from "./validation";
export type {
  IEventRecordStore,
  IPipelineStore,
  IArtifactStore,
  ISettingsStore,
} from "./store";

import {
  MemoryEventRecordStore,
  MemoryPipelineStore,
  MemoryArtifactStore,
  MemorySettingsStore,
} from "./store";
import type {
  IEventRecordStore,
  IPipelineStore,
  IArtifactStore,
  ISettingsStore,
} from "./store";

// Singleton store instances — swap implementations here when moving to persistent storage
export const eventRecordStore: IEventRecordStore = new MemoryEventRecordStore();
export const pipelineStore: IPipelineStore = new MemoryPipelineStore();
export const artifactStore: IArtifactStore = new MemoryArtifactStore();
export const settingsStore: ISettingsStore = new MemorySettingsStore();
