// ── Pipeline Types ────────────────────────────────────
// All type definitions for the autonomous agentic pipeline.

// ── Event Record (normalized internal model) ─────────

export type EventSource = "manual" | "google_calendar" | "integration" | "agent_discovered";
export type EventActionability = "unknown" | "not_actionable" | "actionable";
export type EventStatus = "new" | "classified" | "queued" | "executing" | "completed" | "failed" | "stale";
export type EventType =
  | "study"
  | "meeting"
  | "interview"
  | "class"
  | "presentation"
  | "travel"
  | "social"
  | "admin"
  | "other";

export interface CalendarEventRecord {
  id: string;
  source: EventSource;
  externalId?: string;
  title: string;
  description?: string;
  location?: string;
  attendees?: string[];
  startAt: string; // ISO datetime
  endAt: string; // ISO datetime
  timezone: string;
  links?: string[];
  metadata?: Record<string, unknown>;
  status: EventStatus;
  actionability: EventActionability;
  eventType?: EventType;
  confidence?: number;
  reasoningSummary?: string;
  classificationStale?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Classification (Claude output) ───────────────────

export interface ClassificationResult {
  eventType: EventType;
  actionability: EventActionability;
  urgency: "low" | "medium" | "high" | "critical";
  actionType: WorkflowType | null;
  needsWebResearch: boolean;
  confidence: number;
  reasoning: string;
  missingInputs: string[];
  canRunNow: boolean;
  recommendedExecutionTime: "immediate" | "before_event" | "day_before" | "week_before" | null;
}

// ── Workflow Types ───────────────────────────────────

export type WorkflowType =
  | "study_guide_generation"
  | "meeting_research_brief"
  | "zoom_note_capture"
  | "slide_deck_generation"
  | "registration_or_rsvp"
  | "logistics_booking"
  | "task_prep_bundle"
  | "generic_agent_task";

// ── Generic Task Contract ────────────────────────────
// Used when no template workflow fits. Claude defines the plan.

export interface GenericTaskObjective {
  summary: string;
  targetSites?: string[];
  siteCategories?: string[];
  successCriteria: string[];
  fallbackBehavior: string;
}

export interface GenericTaskPlan {
  objective: GenericTaskObjective;
  eventContext: {
    title: string;
    description?: string;
    location?: string;
    attendees?: string[];
    links?: string[];
    timeUntilEvent: string;
  };
  requiredInputs: string[];
  requiresWebResearch: boolean;
  executionSteps: Array<{
    order: number;
    description: string;
    type: "gather_context" | "web_research" | "generate_content" | "create_artifact";
    input: Record<string, unknown>;
  }>;
  expectedOutputs: string[];
}

// ── Action Plan ──────────────────────────────────────

export type ActionStepType =
  | "claude_generate"
  | "web_research"
  | "integration_fetch"
  | "artifact_create";

export type ActionStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface ActionStep {
  id: string;
  type: ActionStepType;
  description: string;
  input: Record<string, unknown>;
  dependsOn?: string[];
  status: ActionStepStatus;
  output?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ActionPlan {
  workflowType: WorkflowType;
  steps: ActionStep[];
  estimatedDurationMs: number;
  requiresApproval: boolean;
  requiresWebResearch: boolean;
  requiredInputs: string[];
  availableInputs: string[];
  missingInputs: string[];
  expectedOutputs: string[];
}

// ── Pipeline Run ─────────────────────────────────────

export type PipelineStage =
  | "ingested"
  | "classifying"
  | "classified"
  | "planning"
  | "planned"
  | "queued"
  | "awaiting_approval"
  | "executing"
  | "synthesizing"
  | "completed"
  | "failed";

export type ServiceName = "claude" | "context_engine" | "integration" | "synthesizer" | "system";

export interface PipelineLogEntry {
  timestamp: string;
  stage: PipelineStage;
  message: string;
  data?: Record<string, unknown>;
  /** Which service produced this log entry */
  service?: ServiceName;
  /** User-facing label for the UI (short, non-technical) */
  label?: string;
}

export type ServiceMode = "real" | "mock" | "unavailable";

export interface PipelineServiceStatus {
  claude: ServiceMode;
}

export interface EnrichmentData {
  inferredContext: string;
  gatheredContext: {
    emails: Array<{ subject: string; from: string; date: string; snippet: string }>;
    slackMessages: Array<{ channel: string; user: string; text: string; timestamp: string }>;
  };
  suggestWebResearch: boolean;
  webResearchSuggestion?: string;
  confidence: number;
  missingContext: string[];
}

export interface PipelineRun {
  id: string;
  eventRecordId: string;
  userId: string;
  stage: PipelineStage;
  classification?: ClassificationResult;
  actionPlan?: ActionPlan;
  artifactIds: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  log: PipelineLogEntry[];
  /** Tracks whether each service is real, mock, or unavailable */
  serviceMode?: PipelineServiceStatus;
  /** Enrichment data from Claude context gathering */
  enrichment?: EnrichmentData;
}

// ── Artifact ─────────────────────────────────────────

export type ArtifactType =
  | "study_guide"
  | "meeting_brief"
  | "notes"
  | "outline"
  | "slide_content"
  | "checklist"
  | "action_summary"
  | "research_brief"
  | "generic_output";

export interface ArtifactSection {
  heading: string;
  body?: string;
  items?: string[];
}

export interface Artifact {
  id: string;
  eventRecordId: string;
  pipelineRunId: string;
  type: ArtifactType;
  title: string;
  summary: string;
  content: { sections: ArtifactSection[] };
  sources: string[];
  confidence: "high" | "medium" | "low";
  stale: boolean;
  documentUrl?: string;
  documentId?: string;
  createdAt: string;
}

// ── Settings ─────────────────────────────────────────

export type ApprovalMode = "auto" | "approve_all";

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
}

export interface RateLimits {
  maxRunsPerHour: number;
  maxRunsPerDay: number;
}

export interface PipelineSettings {
  enabled: boolean;
  approvalMode: ApprovalMode;
  retryPolicy: RetryPolicy;
  rateLimits: RateLimits;
  disabledWorkflows: WorkflowType[];
}

// ── Integration Context (for planner) ────────────────

export interface IntegrationContext {
  googleCalendarConnected: boolean;
  gmailConnected: boolean;
  slackConnected: boolean;
  googleDocsConnected: boolean;
}
