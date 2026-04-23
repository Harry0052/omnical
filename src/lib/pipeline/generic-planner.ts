// ── Generic Task Planner ─────────────────────────────
// When no template workflow fits, Claude defines the task plan.
// This is the open-ended autonomous agent pathway.

import Anthropic from "@anthropic-ai/sdk";
import type {
  CalendarEventRecord,
  ClassificationResult,
  GenericTaskPlan,
  ActionStep,
  IntegrationContext,
} from "./types";
import { GenericTaskPlanSchema, validateSafe } from "./validation";

// ── Prompt ───────────────────────────────────────────

const GENERIC_PLANNER_SYSTEM_PROMPT = `You are an AI calendar assistant that creates execution plans for calendar events.

The event does not match any standard template workflow (study guide, meeting brief, slide deck, etc.), so you must create a custom autonomous task plan.

Return ONLY valid JSON matching this schema:

{
  "objective": {
    "summary": "1-2 sentence description of what the autonomous task should accomplish",
    "targetSites": ["specific URLs or domains to browse, if any"] or omit if none,
    "siteCategories": ["types of sites to search, e.g. 'university portal', 'company wiki'"] or omit if none,
    "successCriteria": ["specific measurable outcomes that define success"],
    "fallbackBehavior": "what to do if the primary task cannot be completed"
  },
  "eventContext": {
    "title": "event title",
    "description": "event description or null",
    "location": "event location or null",
    "attendees": ["attendee list"] or null,
    "links": ["extracted links"] or null,
    "timeUntilEvent": "human-readable time until event"
  },
  "requiredInputs": ["list of inputs needed to execute"],
  "requiresWebResearch": boolean — true if any step requires live browser automation,
  "executionSteps": [
    {
      "order": 0,
      "description": "what this step does",
      "type": one of "gather_context" | "web_research" | "generate_content" | "create_artifact",
      "input": { step-specific input data }
    }
  ],
  "expectedOutputs": ["list of what the task will produce"]
}

Rules:
- Always include at least one "generate_content" step and one "create_artifact" step
- Use "web_research" only when live browser automation is truly needed (dynamic sites, forms, portals)
- Use "gather_context" for fetching data from connected integrations (email, Slack)
- Keep the plan concrete and specific — no vague steps like "do research"
- Success criteria must be measurable
- Fallback behavior must be actionable
- Expected outputs should be specific artifacts the user would find useful

Return ONLY the JSON object. No markdown, no explanation.`;

function buildGenericPlannerPrompt(
  record: CalendarEventRecord,
  classification: ClassificationResult,
  context: IntegrationContext,
): string {
  const now = new Date();
  const eventStart = new Date(record.startAt);
  const hoursUntil = Math.round((eventStart.getTime() - now.getTime()) / (1000 * 60 * 60));

  const parts = [
    `Event Title: ${record.title}`,
    `Date/Time: ${record.startAt} to ${record.endAt}`,
    `Time until event: ${hoursUntil > 0 ? `${hoursUntil} hours` : "already passed"}`,
    `Classification: ${classification.eventType} (${classification.actionability})`,
    `Urgency: ${classification.urgency}`,
    `Reasoning: ${classification.reasoning}`,
  ];

  if (record.description) parts.push(`Description: ${record.description}`);
  if (record.location) parts.push(`Location: ${record.location}`);
  if (record.attendees?.length) parts.push(`Attendees: ${record.attendees.join(", ")}`);
  if (record.links?.length) parts.push(`Links: ${record.links.join(", ")}`);
  if (classification.needsWebResearch) parts.push("Note: Live browser automation (web research) is available for this task.");

  parts.push(`\nConnected integrations:`);
  if (context.gmailConnected) parts.push("- Gmail (can search email threads)");
  if (context.slackConnected) parts.push("- Slack (can search messages)");
  if (context.googleDocsConnected) parts.push("- Google Docs (can create documents)");
  if (!context.gmailConnected && !context.slackConnected && !context.googleDocsConnected) {
    parts.push("- None connected");
  }

  if (classification.missingInputs.length > 0) {
    parts.push(`\nClassification noted missing inputs: ${classification.missingInputs.join(", ")}`);
  }

  return parts.join("\n");
}

// ── Claude Client ────────────────────────────────────

let clientInstance: Anthropic | null = null;

function getClient(): Anthropic {
  if (!clientInstance) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is required");
    clientInstance = new Anthropic({ apiKey });
  }
  return clientInstance;
}

export function setGenericPlannerClient(client: Anthropic | null): void {
  clientInstance = client;
}

// ── Generate Generic Plan ────────────────────────────

export async function generateGenericTaskPlan(
  record: CalendarEventRecord,
  classification: ClassificationResult,
  context: IntegrationContext,
): Promise<GenericTaskPlan> {
  const client = getClient();
  const prompt = buildGenericPlannerPrompt(record, classification, context);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: GENERIC_PLANNER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content for generic task plan");
  }

  let parsed: unknown;
  try {
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse generic task plan as JSON: ${textBlock.text.slice(0, 200)}`);
  }

  const validation = validateSafe(GenericTaskPlanSchema, parsed);
  if (!validation.success) {
    throw new Error(`Generic task plan failed validation: ${validation.error}`);
  }

  return validation.data;
}

// ── Convert GenericTaskPlan to ActionStep[] ───────────

export function genericTaskPlanToSteps(
  plan: GenericTaskPlan,
  context: IntegrationContext,
): ActionStep[] {
  const steps: ActionStep[] = [];

  for (const execStep of plan.executionSteps) {
    const stepId = `generic-${execStep.order}`;

    switch (execStep.type) {
      case "gather_context": {
        // Map to integration_fetch if integrations are connected
        if (context.gmailConnected || context.slackConnected) {
          steps.push({
            id: stepId,
            type: "integration_fetch",
            description: execStep.description,
            input: {
              type: context.gmailConnected ? "gmail" : "slack",
              query: plan.objective.summary,
              ...execStep.input,
            },
            dependsOn: steps.length > 0 ? undefined : undefined,
            status: "pending",
          });
        }
        break;
      }
      case "web_research": {
        const urls = (execStep.input.urls as string[] | undefined)
          ?? plan.objective.targetSites
          ?? [];
        if (urls.length > 0) {
          steps.push({
            id: stepId,
            type: "web_research",
            description: execStep.description,
            input: {
              urls,
              instructions: execStep.input.instructions ?? execStep.description,
            },
            dependsOn: undefined,
            status: "pending",
          });
        }
        break;
      }
      case "generate_content": {
        const priorIds = steps.map((s) => s.id);
        steps.push({
          id: stepId,
          type: "claude_generate",
          description: execStep.description,
          input: {
            prompt: "generic_task",
            objective: plan.objective.summary,
            successCriteria: plan.objective.successCriteria,
            eventTitle: plan.eventContext.title,
            eventDescription: plan.eventContext.description,
            ...execStep.input,
          },
          dependsOn: priorIds.length > 0 ? priorIds : undefined,
          status: "pending",
        });
        break;
      }
      case "create_artifact": {
        const lastStep = steps[steps.length - 1];
        steps.push({
          id: stepId,
          type: "artifact_create",
          description: execStep.description,
          input: {
            artifactType: "generic_output",
            ...execStep.input,
          },
          dependsOn: lastStep ? [lastStep.id] : undefined,
          status: "pending",
        });
        break;
      }
    }
  }

  // Ensure at least a generate + artifact step exists
  if (!steps.some((s) => s.type === "claude_generate")) {
    steps.push({
      id: "generic-generate",
      type: "claude_generate",
      description: `Generate content for: ${plan.objective.summary}`,
      input: {
        prompt: "generic_task",
        objective: plan.objective.summary,
        successCriteria: plan.objective.successCriteria,
      },
      dependsOn: steps.length > 0 ? steps.map((s) => s.id) : undefined,
      status: "pending",
    });
  }

  if (!steps.some((s) => s.type === "artifact_create")) {
    const lastStep = steps[steps.length - 1];
    steps.push({
      id: "generic-artifact",
      type: "artifact_create",
      description: "Create output artifact",
      input: { artifactType: "generic_output" },
      dependsOn: lastStep ? [lastStep.id] : undefined,
      status: "pending",
    });
  }

  return steps;
}

// ── Fallback when Claude call fails ──────────────────

export function buildFallbackGenericSteps(
  record: CalendarEventRecord,
  classification: ClassificationResult,
  context: IntegrationContext,
): ActionStep[] {
  const steps: ActionStep[] = [];

  // Gather whatever context we can
  if (context.gmailConnected) {
    steps.push({
      id: "fallback-email",
      type: "integration_fetch",
      description: "Search email for event context",
      input: { type: "gmail", query: record.title },
      status: "pending",
    });
  }

  if (context.slackConnected) {
    steps.push({
      id: "fallback-slack",
      type: "integration_fetch",
      description: "Search Slack for event context",
      input: { type: "slack", query: record.title },
      status: "pending",
    });
  }

  if (record.links?.length && classification.needsWebResearch) {
    steps.push({
      id: "fallback-browse",
      type: "web_research",
      description: "Browse linked pages for context",
      input: {
        urls: record.links,
        instructions: `Gather any relevant information for the event: ${record.title}. ${record.description ?? ""}`,
      },
      status: "pending",
    });
  }

  const priorIds = steps.map((s) => s.id);
  steps.push({
    id: "fallback-generate",
    type: "claude_generate",
    description: `Generate preparation materials for: ${record.title}`,
    input: {
      prompt: "generic_task",
      objective: `Prepare useful materials for the calendar event: ${record.title}`,
      eventTitle: record.title,
      eventDescription: record.description,
      attendees: record.attendees,
    },
    dependsOn: priorIds.length > 0 ? priorIds : undefined,
    status: "pending",
  });

  steps.push({
    id: "fallback-artifact",
    type: "artifact_create",
    description: "Create output artifact",
    input: { artifactType: "generic_output" },
    dependsOn: ["fallback-generate"],
    status: "pending",
  });

  return steps;
}
