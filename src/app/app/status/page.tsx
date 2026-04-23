"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity, Brain, Globe, FileText, Sparkles, Clock, CheckCircle2,
  XCircle, Loader2, ChevronDown, ChevronUp, ArrowRight, AlertTriangle,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type {
  PipelineRun, PipelineLogEntry, ServiceName, Artifact,
} from "@/lib/pipeline/types";

// ── Types ───────────────────────────────────────────

interface EnrichedRun extends PipelineRun {
  eventTitle: string;
  eventDescription?: string;
  artifacts: Array<{
    id: string;
    title: string;
    type: string;
    stale: boolean;
    createdAt: string;
  }>;
}

// ── Data Fetching ───────────────────────────────────

function useRuns() {
  const [runs, setRuns] = useState<EnrichedRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline/runs");
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
    // Poll every 2s for live updates
    intervalRef.current = setInterval(fetchRuns, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchRuns]);

  return { runs, isLoading, refetch: fetchRuns };
}

// ── Helpers ─────────────────────────────────────────

function isActive(run: EnrichedRun): boolean {
  return !["completed", "failed"].includes(run.stage);
}

function getElapsed(start: string, end?: string): string {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const sec = Math.round((e - s) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}

function getStageColor(stage: string): string {
  switch (stage) {
    case "completed": return "text-emerald-600";
    case "failed": return "text-red-600";
    case "awaiting_approval": return "text-amber-600";
    default: return "text-blue-600";
  }
}

function getStageIcon(stage: string) {
  switch (stage) {
    case "completed": return <CheckCircle2 className="size-4 text-emerald-500" />;
    case "failed": return <XCircle className="size-4 text-red-500" />;
    case "awaiting_approval": return <Clock className="size-4 text-amber-500" />;
    default: return <Loader2 className="size-4 text-blue-500 animate-spin" />;
  }
}

function ServiceIcon({ service, className }: { service?: ServiceName; className?: string }) {
  switch (service) {
    case "claude": return <Brain className={cn("size-3 text-violet-500", className)} />;
    case "context_engine": return <Globe className={cn("size-3 text-blue-500", className)} />;
    case "integration": return <FileText className={cn("size-3 text-amber-500", className)} />;
    case "synthesizer": return <Sparkles className={cn("size-3 text-emerald-500", className)} />;
    default: return <Zap className={cn("size-3 text-[#9ca3af]", className)} />;
  }
}

function ServiceBadge({ mode }: { mode: "real" | "mock" | "unavailable" }) {
  if (mode === "real") return <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 uppercase tracking-wider">Live</span>;
  if (mode === "mock") return <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wider">Simulated</span>;
  return <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 uppercase tracking-wider">Unavailable</span>;
}


// ── Run Log ─────────────────────────────────────────

function RunLog({ run }: { run: EnrichedRun }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(run.log.length);

  useEffect(() => {
    if (run.log.length > prevCount.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevCount.current = run.log.length;
  }, [run.log.length]);

  if (run.log.length === 0) return null;

  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="size-3.5 text-[#818380]" />
        <span className="text-[11px] font-semibold text-[#1a1a1a] uppercase tracking-wider">Live Log</span>
        {isActive(run) && (
          <span className="relative flex size-1.5 ml-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full size-1.5 bg-blue-500" />
          </span>
        )}
      </div>
      <div ref={scrollRef} className="space-y-0.5 max-h-[250px] overflow-y-auto">
        {run.log.map((entry, i) => {
          const isLatest = i === run.log.length - 1 && isActive(run);
          return (
            <div key={i} className={cn("flex items-start gap-2 py-1", isLatest && "bg-blue-50/50 -mx-1 px-1 rounded")}>
              <span className="text-[9px] font-mono text-[#9ca3af] shrink-0 mt-0.5 w-12">
                {new Date(entry.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <ServiceIcon service={entry.service} className="shrink-0 mt-0.5" />
              <p className={cn(
                "text-[10px] leading-relaxed flex-1",
                entry.label ? "text-[#1a1a1a] font-medium" : "text-[#818380]",
              )}>
                {entry.label || entry.message}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Run Card ────────────────────────────────────────

function RunCard({ run }: { run: EnrichedRun }) {
  const [expanded, setExpanded] = useState(() => isActive(run));
  const active = isActive(run);
  const latestLabel = [...run.log].reverse().find((e) => e.label)?.label;
  const elapsed = getElapsed(run.createdAt, run.completedAt);

  return (
    <div className={cn(
      "rounded-xl border bg-white transition-all",
      active ? "border-blue-200 shadow-[0_2px_8px_rgba(59,130,246,0.08)]" : "border-black/[0.06]",
    )}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 cursor-pointer"
      >
        <div className="flex items-start gap-3">
          {getStageIcon(run.stage)}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-[13px] font-semibold text-[#1a1a1a] truncate">
                {run.eventTitle}
              </h3>
              {active && latestLabel && (
                <span className="text-[10px] text-blue-600 font-medium shrink-0">
                  {latestLabel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[#9ca3af]">
              <span className={cn("font-medium capitalize", getStageColor(run.stage))}>
                {run.stage.replace(/_/g, " ")}
              </span>
              <span>{elapsed}</span>
              {run.serviceMode && (
                <>
                  <span className="flex items-center gap-1">
                    <Brain className="size-2.5" /> <ServiceBadge mode={run.serviceMode.claude} />
                  </span>
                </>
              )}
              {run.actionPlan && (
                <span className="font-mono">{run.actionPlan.workflowType.replace(/_/g, " ")}</span>
              )}
            </div>
          </div>
          <div className="shrink-0 mt-1">
            {expanded ? <ChevronUp className="size-3.5 text-[#9ca3af]" /> : <ChevronDown className="size-3.5 text-[#9ca3af]" />}
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-black/[0.04] pt-3">
          {/* Error */}
          {run.error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <XCircle className="size-3 text-red-500" />
                <span className="text-[11px] font-medium text-red-700">Error</span>
              </div>
              <p className="text-[10px] text-red-600">{run.error}</p>
            </div>
          )}

          {/* Artifacts */}
          {run.artifacts.length > 0 && (
            <div className="rounded-xl border border-black/[0.06] bg-[#f9fafb] p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="size-3.5 text-emerald-500" />
                <span className="text-[11px] font-semibold text-[#1a1a1a] uppercase tracking-wider">Output</span>
              </div>
              {run.artifacts.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-3 text-emerald-500" />
                    <span className="text-[11px] font-medium text-[#1a1a1a]">{a.title}</span>
                    {a.stale && (
                      <span className="text-[8px] text-amber-600 font-medium uppercase flex items-center gap-0.5">
                        <AlertTriangle className="size-2" /> Stale
                      </span>
                    )}
                  </div>
                  <Link href="/app/inbox" className="text-[10px] text-blue-500 hover:text-blue-600 flex items-center gap-1">
                    View in Inbox <ArrowRight className="size-2.5" />
                  </Link>
                </div>
              ))}
            </div>
          )}

          {/* Live log */}
          <RunLog run={run} />

          {/* Run metadata */}
          <div className="flex items-center gap-4 text-[9px] text-[#9ca3af] font-mono pt-1">
            <span>Run: {run.id}</span>
            <span>Started: {new Date(run.createdAt).toLocaleTimeString()}</span>
            {run.completedAt && <span>Completed: {new Date(run.completedAt).toLocaleTimeString()}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────

export default function StatusPage() {
  const { runs, isLoading } = useRuns();

  const activeRuns = runs.filter(isActive);
  const recentRuns = runs.filter((r) => !isActive(r));

  return (
    <div className="p-6 lg:p-8 max-w-[860px] mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[22px] font-semibold text-[#1a1a1a] tracking-tight">Status</h1>
          {activeRuns.length > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              {activeRuns.length} active
            </span>
          )}
        </div>
        <p className="text-[13px] text-[#818380] mt-0.5">
          Pipeline runs and service activity
        </p>
      </div>

      {isLoading ? (
        <div className="py-16 text-center">
          <Loader2 className="size-5 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-[12px] text-[#818380]">Loading runs...</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.08] bg-white p-8 text-center">
          <div className="size-14 mx-auto rounded-2xl bg-[#f0f0ef] flex items-center justify-center mb-5">
            <Activity className="size-6 text-[#9ca3af]" />
          </div>
          <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-2">No pipeline runs yet</h2>
          <p className="text-[13px] text-[#818380] leading-relaxed max-w-md mx-auto mb-4">
            Analyze a calendar event to see real-time pipeline progress here.
          </p>
          <Link href="/app/calendar" className="inline-flex h-9 px-4 rounded-xl text-[12px] font-medium bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white transition-colors items-center gap-1.5">
            Go to calendar <ArrowRight className="size-3" />
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active runs */}
          {activeRuns.length > 0 && (
            <section>
              <h2 className="text-[11px] font-semibold text-[#1a1a1a] uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="relative flex size-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full size-2 bg-blue-500" />
                </span>
                Active Now
              </h2>
              <div className="space-y-2">
                {activeRuns.map((run) => <RunCard key={run.id} run={run} />)}
              </div>
            </section>
          )}

          {/* Recent runs */}
          {recentRuns.length > 0 && (
            <section>
              <h2 className="text-[11px] font-semibold text-[#1a1a1a] uppercase tracking-wider mb-3">
                Recent Runs
              </h2>
              <div className="space-y-2">
                {recentRuns.map((run) => <RunCard key={run.id} run={run} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
