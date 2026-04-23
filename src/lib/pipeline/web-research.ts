// ── Web Research Client ─────────────────────────────
// Claude-powered web research for gathering context.
// Uses Claude to synthesize web context from URLs and search queries.
// No external browser service required.

import Anthropic from "@anthropic-ai/sdk";

export interface WebResearchTask {
  id: string;
  query: string;
  urls?: string[];
  instructions: string;
}

export interface WebResearchResult {
  taskId: string;
  status: "completed" | "failed";
  synthesizedContext?: string;
  error?: string;
}

// ── Claude Client ───────────────────────────────────

let clientInstance: Anthropic | null = null;

function getClient(): Anthropic {
  if (!clientInstance) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is required");
    clientInstance = new Anthropic({ apiKey });
  }
  return clientInstance;
}

// ── Web Research via Claude ─────────────────────────

export async function executeWebResearch(
  task: WebResearchTask,
  onProgress?: (msg: string) => void,
): Promise<WebResearchResult> {
  const client = getClient();
  onProgress?.("Researching context...");

  try {
    const contextParts = [
      `Research task: ${task.instructions}`,
    ];

    if (task.urls?.length) {
      contextParts.push(`\nRelevant URLs to consider: ${task.urls.join(", ")}`);
    }

    if (task.query) {
      contextParts.push(`\nSearch context: ${task.query}`);
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: "You are a research assistant. Synthesize useful context based on the given instructions and any URLs or search queries provided. Be specific and factual. Focus on actionable information.",
      messages: [{ role: "user", content: contextParts.join("\n") }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const content = textBlock?.type === "text" ? textBlock.text : "";

    onProgress?.("Research complete");

    return {
      taskId: task.id,
      status: "completed",
      synthesizedContext: content,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    onProgress?.(`Research failed: ${error}`);
    return {
      taskId: task.id,
      status: "failed",
      error,
    };
  }
}
