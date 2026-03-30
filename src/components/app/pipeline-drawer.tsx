"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Sparkles, CheckCircle2, XCircle, Clock, ArrowRight,
  RotateCcw, Brain, Globe, FileText, AlertTriangle, Loader2,
  Zap, Server,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePipelineRun } from "@/lib/pipeline/hooks";
import { PipelineBadge } from "./pipeline-badge";
import type { PipelineRun, ActionStep, Artifact, PipelineLogEntry, ServiceName, TinyFishUsageStatus } from "@/lib/pipeline/types";

// ── Service Icons ───────────────────────────────────

function ServiceIcon({ service, className }: { service?: ServiceName; className?: string }) {
  switch (service) {
    case "claude": return <Brain className={cn("size-3 text-violet-500", className)} />;
    case "tinyfish": return <Globe className={cn("size-3 text-blue-500", className)} />;
    case "integration": return <FileText className={cn("size-3 text-amber-500", className)} />;
    case "synthesizer": return <Sparkles className={cn("size-3 text-emerald-500", className)} />;
    default: return <Zap className={cn("size-3 text-[#9ca3af]", className)} />;
  }
}

// ── Step Status Icon ─────────────────────────────────

function StepIcon({ status }: { status: ActionStep["status"] }) {
  switch (status) {
    case "completed": return <CheckCircle2 className="size-3.5 text-emerald-500" />;
    case "failed": return <XCircle className="size-3.5 text-red-500" />;
    case "running": return <Loader2 className="size-3.5 text-blue-500 animate-spin" />;
    case "skipped": return <ArrowRight className="size-3.5 text-[#9ca3af]" />;
    default: return <Clock className="size-3.5 text-[#d7d8d8]" />;
  }
}

function StepTypeIcon({ type }: { type: ActionStep["type"] }) {
  switch (type) {
    case "claude_generate": return <Brain className="size-3 text-violet-500" />;
    case "tinyfish_browse": return <Globe className="size-3 text-blue-500" />;
    case "integration_fetch": return <FileText className="size-3 text-amber-500" />;
    case "artifact_create": return <Sparkles className="size-3 text-emerald-500" />;
  }
}

// ── Service Mode Badge ──────────────────────────────

function ServiceModeBadge({ mode }: { mode: "real" | "mock" | "unavailable" }) {
  if (mode === "real") {
    return (
      <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 uppercase tracking-wider">
        Live
      </span>
    );
  }
  if (mode === "mock") {
    return (
      <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wider">
        Simulated
      </span>
    );
  }
  return (
    <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 uppercase tracking-wider">
      Unavailable
    </span>
  );
}

// ── TinyFish Usage Badge (truthful) ────────────────
// Shows actual TinyFish usage — not just whether env vars are set

function TinyFishUsageBadge({ usage }: { usage?: TinyFishUsageStatus }) {
  switch (usage) {
    case "active":
      return (
        <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 uppercase tracking-wider">
          Active
        </span>
      );
    case "completed":
      return (
        <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 uppercase tracking-wider">
          Used
        </span>
      );
    case "failed":
      return (
        <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 uppercase tracking-wider">
          Failed
        </span>
      );
    case "planned":
      return (
        <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 uppercase tracking-wider">
          Planned
        </span>
      );
    case "skipped":
      return (
        <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wider">
          Skipped
        </span>
      );
    case "not_planned":
    default:
      return (
        <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 uppercase tracking-wider">
          Not used
        </span>
      );
  }
}

// ── Live Status Header ──────────────────────────────

function LiveStatusHeader({ run }: { run: PipelineRun }) {
  // Find the latest log entry with a label for the current status
  const latestLabel = [...run.log].reverse().find((e) => e.label)?.label;
  const isTerminal = run.stage === "completed" || run.stage === "failed";
  const elapsed = getElapsed(run.createdAt, run.completedAt);

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1.5">
        {!isTerminal && (
          <span className="relative flex size-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full size-2 bg-blue-500" />
          </span>
        )}
        {run.stage === "completed" && <CheckCircle2 className="size-3.5 text-emerald-500" />}
        {run.stage === "failed" && <XCircle className="size-3.5 text-red-500" />}
        <p className={cn(
          "text-[13px] font-medium",
          run.stage === "failed" ? "text-red-600" : "text-[#1a1a1a]",
        )}>
          {latestLabel || run.stage}
        </p>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-[#9ca3af]">
        <span>{elapsed}</span>
        {run.serviceMode && (
          <>
            <span className="flex items-center gap-1">
              <Brain className="size-2.5" /> Claude: <ServiceModeBadge mode={run.serviceMode.claude} />
            </span>
            <span className="flex items-center gap-1">
              <Globe className="size-2.5" /> TinyFish: <TinyFishUsageBadge usage={run.serviceMode.tinyfishUsage} />
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function getElapsed(start: string, end?: string): string {
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.round((endMs - startMs) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

// ── Classification Panel ─────────────────────────────

function ClassificationPanel({ run }: { run: PipelineRun }) {
  if (!run.classification) return null;
  const c = run.classification;

  return (
    <div className="rounded-xl border border-black/[0.06] bg-[#f9fafb] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="size-3.5 text-violet-500" />
        <span className="text-[11px] font-semibold text-[#1a1a1a] uppercase tracking-wider">Classification</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <span className="text-[#9ca3af]">Type</span>
          <p className="font-medium text-[#1a1a1a] capitalize">{c.eventType}</p>
        </div>
        <div>
          <span className="text-[#9ca3af]">Actionability</span>
          <p className="font-medium text-[#1a1a1a] capitalize">{c.actionability.replace("_", " ")}</p>
        </div>
        <div>
          <span className="text-[#9ca3af]">Urgency</span>
          <p className="font-medium text-[#1a1a1a] capitalize">{c.urgency}</p>
        </div>
        <div>
          <span className="text-[#9ca3af]">Confidence</span>
          <p className="font-medium text-[#1a1a1a]">{Math.round(c.confidence * 100)}%</p>
        </div>
      </div>
      {c.reasoning && (
        <p className="text-[11px] text-[#818380] mt-3 leading-relaxed border-t border-black/[0.04] pt-2">
          {c.reasoning}
        </p>
      )}
    </div>
  );
}

// ── Action Plan Steps ────────────────────────────────

function ActionPlanPanel({ run }: { run: PipelineRun }) {
  if (!run.actionPlan) return null;
  const serviceMode = run.serviceMode;

  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-blue-500" />
          <span className="text-[11px] font-semibold text-[#1a1a1a] uppercase tracking-wider">Action Plan</span>
        </div>
        <span className="text-[10px] text-[#9ca3af] font-mono">
          {run.actionPlan.workflowType.replace(/_/g, " ")}
        </span>
      </div>
      <div className="space-y-1.5">
        {run.actionPlan.steps.map((step) => (
          <div key={step.id} className="flex items-start gap-2.5 py-1.5">
            <StepIcon status={step.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <StepTypeIcon type={step.type} />
                <p className={cn(
                  "text-[11px] font-medium truncate",
                  step.status === "skipped" ? "text-[#9ca3af] line-through" : "text-[#1a1a1a]"
                )}>
                  {step.description}
                </p>
                {/* Service mode badge — TinyFish shows actual usage, Claude shows config */}
                {step.type === "tinyfish_browse" && serviceMode && (
                  <TinyFishUsageBadge usage={serviceMode.tinyfishUsage} />
                )}
                {step.type === "claude_generate" && serviceMode && (
                  <ServiceModeBadge mode={serviceMode.claude} />
                )}
              </div>
              {step.error && (
                <p className="text-[10px] text-red-500 mt-0.5">{step.error}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TinyFish Active Status Card ─────────────────────

function TinyFishStatusCard({ run }: { run: PipelineRun }) {
  // Only show when a TinyFish step is currently running
  const activeTfStep = run.actionPlan?.steps.find(
    (s) => s.type === "tinyfish_browse" && s.status === "running",
  );
  if (!activeTfStep) return null;

  const urls = (activeTfStep.input as { urls?: string[] }).urls ?? [];
  const isReal = run.serviceMode?.tinyfish === "real";
  const elapsed = activeTfStep.startedAt ? getElapsed(activeTfStep.startedAt) : "0s";
  const streamingUrl = run.tinyFishStreamingUrl;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Globe className="size-3.5 text-blue-500" />
        <span className="text-[11px] font-semibold text-blue-900">
          {isReal ? "TinyFish is working on the live web" : "Simulating web browsing"}
        </span>
        <ServiceModeBadge mode={isReal ? "real" : "mock"} />
      </div>

      {/* Live PiP browser preview — only when real streaming URL is available */}
      {streamingUrl && isReal && (
        <div className="mb-3 rounded-lg overflow-hidden border border-blue-300 bg-black">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-900/80 text-[9px] text-blue-200">
            <span className="relative flex size-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full size-1.5 bg-red-500" />
            </span>
            Live browser session
          </div>
          <iframe
            src={streamingUrl}
            className="w-full h-[200px] border-0"
            sandbox="allow-same-origin allow-scripts"
            title="TinyFish live browser session"
          />
        </div>
      )}

      {urls.length > 0 && (
        <div className="space-y-1 mb-2">
          {urls.map((url, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Loader2 className="size-2.5 text-blue-400 animate-spin shrink-0" />
              <span className="text-[10px] text-blue-700 truncate font-mono">{url}</span>
            </div>
          ))}
        </div>
      )}
      {run.tinyFishRunId && (
        <p className="text-[9px] text-blue-400 font-mono mb-1">Run: {run.tinyFishRunId}</p>
      )}
      <span className="text-[10px] text-blue-500">{elapsed} elapsed</span>
    </div>
  );
}

// ── Live Execution Log ──────────────────────────────

function LiveLogPanel({ run }: { run: PipelineRun }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLogCount = useRef(run.log.length);

  // Auto-scroll to bottom when new log entries arrive
  useEffect(() => {
    if (run.log.length > prevLogCount.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevLogCount.current = run.log.length;
  }, [run.log.length]);

  if (run.log.length === 0) return null;

  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="size-3.5 text-[#818380]" />
        <span className="text-[11px] font-semibold text-[#1a1a1a] uppercase tracking-wider">Live Log</span>
        {run.stage !== "completed" && run.stage !== "failed" && (
          <span className="relative flex size-1.5 ml-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full size-1.5 bg-blue-500" />
          </span>
        )}
      </div>
      <div ref={scrollRef} className="space-y-1 max-h-[300px] overflow-y-auto">
        {run.log.map((entry, i) => (
          <LogEntry key={i} entry={entry} isLatest={i === run.log.length - 1 && run.stage !== "completed" && run.stage !== "failed"} />
        ))}
      </div>
    </div>
  );
}

function LogEntry({ entry, isLatest }: { entry: PipelineLogEntry; isLatest: boolean }) {
  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  return (
    <div className={cn("flex items-start gap-2 py-1", isLatest && "bg-blue-50/50 -mx-1 px-1 rounded")}>
      <span className="text-[9px] font-mono text-[#9ca3af] shrink-0 mt-0.5 w-12">{time}</span>
      <ServiceIcon service={entry.service} className="shrink-0 mt-0.5" />
      <p className={cn(
        "text-[10px] leading-relaxed flex-1",
        entry.label ? "text-[#1a1a1a] font-medium" : "text-[#818380]",
      )}>
        {entry.label || entry.message}
      </p>
    </div>
  );
}

// ── Artifact Cards ───────────────────────────────────

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const isNew = Date.now() - new Date(artifact.createdAt).getTime() < 5 * 60 * 1000;
  const generatedAt = new Date(artifact.createdAt).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  return (
    <div className={cn(
      "rounded-xl border p-4",
      artifact.stale ? "border-amber-200 bg-amber-50/50" : "border-black/[0.06] bg-white"
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileText className={cn("size-3.5", artifact.stale ? "text-amber-500" : "text-emerald-500")} />
          <span className="text-[11px] font-semibold text-[#1a1a1a]">{artifact.title}</span>
          {isNew && !artifact.stale && (
            <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 uppercase tracking-wider">
              New
            </span>
          )}
        </div>
        {artifact.stale && (
          <span className="text-[9px] font-medium text-amber-600 uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="size-2.5" /> Stale
          </span>
        )}
      </div>
      <p className="text-[11px] text-[#818380] leading-relaxed mb-2">{artifact.summary}</p>

      {/* Artifact content sections */}
      {artifact.content?.sections && artifact.content.sections.length > 0 ? (
        <div className="mt-3 space-y-2.5 border-t border-black/[0.04] pt-3">
          {artifact.content.sections.map((section, idx) => (
            <div key={idx}>
              <h4 className="text-[11px] font-semibold text-[#1a1a1a] mb-1">{section.heading}</h4>
              {section.body && (
                <p className="text-[10px] text-[#818380] leading-relaxed mb-1">{section.body}</p>
              )}
              {section.items && section.items.length > 0 && (
                <ul className="space-y-0.5">
                  {section.items.map((item, i) => (
                    <li key={i} className="text-[10px] text-[#6b7280] leading-relaxed flex items-start gap-1.5">
                      <span className="text-[#9ca3af] mt-0.5 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-[#9ca3af] italic mt-2">No detailed content was generated</p>
      )}

      <div className="flex items-center gap-3 text-[10px] text-[#9ca3af] mt-2">
        <span className="capitalize">{artifact.type.replace(/_/g, " ")}</span>
        <span>{artifact.confidence} confidence</span>
        <span>Generated {generatedAt}</span>
        {artifact.stale && <span className="text-amber-500">Event changed since generation</span>}
        {artifact.documentUrl && (
          <a href={artifact.documentUrl} target="_blank" rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-600 flex items-center gap-1">
            Open Doc <ArrowRight className="size-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Main Drawer ──────────────────────────────────────

export function PipelineDrawer({
  open,
  onClose,
  runId,
  artifacts,
  onRetry,
  onReanalyze,
  onApprove,
}: {
  open: boolean;
  onClose: () => void;
  runId: string | null;
  artifacts?: Artifact[];
  onRetry?: (runId: string) => void;
  onReanalyze?: () => void;
  onApprove?: (runId: string) => void;
}) {
  const { run } = usePipelineRun(open ? runId : null);

  const pipelineStatus = run
    ? run.stage === "completed" ? "completed"
      : run.stage === "failed" ? "failed"
      : run.stage === "classifying" || run.stage === "classified" ? "analyzing"
      : run.stage === "planning" || run.stage === "planned" ? "planning"
      : "executing"
    : undefined;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-[480px] bg-[#f7f7f6] border-l border-black/[0.08] z-50 overflow-y-auto"
          >
            <div className="p-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="size-7 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Sparkles className="size-3.5 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-semibold text-[#1a1a1a]">Pipeline Details</h2>
                    <PipelineBadge status={pipelineStatus} />
                  </div>
                </div>
                <button onClick={onClose} className="size-7 rounded-lg border border-black/[0.06] flex items-center justify-center text-[#9ca3af] hover:text-[#1a1a1a] hover:bg-white transition-colors cursor-pointer">
                  <X className="size-3.5" />
                </button>
              </div>

              {/* Content */}
              {run ? (
                <div className="space-y-3">
                  {/* Live status */}
                  <LiveStatusHeader run={run} />

                  {/* TinyFish active card — only when truly running */}
                  <TinyFishStatusCard run={run} />

                  {/* TinyFish not-used notice — shown when run is done and TinyFish wasn't used */}
                  {(run.stage === "completed" || run.stage === "failed") &&
                    run.serviceMode?.tinyfishUsage === "not_planned" && (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3">
                      <div className="flex items-center gap-2">
                        <Globe className="size-3 text-zinc-400" />
                        <span className="text-[10px] text-zinc-500">
                          No browser work was needed or performed
                        </span>
                      </div>
                      {run.serviceMode.tinyfishUsageReason && (
                        <p className="text-[9px] text-zinc-400 mt-1 ml-5">
                          {run.serviceMode.tinyfishUsageReason}
                        </p>
                      )}
                    </div>
                  )}

                  <ClassificationPanel run={run} />
                  <ActionPlanPanel run={run} />

                  {/* Artifacts */}
                  {artifacts && artifacts.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[11px] font-semibold text-[#1a1a1a] uppercase tracking-wider">Artifacts</span>
                      {artifacts.map((a) => <ArtifactCard key={a.id} artifact={a} />)}
                    </div>
                  )}

                  <LiveLogPanel run={run} />

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    {run.stage === "awaiting_approval" && onApprove && (
                      <button
                        onClick={() => onApprove(run.id)}
                        className="h-8 px-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="size-3" /> Approve & Execute
                      </button>
                    )}
                    {run.stage === "failed" && onRetry && (
                      <button
                        onClick={() => onRetry(run.id)}
                        className="h-8 px-3 rounded-lg border border-black/[0.08] bg-white hover:bg-[#f9fafb] text-[11px] font-medium text-[#818380] hover:text-[#1a1a1a] transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="size-3" /> Retry
                      </button>
                    )}
                    {artifacts?.some((a) => a.stale) && onReanalyze && (
                      <button
                        onClick={onReanalyze}
                        className="h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="size-3" /> Re-analyze
                      </button>
                    )}
                  </div>
                </div>
              ) : runId ? (
                <div className="py-12 text-center">
                  <Loader2 className="size-5 text-blue-500 animate-spin mx-auto mb-3" />
                  <p className="text-[12px] text-[#818380]">Loading pipeline data...</p>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <p className="text-[12px] text-[#818380]">No pipeline data available</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
