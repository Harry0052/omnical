"use client";

import { cn } from "@/lib/utils";

type PipelineStatus = "analyzing" | "planning" | "queued" | "awaiting_approval" | "executing" | "completed" | "failed" | "stale";

const statusConfig: Record<PipelineStatus, { label: string; dotClass: string; textClass: string }> = {
  analyzing: { label: "Analyzing", dotClass: "bg-blue-500 animate-pulse", textClass: "text-blue-600" },
  planning: { label: "Planning", dotClass: "bg-blue-500 animate-pulse", textClass: "text-blue-600" },
  queued: { label: "Queued", dotClass: "bg-blue-500 animate-pulse", textClass: "text-blue-600" },
  awaiting_approval: { label: "Needs Approval", dotClass: "bg-amber-500 animate-pulse", textClass: "text-amber-600" },
  executing: { label: "Executing", dotClass: "bg-blue-500 animate-pulse", textClass: "text-blue-600" },
  completed: { label: "Ready", dotClass: "bg-emerald-500", textClass: "text-emerald-600" },
  failed: { label: "Failed", dotClass: "bg-red-500", textClass: "text-red-600" },
  stale: { label: "Stale", dotClass: "bg-amber-500", textClass: "text-amber-600" },
};

export function PipelineBadge({
  status,
  className,
}: {
  status: PipelineStatus | "none" | undefined;
  className?: string;
}) {
  if (!status || status === "none") return null;

  const config = statusConfig[status];
  if (!config) return null;

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("size-[5px] rounded-full shrink-0", config.dotClass)} />
      <span className={cn("text-[10px] font-medium uppercase tracking-widest", config.textClass)}>
        {config.label}
      </span>
    </span>
  );
}
