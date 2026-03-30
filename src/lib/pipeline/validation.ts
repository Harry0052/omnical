// ── Pipeline Validation ──────────────────────────────
// Zod schemas for runtime validation of all pipeline data.

import { z } from "zod";

// ── Enums ────────────────────────────────────────────

const EventSourceSchema = z.enum(["manual", "google_calendar", "integration", "agent_discovered"]);
const EventActionabilitySchema = z.enum(["unknown", "not_actionable", "actionable"]);
const EventStatusSchema = z.enum(["new", "classified", "queued", "executing", "completed", "failed", "stale"]);
const EventTypeSchema = z.enum([
  "study", "meeting", "interview", "class", "presentation",
  "travel", "social", "admin", "other",
]);
const WorkflowTypeSchema = z.enum([
  "study_guide_generation", "meeting_research_brief", "zoom_note_capture",
  "slide_deck_generation", "registration_or_rsvp", "logistics_booking", "task_prep_bundle",
  "generic_agent_task",
]);
const ActionStepTypeSchema = z.enum(["claude_generate", "tinyfish_browse", "integration_fetch", "artifact_create"]);
const ActionStepStatusSchema = z.enum(["pending", "running", "completed", "failed", "skipped"]);
const PipelineStageSchema = z.enum([
  "ingested", "classifying", "classified", "planning", "planned",
  "queued", "awaiting_approval", "executing", "synthesizing", "completed", "failed",
]);
const ArtifactTypeSchema = z.enum([
  "study_guide", "meeting_brief", "notes", "outline",
  "slide_content", "checklist", "action_summary", "research_brief",
  "generic_output",
]);
const ApprovalModeSchema = z.enum(["auto", "approve_all", "approve_tinyfish_only"]);

// ── Classification Result ────────────────────────────

export const ClassificationResultSchema = z.object({
  eventType: EventTypeSchema,
  actionability: EventActionabilitySchema,
  urgency: z.enum(["low", "medium", "high", "critical"]),
  actionType: WorkflowTypeSchema.nullable(),
  needsTinyFish: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  missingInputs: z.array(z.string()),
  canRunNow: z.boolean(),
  recommendedExecutionTime: z.enum(["immediate", "before_event", "day_before", "week_before"]).nullable(),
});

// ── Action Step / Plan ───────────────────────────────

export const ActionStepSchema = z.object({
  id: z.string().min(1),
  type: ActionStepTypeSchema,
  description: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  dependsOn: z.array(z.string()).optional(),
  status: ActionStepStatusSchema,
  output: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export const ActionPlanSchema = z.object({
  workflowType: WorkflowTypeSchema,
  steps: z.array(ActionStepSchema).min(1),
  estimatedDurationMs: z.number().positive(),
  requiresApproval: z.boolean(),
  requiresTinyFish: z.boolean(),
  requiredInputs: z.array(z.string()),
  availableInputs: z.array(z.string()),
  missingInputs: z.array(z.string()),
  expectedOutputs: z.array(z.string()),
});

// ── Artifact ─────────────────────────────────────────

export const ArtifactSectionSchema = z.object({
  heading: z.string().min(1),
  body: z.string().optional(),
  items: z.array(z.string()).optional(),
});

export const ArtifactContentSchema = z.object({
  sections: z.array(ArtifactSectionSchema).min(1),
});

export const ArtifactSchema = z.object({
  id: z.string().min(1),
  eventRecordId: z.string().min(1),
  pipelineRunId: z.string().min(1),
  type: ArtifactTypeSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  content: ArtifactContentSchema,
  sources: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
  stale: z.boolean(),
  documentUrl: z.string().url().optional(),
  documentId: z.string().optional(),
  createdAt: z.string(),
});

// ── TinyFish ─────────────────────────────────────────

export const TinyFishTaskSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  instructions: z.string().min(1),
  timeoutMs: z.number().positive().max(120_000),
});

export const TinyFishResultSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(["completed", "failed", "timeout"]),
  extractedData: z.record(z.string(), z.unknown()).optional(),
  screenshots: z.array(z.string()).optional(),
  error: z.string().optional(),
});

// ── Pipeline Settings ────────────────────────────────

export const RetryPolicySchema = z.object({
  maxRetries: z.number().int().min(0).max(5),
  backoffMs: z.number().positive(),
});

export const RateLimitsSchema = z.object({
  maxRunsPerHour: z.number().int().positive(),
  maxRunsPerDay: z.number().int().positive(),
});

export const PipelineSettingsSchema = z.object({
  enabled: z.boolean(),
  approvalMode: ApprovalModeSchema,
  retryPolicy: RetryPolicySchema,
  rateLimits: RateLimitsSchema,
  disabledWorkflows: z.array(WorkflowTypeSchema),
});

// ── Calendar Event Record ────────────────────────────

export const CalendarEventRecordSchema = z.object({
  id: z.string().min(1),
  source: EventSourceSchema,
  externalId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  startAt: z.string(),
  endAt: z.string(),
  timezone: z.string(),
  links: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: EventStatusSchema,
  actionability: EventActionabilitySchema,
  eventType: EventTypeSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  reasoningSummary: z.string().optional(),
  classificationStale: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ── Pipeline Run ─────────────────────────────────────

export const PipelineLogEntrySchema = z.object({
  timestamp: z.string(),
  stage: PipelineStageSchema,
  message: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const PipelineRunSchema = z.object({
  id: z.string().min(1),
  eventRecordId: z.string().min(1),
  userId: z.string().min(1),
  stage: PipelineStageSchema,
  classification: ClassificationResultSchema.optional(),
  actionPlan: ActionPlanSchema.optional(),
  artifactIds: z.array(z.string()),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  log: z.array(PipelineLogEntrySchema),
});

// ── API Route Schemas ────────────────────────────────

export const TriggerRequestSchema = z.object({
  eventId: z.string().min(1),
  source: z.enum(["manual", "google_calendar", "local", "integration"]),
  eventData: z.object({
    title: z.string(),
    description: z.string().optional(),
    location: z.string().optional(),
    attendees: z.array(z.string()).optional(),
    date: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    category: z.string().optional(),
    links: z.array(z.string()).optional(),
  }).optional(),
});

export const SettingsUpdateSchema = PipelineSettingsSchema.partial();

// ── Generic Task Contract ────────────────────────────

export const GenericTaskObjectiveSchema = z.object({
  summary: z.string().min(1),
  targetSites: z.array(z.string()).optional(),
  siteCategories: z.array(z.string()).optional(),
  successCriteria: z.array(z.string()).min(1),
  fallbackBehavior: z.string().min(1),
});

export const GenericTaskPlanSchema = z.object({
  objective: GenericTaskObjectiveSchema,
  eventContext: z.object({
    title: z.string(),
    description: z.string().optional(),
    location: z.string().optional(),
    attendees: z.array(z.string()).optional(),
    links: z.array(z.string()).optional(),
    timeUntilEvent: z.string(),
  }),
  requiredInputs: z.array(z.string()),
  requiresTinyFish: z.boolean(),
  executionSteps: z.array(z.object({
    order: z.number().int().min(0),
    description: z.string().min(1),
    type: z.enum(["gather_context", "browse_web", "generate_content", "create_artifact"]),
    input: z.record(z.string(), z.unknown()),
  })).min(1),
  expectedOutputs: z.array(z.string()).min(1),
});

// ── Helpers ──────────────────────────────────────────

export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Validation failed: ${messages}`);
  }
  return result.data;
}

export function validateSafe<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { success: false, error: messages };
  }
  return { success: true, data: result.data };
}
