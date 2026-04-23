"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckSquare,
  CircleDot,
  RefreshCw,
  Zap,
  Calendar,
  X,
  Check,
  ChevronUp,
  ChevronRight,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  title: string;
  sourceSnippet?: string;
  dueDate?: string;
  priority: "high" | "medium" | "low";
  confidence?: string;
  status: "pending" | "completed" | "dismissed";
}

const priorityConfig = {
  high: { label: "High", bg: "bg-rose-50", text: "text-rose-600", icon: ChevronUp },
  medium: { label: "Medium", bg: "bg-amber-50", text: "text-amber-600", icon: Minus },
  low: { label: "Low", bg: "bg-emerald-50", text: "text-emerald-600", icon: ChevronRight },
};

const priorityOrder: Array<"high" | "medium" | "low"> = ["high", "medium", "low"];

function TaskCard({
  task,
  onComplete,
  onDismiss,
}: {
  task: Task;
  onComplete: () => void;
  onDismiss: () => void;
}) {
  const config = priorityConfig[task.priority];
  const Icon = config.icon;

  return (
    <div className="w-full rounded-xl border border-black/[0.06] bg-white p-4 transition-all group">
      <div className="flex items-start gap-3">
        <div className={cn("size-9 rounded-lg flex items-center justify-center shrink-0", config.bg)}>
          <Icon className={cn("size-4", config.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-[13px] font-semibold text-[#1a1a1a] truncate">{task.title}</h3>
            <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0", config.bg, config.text)}>
              {config.label}
            </span>
          </div>
          {task.sourceSnippet && (
            <p className="text-[11px] text-[#818380] line-clamp-2 leading-relaxed mb-2">{task.sourceSnippet}</p>
          )}
          <div className="flex items-center gap-3 text-[10px] text-[#9ca3af]">
            {task.dueDate && (
              <span className="flex items-center gap-1">
                <Calendar className="size-2.5" />
                {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
            {task.confidence && <span>{task.confidence} confidence</span>}
            <span className="capitalize">{task.status}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onComplete}
            className="size-7 rounded-lg border border-black/[0.06] flex items-center justify-center text-[#9ca3af] hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
            title="Mark complete"
          >
            <Check className="size-3.5" />
          </button>
          <button
            onClick={onDismiss}
            className="size-7 rounded-lg border border-black/[0.06] flex items-center justify-center text-[#9ca3af] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            title="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTriaging, setIsTriaging] = useState(false);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/context-engine/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks ?? data ?? []);
      }
    } catch {
      /* silent */
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const updateTask = useCallback(async (id: string, status: "completed" | "dismissed") => {
    try {
      await fetch("/api/context-engine/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    } catch {
      /* silent */
    }
  }, []);

  const runTriage = useCallback(async () => {
    setIsTriaging(true);
    try {
      await fetch("/api/context-engine/triage", { method: "POST" });
      await fetchTasks();
    } catch {
      /* silent */
    } finally {
      setIsTriaging(false);
    }
  }, [fetchTasks]);

  const activeTasks = tasks.filter((t) => t.status === "pending");
  const grouped = Object.groupBy(activeTasks, (t) => t.priority);

  if (!isLoading && tasks.length === 0) {
    return (
      <div className="p-6 lg:p-8 max-w-[860px] mx-auto">
        <div className="mb-6">
          <h1 className="text-[22px] font-semibold text-[#1a1a1a] tracking-tight">Tasks</h1>
          <p className="text-[13px] text-[#818380] mt-0.5">Extracted tasks from your emails and events</p>
        </div>
        <div className="rounded-2xl border border-black/[0.08] bg-white p-8 text-center">
          <div className="size-14 mx-auto rounded-2xl bg-[#f0f0ef] flex items-center justify-center mb-5">
            <CheckSquare className="size-6 text-[#9ca3af]" />
          </div>
          <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-2">No tasks yet</h2>
          <p className="text-[13px] text-[#818380] leading-relaxed max-w-md mx-auto mb-6">
            Run a triage to let Omni Cal scan your emails and calendar events for action items,
            deadlines, and follow-ups.
          </p>
          <button
            onClick={runTriage}
            disabled={isTriaging}
            className="h-9 px-4 rounded-xl text-[12px] font-medium bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Zap className={cn("size-3", isTriaging && "animate-pulse")} />
            {isTriaging ? "Running triage..." : "Run Triage"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[860px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-[#1a1a1a] tracking-tight">Tasks</h1>
          <p className="text-[13px] text-[#818380] mt-0.5">
            {activeTasks.length} active task{activeTasks.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runTriage}
            disabled={isTriaging}
            className="h-8 px-3 rounded-lg border border-black/[0.08] text-[11px] font-medium text-[#818380] hover:text-[#1a1a1a] hover:bg-[#f0f0ef] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Zap className={cn("size-3", isTriaging && "animate-pulse")} />
            {isTriaging ? "Triaging..." : "Run Triage"}
          </button>
          <button
            onClick={fetchTasks}
            disabled={isLoading}
            className="size-8 rounded-lg border border-black/[0.08] flex items-center justify-center text-[#9ca3af] hover:text-[#1a1a1a] hover:bg-[#f0f0ef] transition-colors cursor-pointer"
            title="Refresh tasks"
          >
            <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {priorityOrder.map((priority) => {
          const group = grouped[priority];
          if (!group || group.length === 0) return null;
          const config = priorityConfig[priority];
          return (
            <div key={priority}>
              <div className="flex items-center gap-2 mb-2">
                <CircleDot className={cn("size-3", config.text)} />
                <h2 className="text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider">
                  {config.label} Priority
                </h2>
                <span className="text-[10px] text-[#9ca3af]">({group.length})</span>
              </div>
              <div className="space-y-2">
                {group.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onComplete={() => updateTask(task.id, "completed")}
                    onDismiss={() => updateTask(task.id, "dismissed")}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
