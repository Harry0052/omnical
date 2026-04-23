// ── Event Classification ─────────────────────────────
// Uses Claude to classify events and determine actionability.
// Features: retry logic, Zod validation, low-confidence fallback,
// model swappability, failure logging.

import Anthropic from "@anthropic-ai/sdk";
import type { CalendarEventRecord, ClassificationResult } from "./types";
import { ClassificationResultSchema, validateSafe, validateOrThrow } from "./validation";
import {
  CLASSIFICATION_SYSTEM_PROMPT,
  buildClassificationPrompt,
  DEFAULT_CLASSIFICATION_MODEL,
} from "./prompts";
import { eventRecordStore } from "./index";

// ── Configuration ────────────────────────────────────

export interface ClassifyOptions {
  model?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

const DEFAULTS: Required<ClassifyOptions> = {
  model: DEFAULT_CLASSIFICATION_MODEL,
  maxRetries: 2,
  retryDelayMs: 1000,
};

// Low-confidence threshold — below this, classification is marked uncertain
const LOW_CONFIDENCE_THRESHOLD = 0.5;

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

// Allows tests to inject a mock client
export function setClient(client: Anthropic | null): void {
  clientInstance = client;
}

// ── JSON Extraction ──────────────────────────────────

function extractJson(text: string): unknown {
  let jsonStr = text.trim();

  // Strip markdown code fences
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  return JSON.parse(jsonStr);
}

// ── Low-Confidence Fallback ──────────────────────────

function applyLowConfidenceFallback(result: ClassificationResult): ClassificationResult {
  if (result.confidence < LOW_CONFIDENCE_THRESHOLD) {
    const fallback = {
      ...result,
      actionability: "not_actionable" as const,
      actionType: null,
      needsWebResearch: false,
      canRunNow: false,
      recommendedExecutionTime: null,
      reasoning: `[Low confidence: ${result.confidence}] ${result.reasoning}`,
      missingInputs: [
        ...result.missingInputs,
        ...(result.missingInputs.includes("more context in event description") ? [] : ["more context in event description"]),
      ],
    };
    // Re-validate after modification
    return validateOrThrow(ClassificationResultSchema, fallback);
  }
  return result;
}

// ── Status Transition ────────────────────────────────

function updateRecordWithClassification(
  record: CalendarEventRecord,
  classification: ClassificationResult,
): void {
  eventRecordStore.upsert({
    ...record,
    status: "classified",
    eventType: classification.eventType,
    actionability: classification.actionability,
    confidence: classification.confidence,
    reasoningSummary: classification.reasoning,
    classificationStale: false,
    updatedAt: new Date().toISOString(),
  });
}

// ── Main Classification Function ─────────────────────

export async function classifyEvent(
  record: CalendarEventRecord,
  options?: ClassifyOptions,
): Promise<ClassificationResult> {
  const opts = { ...DEFAULTS, ...options };
  const client = getClient();
  const userPrompt = buildClassificationPrompt(record);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: opts.model,
        max_tokens: 1024,
        system: CLASSIFICATION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });

      // Extract text content
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Claude returned no text content for classification");
      }

      // Parse JSON
      let parsed: unknown;
      try {
        parsed = extractJson(textBlock.text);
      } catch {
        throw new Error(
          `Failed to parse classification response as JSON (attempt ${attempt + 1}): ${textBlock.text.slice(0, 200)}`
        );
      }

      // Validate with Zod
      const validation = validateSafe(ClassificationResultSchema, parsed);
      if (!validation.success) {
        throw new Error(
          `Classification response failed validation (attempt ${attempt + 1}): ${validation.error}`
        );
      }

      // Apply low-confidence fallback
      const result = applyLowConfidenceFallback(validation.data);

      // Persist classification to event record (status: new -> classified)
      updateRecordWithClassification(record, result);

      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `Classification attempt ${attempt + 1}/${opts.maxRetries + 1} failed for event "${record.title}":`,
        lastError.message,
      );

      // Don't retry on the last attempt
      if (attempt < opts.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, opts.retryDelayMs * (attempt + 1)));
      }
    }
  }

  // All retries exhausted — log and throw
  const finalError = new Error(
    `Classification failed after ${opts.maxRetries + 1} attempts for event "${record.title}": ${lastError?.message}`
  );
  console.error(finalError.message);
  throw finalError;
}
