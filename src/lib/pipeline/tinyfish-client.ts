// ── TinyFish Client ──────────────────────────────────
// Interface-first design with mock + real implementations.
// Real client uses SSE streaming endpoint for live browser sessions.
// Reads the SSE stream incrementally so progress and streaming_url
// are available during execution, not only after completion.

import type { TinyFishTask, TinyFishResult } from "./types";
import { TinyFishTaskSchema, validateOrThrow } from "./validation";

// ── Interface ────────────────────────────────────────

export interface ITinyFishClient {
  runTask(task: TinyFishTask, onProgress?: (msg: string) => void, onStreamingUrl?: (url: string) => void): Promise<TinyFishResult>;
  isReal(): boolean;
}

// ── Mock Implementation ──────────────────────────────

export class MockTinyFishClient implements ITinyFishClient {
  isReal(): boolean { return false; }

  async runTask(task: TinyFishTask, onProgress?: (msg: string) => void): Promise<TinyFishResult> {
    validateOrThrow(TinyFishTaskSchema, task);
    onProgress?.("Mock: Simulating browser navigation...");
    await new Promise((r) => setTimeout(r, 1000));
    onProgress?.("Mock: Extracting content from page...");
    await new Promise((r) => setTimeout(r, 1000));
    onProgress?.("Mock: Task complete");
    return {
      taskId: task.id,
      status: "completed",
      extractedData: {
        pageTitle: `Content from ${task.url}`,
        content: this.generateMockContent(task),
      },
      progressMessages: ["Mock: Simulating browser navigation...", "Mock: Extracting content from page...", "Mock: Task complete"],
    };
  }

  private generateMockContent(task: TinyFishTask): string {
    const t = task.instructions.toLowerCase();
    if (t.includes("study")) return "Key topics: Cell Biology, Genetics. Practice problems from portal.";
    if (t.includes("meeting")) return "Meeting context: Agenda shared, stakeholders identified.";
    if (t.includes("doc") || t.includes("google")) return "Google Doc created with study materials.";
    return `Extracted content from ${task.url}: Key information gathered.`;
  }
}

// ── Real TinyFish SSE Client ────────────────────────

export class TinyFishClient implements ITinyFishClient {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  isReal(): boolean { return true; }

  async runTask(
    task: TinyFishTask,
    onProgress?: (msg: string) => void,
    onStreamingUrl?: (url: string) => void,
  ): Promise<TinyFishResult> {
    validateOrThrow(TinyFishTaskSchema, task);

    const result: TinyFishResult = {
      taskId: task.id,
      status: "failed",
      progressMessages: [],
    };

    try {
      // Validate goal is present — TinyFish API requires a non-empty "goal" field
      const goal = task.instructions;
      if (!goal || goal.trim().length === 0) {
        throw new Error("TinyFish task has no goal/instructions — cannot start browser session");
      }

      const response = await fetch(`${this.apiUrl}/automation/run-sse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          url: task.url,
          goal,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`TinyFish SSE failed (${response.status}): ${body}`);
      }

      // ── Read SSE stream incrementally ─────────────
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("TinyFish SSE response has no readable body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent: string | null = null;
      let currentData = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines from the buffer
        const lines = buffer.split("\n");
        // Keep the last partial line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            currentData = line.slice(6);
          } else if (line === "" && currentEvent) {
            // Empty line = end of SSE event
            this.handleSSEEvent(currentEvent, currentData, result, onProgress, onStreamingUrl);
            currentEvent = null;
            currentData = "";
          }
        }
      }

      // Handle any remaining event after stream ends
      if (currentEvent) {
        this.handleSSEEvent(currentEvent, currentData, result, onProgress, onStreamingUrl);
      }

      // If no streaming_url from SSE events, try fetching the run object
      if (!result.streamingUrl && result.runId) {
        const streamUrl = await this.fetchStreamingUrlFromRun(result.runId);
        if (streamUrl) {
          result.streamingUrl = streamUrl;
          onStreamingUrl?.(streamUrl);
          onProgress?.("Live browser stream available (from run object)");
        }
      }

      // If stream ended without explicit completion
      if (result.status !== "completed" && result.status !== "failed") {
        result.status = "completed";
        result.extractedData = result.extractedData ?? { note: "Stream ended without explicit completion" };
      }

    } catch (err) {
      result.status = "failed";
      result.error = err instanceof Error ? err.message : String(err);
      onProgress?.(`TinyFish failed: ${result.error}`);
    }

    return result;
  }

  // ── SSE Event Handler ─────────────────────────────

  private handleSSEEvent(
    event: string,
    data: string,
    result: TinyFishResult,
    onProgress?: (msg: string) => void,
    onStreamingUrl?: (url: string) => void,
  ): void {
    switch (event) {
      case "STARTED": {
        try {
          const parsed = JSON.parse(data);
          result.runId = parsed.run_id ?? parsed.id;
          result.taskId = result.runId ?? result.taskId;
        } catch { /* use existing taskId */ }
        onProgress?.(`TinyFish session started${result.runId ? ` (${result.runId})` : ""}`);
        break;
      }
      case "STREAMING_URL": {
        let url: string | undefined;
        try {
          const parsed = JSON.parse(data);
          url = parsed.url ?? parsed.streaming_url;
        } catch {
          // data might be a plain URL
          if (data.trim().startsWith("http")) url = data.trim();
        }
        if (url) {
          result.streamingUrl = url;
          onStreamingUrl?.(url);
          onProgress?.("Live browser stream available");
        }
        break;
      }
      case "PROGRESS": {
        let msg: string;
        try {
          const parsed = JSON.parse(data);
          msg = parsed.message ?? parsed.status ?? data;
        } catch {
          msg = data;
        }
        result.progressMessages?.push(msg);
        onProgress?.(msg);
        break;
      }
      case "COMPLETE": {
        result.status = "completed";
        try {
          const parsed = JSON.parse(data);
          result.extractedData = parsed.result ?? parsed.extracted_data ?? parsed;
          result.screenshots = parsed.screenshots ?? parsed.screenshot_urls;
        } catch {
          result.extractedData = { rawResponse: data };
        }
        onProgress?.("TinyFish task completed");
        break;
      }
      case "ERROR": {
        result.status = "failed";
        try {
          const parsed = JSON.parse(data);
          result.error = parsed.message ?? parsed.error ?? data;
        } catch {
          result.error = data;
        }
        onProgress?.(`TinyFish error: ${result.error}`);
        break;
      }
      case "DONE": {
        if (result.status !== "completed" && result.status !== "failed") {
          result.status = "completed";
        }
        break;
      }
    }
  }

  // ── Fetch streaming_url from run object (fallback) ─

  private async fetchStreamingUrlFromRun(runId: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.apiUrl}/automation/runs/${runId}`, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.streaming_url ?? data.stream_url ?? data.live_url ?? null;
    } catch {
      return null;
    }
  }

  // ── Legacy fallback ───────────────────────────────

  private async runLegacyTask(task: TinyFishTask, onProgress?: (msg: string) => void): Promise<TinyFishResult> {
    onProgress?.("Using legacy TinyFish task API...");
    const submitRes = await fetch(`${this.apiUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": this.apiKey },
      body: JSON.stringify({ id: task.id, url: task.url, goal: task.instructions, timeout_ms: task.timeoutMs }),
    });
    if (!submitRes.ok) {
      throw new Error(`TinyFish legacy submit failed (${submitRes.status}): ${await submitRes.text().catch(() => "")}`);
    }
    const submitData = await submitRes.json();
    const taskId = submitData.task_id ?? task.id;

    const start = Date.now();
    while (Date.now() - start < task.timeoutMs) {
      const statusRes = await fetch(`${this.apiUrl}/tasks/${taskId}`, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (statusRes.ok) {
        const data = await statusRes.json();
        if (data.status === "completed") {
          onProgress?.("TinyFish task completed (legacy)");
          return { taskId, status: "completed", extractedData: data.extracted_data ?? data.result, screenshots: data.screenshots };
        }
        if (data.status === "failed") {
          return { taskId, status: "failed", error: data.error ?? "Task failed" };
        }
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return { taskId, status: "timeout", error: `Timed out after ${task.timeoutMs}ms` };
  }
}

// ── Factory ──────────────────────────────────────────

export function createTinyFishClient(): ITinyFishClient {
  const apiUrl = process.env.TINYFISH_API_URL;
  const apiKey = process.env.TINYFISH_API_KEY;
  if (apiUrl && apiKey) return new TinyFishClient(apiUrl, apiKey);
  return new MockTinyFishClient();
}
