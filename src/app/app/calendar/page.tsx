"use client";

import { useState, useMemo, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, MapPin, Users, Sparkles,
  CalendarDays, ArrowRight, Clock, Plus, StickyNote,
  Pencil, LayoutGrid, Rows3, RefreshCw,
} from "lucide-react";
import Link from "next/link";
import {
  subscribe, getEvents, getMonthDates, getWeekDates,
  isToday, isCurrentMonth, formatDateFull, formatDateShort,
  formatTime, addEvent, updateEvent, deleteEvent, categoryDot,
} from "@/lib/event-store";
import { useCalendarSync } from "@/lib/calendar-sync";
import type { CalendarEvent } from "@/lib/types";
import { EventModal, type EventFormData } from "@/components/app/event-modal";
import { PipelineBadge } from "@/components/app/pipeline-badge";
import { PipelineDrawer } from "@/components/app/pipeline-drawer";
import { useTriggerPipeline, useEventPipeline } from "@/lib/pipeline/hooks";
import { cn } from "@/lib/utils";

type ViewMode = "month" | "week";

const categoryAccent: Record<string, { bar: string; text: string }> = {
  academic: { bar: "bg-violet-500", text: "text-violet-600" },
  work: { bar: "bg-blue-500", text: "text-blue-600" },
  social: { bar: "bg-amber-500", text: "text-amber-600" },
  personal: { bar: "bg-emerald-500", text: "text-emerald-600" },
  health: { bar: "bg-rose-500", text: "text-rose-600" },
};

function useEvents() {
  return useSyncExternalStore(subscribe, getEvents, getEvents);
}

// ── Pipeline Status Poller ──────────────────────────────
// Polls for active pipeline runs and updates event statuses in the client store.
function usePipelineStatusSync() {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function pollStatus() {
      const events = getEvents();
      const activeEvents = events.filter(
        (e) => e.pipelineRunId && e.pipelineStatus &&
          !["completed", "failed", "stale", "none"].includes(e.pipelineStatus)
      );

      for (const event of activeEvents) {
        try {
          const res = await fetch(`/api/pipeline/status/${event.pipelineRunId}`);
          if (!res.ok) continue;
          const data = await res.json();
          const run = data.run;
          if (!run) continue;

          // Map pipeline stage to UI status
          const stageToStatus: Record<string, CalendarEvent["pipelineStatus"]> = {
            ingested: "analyzing",
            classifying: "analyzing",
            classified: "analyzing",
            planning: "planning",
            planned: "planning",
            queued: "queued",
            awaiting_approval: "awaiting_approval",
            executing: "executing",
            synthesizing: "executing",
            completed: "completed",
            failed: "failed",
          };

          const newStatus = stageToStatus[run.stage] || event.pipelineStatus;
          if (newStatus !== event.pipelineStatus) {
            updateEvent(event.id, {
              pipelineStatus: newStatus,
              artifactIds: run.artifactIds?.length ? run.artifactIds : event.artifactIds,
            });
          }
        } catch {
          // Silent — don't break the loop
        }
      }
    }

    // Poll immediately, then every 3 seconds
    pollStatus();
    pollRef.current = setInterval(pollStatus, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);
}

function PageHeader({ label, view, onViewChange, onPrev, onNext, onToday, onAdd, isOffset, isSyncing, isConnected, lastSyncAt, lastError, errorType, onRefresh }: {
  label: string; view: ViewMode; onViewChange: (v: ViewMode) => void;
  onPrev: () => void; onNext: () => void; onToday: () => void; onAdd: () => void; isOffset: boolean;
  isSyncing?: boolean; isConnected?: boolean; lastSyncAt?: string | null; lastError?: string | null; errorType?: string; onRefresh?: () => void;
}) {
  // Structured sync status based on errorType
  let syncLabel: string | null = null;
  let syncColor = "text-[#c6c8c7]";

  if (errorType === "api_disabled") {
    syncLabel = "Google Calendar API not enabled";
    syncColor = "text-red-400";
  } else if (errorType === "token_expired") {
    syncLabel = "Reconnect Google";
    syncColor = "text-amber-500";
  } else if (errorType === "rate_limited") {
    syncLabel = "Rate limited — will retry";
    syncColor = "text-amber-500";
  } else if (errorType === "permission_denied") {
    syncLabel = "Permission denied";
    syncColor = "text-red-400";
  } else if (errorType === "unknown" && lastError) {
    syncLabel = "Sync failed";
    syncColor = "text-red-400";
  } else if (isConnected && lastSyncAt) {
    syncLabel = `Synced ${formatSyncTime(lastSyncAt)}`;
  } else if (!isConnected && !lastSyncAt && lastError) {
    // Not connected, never synced, has error — don't show
    syncLabel = null;
  }

  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-[22px] font-semibold text-[#1a1a1a] tracking-tight">Calendar</h1>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isSyncing}
              title={lastError ? lastError : "Refresh Google Calendar"}
              className={cn(
                "size-7 rounded-lg border flex items-center justify-center transition-all cursor-pointer",
                errorType === "api_disabled" || errorType === "permission_denied" || errorType === "unknown"
                  ? "border-red-200 text-red-400 hover:text-red-600 hover:bg-red-50"
                  : errorType === "token_expired" || errorType === "rate_limited"
                    ? "border-amber-200 text-amber-400 hover:text-amber-600 hover:bg-amber-50"
                    : "border-black/[0.08] text-[#9ca3af] hover:text-[#1a1a1a] hover:bg-[#f0f0ef]",
                isSyncing && "pointer-events-none"
              )}
            >
              <RefreshCw className={cn("size-3", isSyncing && "animate-spin")} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-[13px] text-[#818380]">{label}</p>
          {syncLabel && (
            <span className={cn("text-[10px] font-medium", syncColor)}>
              · {syncLabel}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="rounded-lg border border-black/[0.08] flex p-0.5 bg-white">
          <button onClick={() => onViewChange("month")} className={cn(
            "h-7 px-2.5 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer",
            view === "month" ? "bg-blue-500 text-white" : "text-[#818380] hover:text-[#1a1a1a]"
          )}>
            <LayoutGrid className="size-3" /> Month
          </button>
          <button onClick={() => onViewChange("week")} className={cn(
            "h-7 px-2.5 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer",
            view === "week" ? "bg-blue-500 text-white" : "text-[#818380] hover:text-[#1a1a1a]"
          )}>
            <Rows3 className="size-3" /> Week
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onPrev} className="size-8 rounded-lg border border-black/[0.08] bg-white hover:bg-[#f0f0ef] flex items-center justify-center text-[#818380] hover:text-[#1a1a1a] cursor-pointer transition-colors">
            <ChevronLeft className="size-3.5" />
          </button>
          {isOffset && (
            <button onClick={onToday} className="h-8 px-3 rounded-lg border border-black/[0.08] bg-white hover:bg-[#f0f0ef] text-[11px] font-medium text-[#818380] hover:text-[#1a1a1a] cursor-pointer transition-colors">
              Today
            </button>
          )}
          <button onClick={onNext} className="size-8 rounded-lg border border-black/[0.08] bg-white hover:bg-[#f0f0ef] flex items-center justify-center text-[#818380] hover:text-[#1a1a1a] cursor-pointer transition-colors">
            <ChevronRight className="size-3.5" />
          </button>
        </div>
        <button onClick={onAdd} className="h-8 px-3 rounded-lg bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer">
          <Plus className="size-3.5" /> Add event
        </button>
      </div>
    </div>
  );
}

function formatSyncTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function MonthGrid({ year, month, selectedDate, onSelectDate, onAddEvent }: {
  year: number; month: number; selectedDate: string;
  onSelectDate: (d: string) => void; onAddEvent: (date: string) => void;
}) {
  const weeks = useMemo(() => getMonthDates(year, month), [year, month]);
  const allEvents = useEvents();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white overflow-hidden mb-5">
      <div className="grid grid-cols-7 border-b border-black/[0.06]">
        {dayNames.map((day) => (
          <div key={day} className="py-2.5 text-center text-[10px] font-medium text-[#9ca3af] uppercase tracking-widest">
            {day}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-black/[0.04] last:border-b-0">
          {week.map((date) => {
            const today = isToday(date);
            const inMonth = isCurrentMonth(date, year, month);
            const selected = date === selectedDate;
            const dayEvents = allEvents.filter((e) => e.date === date);

            return (
              <div
                key={date}
                role="button"
                tabIndex={0}
                onClick={() => onSelectDate(date)}
                onDoubleClick={() => onAddEvent(date)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelectDate(date);
                  if (e.key === " ") { e.preventDefault(); onSelectDate(date); }
                }}
                className={cn(
                  "relative min-h-[80px] p-1.5 text-left transition-all cursor-pointer border-r border-black/[0.04] last:border-r-0 group outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30",
                  selected ? "bg-blue-50" : "hover:bg-[#f9fafb]",
                  !inMonth && "opacity-30"
                )}
              >
                <div className="flex items-center justify-between px-1">
                  <span className={cn(
                    "text-[12px] font-medium",
                    today
                      ? "size-6 rounded-full bg-blue-500 text-white flex items-center justify-center"
                      : selected ? "text-blue-600" : "text-[#6b7280]"
                  )}>
                    {new Date(date + "T00:00:00").getDate()}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onAddEvent(date); }}
                    className="size-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 text-[#9ca3af] hover:text-blue-500 hover:bg-blue-50 transition-all cursor-pointer"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
                <div className="mt-1 space-y-px px-0.5">
                  {dayEvents.slice(0, 3).map((ev) => {
                    const accent = categoryAccent[ev.category] || categoryAccent.work;
                    const hasAI = ev.pipelineStatus && ev.pipelineStatus !== "none";
                    return (
                      <div key={ev.id} className={cn("text-[9px] font-medium truncate px-1.5 py-0.5 rounded bg-[#f0f0ef] flex items-center gap-0.5", accent.text)}>
                        {hasAI && <Sparkles className="size-[7px] shrink-0 opacity-60" />}
                        <span className="truncate">{ev.title}</span>
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <div className="text-[9px] text-[#9ca3af] px-1.5">+{dayEvents.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function WeekGrid({ dates, selectedDate, onSelectDate }: {
  dates: string[]; selectedDate: string; onSelectDate: (d: string) => void;
}) {
  const allEvents = useEvents();

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white p-2 mb-5">
      <div className="grid grid-cols-7 gap-1.5">
        {dates.map((date) => {
          const dt = new Date(date + "T00:00:00");
          const dayName = dt.toLocaleDateString("en-US", { weekday: "short" });
          const dayNum = dt.getDate();
          const today = isToday(date);
          const selected = date === selectedDate;
          const dayEvents = allEvents.filter((e) => e.date === date);

          return (
            <button key={date} onClick={() => onSelectDate(date)} className={cn(
              "relative rounded-xl py-3 px-2 text-center transition-all duration-200 cursor-pointer border",
              selected ? "bg-blue-50 border-blue-500" : today ? "bg-[#f9fafb] border-transparent hover:border-black/[0.06]" : "border-transparent hover:bg-[#f9fafb] hover:border-black/[0.04]"
            )}>
              <p className={cn("text-[10px] font-medium tracking-wide uppercase mb-1", today && !selected ? "text-blue-500" : "text-[#9ca3af]")}>
                {dayName}
              </p>
              <p className={cn("text-[18px] font-semibold leading-none", selected ? "text-blue-600" : today ? "text-[#1a1a1a]" : "text-[#6b7280]")}>
                {dayNum}
              </p>
              {dayEvents.length > 0 && (
                <div className="flex justify-center gap-[3px] mt-2">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div key={ev.id} className={cn("size-[5px] rounded-full", categoryDot(ev.category))} />
                  ))}
                  {dayEvents.length > 3 && <span className="text-[8px] text-[#9ca3af] ml-0.5">+{dayEvents.length - 3}</span>}
                </div>
              )}
              {today && !selected && <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventCard({ event, index, onEdit, onAnalyze, onOpenDrawer }: {
  event: CalendarEvent; index: number; onEdit: (e: CalendarEvent) => void;
  onAnalyze?: (e: CalendarEvent) => void; onOpenDrawer?: (e: CalendarEvent) => void;
}) {
  const accent = categoryAccent[event.category] || categoryAccent.work;
  const hasAnalysis = event.pipelineStatus && event.pipelineStatus !== "none";

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      onClick={() => onEdit(event)}
      className="group relative rounded-xl border border-black/[0.06] bg-white hover:border-black/[0.1] hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] pl-4 overflow-hidden cursor-pointer transition-all"
    >
      <div className={cn("absolute left-0 top-3 bottom-3 w-[3px] rounded-full", accent.bar)} />
      <div className="p-4 pl-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] font-mono text-[#818380]">
            {formatTime(event.startTime)} – {formatTime(event.endTime)}
          </span>
          <div className="flex items-center gap-2">
            {hasAnalysis && (
              <button onClick={(e) => { e.stopPropagation(); onOpenDrawer?.(event); }}
                className="cursor-pointer">
                <PipelineBadge status={event.pipelineStatus} />
              </button>
            )}
            <span className={cn("text-[10px] font-medium uppercase tracking-widest", accent.text)}>
              {event.category}
            </span>
            {!hasAnalysis && onAnalyze && (
              <button
                onClick={(e) => { e.stopPropagation(); onAnalyze(event); }}
                className="size-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 text-[#9ca3af] hover:text-blue-500 hover:bg-blue-50 transition-all cursor-pointer"
                title="Analyze with AI"
              >
                <Sparkles className="size-3" />
              </button>
            )}
            <Pencil className="size-3 text-transparent group-hover:text-[#9ca3af] transition-colors" />
          </div>
        </div>
        <h3 className="text-[15px] font-semibold text-[#1a1a1a] leading-snug mb-1">{event.title}</h3>
        {event.description && (
          <p className="text-[12px] text-[#818380] leading-relaxed mb-2 line-clamp-1">{event.description}</p>
        )}
        <div className="flex items-center gap-3 text-[11px] text-[#9ca3af]">
          {event.location && <span className="flex items-center gap-1"><MapPin className="size-3" /><span className="truncate max-w-[140px]">{event.location}</span></span>}
          {event.attendees && event.attendees.length > 0 && <span className="flex items-center gap-1"><Users className="size-3" />{event.attendees.length}</span>}
          {event.notes && <span className="flex items-center gap-1"><StickyNote className="size-3" />Notes</span>}
        </div>
        {event.inboxItemId && (
          <Link href={`/app/inbox/${event.inboxItemId}`} onClick={(e) => e.stopPropagation()}
            className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-500 hover:text-blue-600 transition-colors">
            <Sparkles className="size-3" /> AI prep available <ArrowRight className="size-3" />
          </Link>
        )}
        {event.pipelineStatus === "stale" && onAnalyze && (
          <button onClick={(e) => { e.stopPropagation(); onAnalyze(event); }}
            className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-500 hover:text-amber-600 transition-colors cursor-pointer">
            <Sparkles className="size-3" /> Re-analyze <ArrowRight className="size-3" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

function DayDetail({ date, onEdit, onAdd, onAnalyze, onOpenDrawer }: {
  date: string; onEdit: (e: CalendarEvent) => void; onAdd: () => void;
  onAnalyze?: (e: CalendarEvent) => void; onOpenDrawer?: (e: CalendarEvent) => void;
}) {
  const allEvents = useEvents();
  const dayEvents = allEvents.filter((e) => e.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[16px] font-semibold text-[#1a1a1a]">{formatDateFull(date)}</h2>
          <p className="text-[12px] text-[#9ca3af] mt-0.5">
            {dayEvents.length === 0 ? "No events" : `${dayEvents.length} event${dayEvents.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isToday(date) && (
            <div className="flex items-center gap-1.5">
              <div className="size-1.5 rounded-full bg-blue-500 pulse-live" />
              <span className="text-[10px] font-mono text-blue-500 uppercase tracking-wider">Today</span>
            </div>
          )}
          <button onClick={onAdd} className="size-7 rounded-lg border border-black/[0.06] flex items-center justify-center text-[#9ca3af] hover:text-blue-500 hover:border-blue-300 transition-colors cursor-pointer">
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={date} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="space-y-2">
          {dayEvents.length === 0 ? (
            <div className="py-12 text-center">
              <div className="size-11 mx-auto rounded-xl bg-[#f0f0ef] flex items-center justify-center mb-3">
                <CalendarDays className="size-5 text-[#9ca3af]" />
              </div>
              <p className="text-[13px] text-[#6b7280] font-medium">Nothing scheduled</p>
              <p className="text-[11px] text-[#9ca3af] mt-1 mb-3">Double-click a date or press + to add</p>
              <button onClick={onAdd} className="h-8 px-4 rounded-lg border border-black/[0.08] bg-white hover:bg-[#f9fafb] text-[11px] font-medium text-[#818380] hover:text-[#1a1a1a] cursor-pointer inline-flex items-center gap-1.5 transition-colors">
                <Plus className="size-3" /> Add event
              </button>
            </div>
          ) : (
            dayEvents.map((event, i) => (
              <EventCard key={event.id} event={event} index={i} onEdit={onEdit}
                onAnalyze={onAnalyze} onOpenDrawer={onOpenDrawer} />
            ))
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function AIPrepPanel({ onOpenDrawer }: { onOpenDrawer?: (e: CalendarEvent) => void }) {
  const allEvents = useEvents();
  const legacyItems = allEvents.filter((e) => e.inboxItemId);
  const pipelineItems = allEvents.filter((e) => e.pipelineStatus && e.pipelineStatus !== "none");
  const activeItems = allEvents.filter(
    (e) => e.pipelineStatus === "analyzing" || e.pipelineStatus === "planning" ||
           e.pipelineStatus === "executing" || e.pipelineStatus === "queued" ||
           e.pipelineStatus === "awaiting_approval"
  );
  const hasContent = legacyItems.length > 0 || pipelineItems.length > 0;

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-lg bg-blue-50 flex items-center justify-center">
            <Sparkles className="size-3.5 text-blue-500" />
          </div>
          <h3 className="text-[13px] font-semibold text-[#1a1a1a]">AI Prep</h3>
        </div>
        {activeItems.length > 0 && (
          <span className="text-[10px] font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
            {activeItems.length} active
          </span>
        )}
      </div>
      {hasContent ? (
        <div className="space-y-1">
          {/* Pipeline-analyzed events */}
          {pipelineItems.slice(0, 5).map((event) => (
            <button key={`p-${event.id}`} onClick={() => onOpenDrawer?.(event)}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#f9fafb] transition-all group text-left cursor-pointer">
              <div className={cn("size-1.5 rounded-full shrink-0", categoryDot(event.category))} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-[#1a1a1a] truncate group-hover:text-blue-600 transition-colors">{event.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <PipelineBadge status={event.pipelineStatus} />
                  <span className="text-[10px] text-[#9ca3af]">{formatDateShort(event.date)}</span>
                </div>
              </div>
              <ArrowRight className="size-3 text-[#d7d8d8] group-hover:text-blue-500 transition-colors shrink-0" />
            </button>
          ))}
          {/* Legacy inbox items */}
          {legacyItems.filter((e) => !e.pipelineStatus || e.pipelineStatus === "none").slice(0, 3).map((event) => (
            <Link key={`l-${event.id}`} href={`/app/inbox/${event.inboxItemId}`} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#f9fafb] transition-all group">
              <div className={cn("size-1.5 rounded-full shrink-0", categoryDot(event.category))} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-[#1a1a1a] truncate group-hover:text-blue-600 transition-colors">{event.title}</p>
                <p className="text-[10px] text-[#9ca3af] mt-0.5">{formatDateShort(event.date)}</p>
              </div>
              <ArrowRight className="size-3 text-[#d7d8d8] group-hover:text-blue-500 transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-[12px] text-[#6b7280] mb-1">No prep generated yet</p>
          <p className="text-[10px] text-[#9ca3af] leading-relaxed">
            Connect your calendar and add events. Omni Cal generates prep automatically.
          </p>
          <Link href="/app/integrations" className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-500 hover:text-blue-600 transition-colors">
            Connect integrations <ArrowRight className="size-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

function TodayOverview({ onOpenDrawer }: { onOpenDrawer?: (e: CalendarEvent) => void }) {
  const allEvents = useEvents();
  const todayStr = new Date().toISOString().split("T")[0];
  const todayEvents = allEvents.filter((e) => e.date === todayStr).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const nextEvent = todayEvents[0];
  if (!nextEvent) return null;

  const hasPipelinePrep = nextEvent.pipelineStatus === "completed";
  const isPipelineActive = nextEvent.pipelineStatus === "analyzing" || nextEvent.pipelineStatus === "executing" || nextEvent.pipelineStatus === "planning";

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 mb-5">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
          <Clock className="size-4 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono text-blue-500 uppercase tracking-wider mb-0.5">Up next</p>
          <p className="text-[14px] font-semibold text-[#1a1a1a] truncate">{nextEvent.title}</p>
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-[#818380]">{formatTime(nextEvent.startTime)}{nextEvent.location ? ` · ${nextEvent.location}` : ""}</p>
            {isPipelineActive && <PipelineBadge status={nextEvent.pipelineStatus} />}
          </div>
        </div>
        {hasPipelinePrep && onOpenDrawer ? (
          <button onClick={() => onOpenDrawer(nextEvent)}
            className="shrink-0 h-8 px-3 rounded-lg border border-blue-200 bg-white text-[11px] font-medium text-blue-500 hover:bg-blue-50 transition-colors flex items-center gap-1.5 cursor-pointer">
            <Sparkles className="size-3" /> View prep
          </button>
        ) : nextEvent.inboxItemId ? (
          <Link href={`/app/inbox/${nextEvent.inboxItemId}`} className="shrink-0 h-8 px-3 rounded-lg border border-blue-200 bg-white text-[11px] font-medium text-blue-500 hover:bg-blue-50 transition-colors flex items-center gap-1.5">
            <Sparkles className="size-3" /> View prep
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>("month");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthYear, setMonthYear] = useState(() => { const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() }; });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [modalDefaultDate, setModalDefaultDate] = useState<string | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRunId, setDrawerRunId] = useState<string | null>(null);
  const [drawerEventId, setDrawerEventId] = useState<string | null>(null);
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const monthLabel = new Date(monthYear.year, monthYear.month).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const weekLabel = (() => {
    const s = new Date(weekDates[0] + "T00:00:00"), e = new Date(weekDates[6] + "T00:00:00");
    return s.getMonth() === e.getMonth()
      ? `${s.toLocaleDateString("en-US", { month: "long" })} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`
      : `${s.toLocaleDateString("en-US", { month: "short" })} ${s.getDate()} – ${e.toLocaleDateString("en-US", { month: "short" })} ${e.getDate()}, ${e.getFullYear()}`;
  })();
  const isOffset = view === "week" ? weekOffset !== 0 : (monthYear.month !== new Date().getMonth() || monthYear.year !== new Date().getFullYear());
  const handlePrev = useCallback(() => { if (view === "week") setWeekOffset(w => w - 1); else setMonthYear(my => my.month === 0 ? { year: my.year - 1, month: 11 } : { year: my.year, month: my.month - 1 }); }, [view]);
  const handleNext = useCallback(() => { if (view === "week") setWeekOffset(w => w + 1); else setMonthYear(my => my.month === 11 ? { year: my.year + 1, month: 0 } : { year: my.year, month: my.month + 1 }); }, [view]);
  const handleToday = useCallback(() => { const now = new Date(); setSelectedDate(now.toISOString().split("T")[0]); if (view === "week") setWeekOffset(0); else setMonthYear({ year: now.getFullYear(), month: now.getMonth() }); }, [view]);

  // ── Sync hooks ──
  const calendarSync = useCalendarSync();
  usePipelineStatusSync();

  const { trigger } = useTriggerPipeline();
  const { artifacts: drawerArtifacts } = useEventPipeline(drawerEventId);

  function openAddModal(date?: string) { setEditingEvent(null); setModalDefaultDate(date || selectedDate); setModalOpen(true); }
  function openEditModal(event: CalendarEvent) { setEditingEvent(event); setModalDefaultDate(undefined); setModalOpen(true); }
  function handleSave(data: EventFormData) {
    const parsed = { title: data.title, date: data.date, startTime: data.startTime, endTime: data.endTime, category: data.category,
      location: data.location || undefined, description: data.description || undefined, notes: data.notes || undefined,
      attendees: data.attendees ? data.attendees.split(",").map(s => s.trim()).filter(Boolean) : undefined };
    if (editingEvent) updateEvent(editingEvent.id, parsed); else addEvent(parsed);
  }
  function handleDelete() { if (editingEvent) deleteEvent(editingEvent.id); }

  async function handleAnalyze(event: CalendarEvent) {
    const result = await trigger(event.id, event.source === "google-calendar" ? "google_calendar" : "manual", {
      title: event.title,
      description: event.description,
      location: event.location,
      attendees: event.attendees,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      category: event.category,
    });
    if (result) {
      updateEvent(event.id, { pipelineStatus: "analyzing", pipelineRunId: result.runId });
      setDrawerRunId(result.runId);
      setDrawerEventId(event.id);
      setDrawerOpen(true);
    }
  }

  function handleOpenDrawer(event: CalendarEvent) {
    setDrawerRunId(event.pipelineRunId ?? null);
    setDrawerEventId(event.id);
    setDrawerOpen(true);
  }

  async function handleRetry(runId: string) {
    try {
      const res = await fetch(`/api/pipeline/runs/${runId}/retry`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setDrawerRunId(data.runId);
      }
    } catch { /* silent */ }
  }

  async function handleApprove(runId: string) {
    try {
      const res = await fetch(`/api/pipeline/runs/${runId}/approve`, { method: "POST" });
      if (res.ok) {
        // Update the event status to executing
        if (drawerEventId) {
          updateEvent(drawerEventId, { pipelineStatus: "executing" });
        }
      }
    } catch { /* silent */ }
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto">
      <PageHeader label={view === "month" ? monthLabel : weekLabel} view={view} onViewChange={setView}
        onPrev={handlePrev} onNext={handleNext} onToday={handleToday} onAdd={() => openAddModal()} isOffset={isOffset}
        isSyncing={calendarSync.isSyncing} isConnected={calendarSync.isConnected}
        lastSyncAt={calendarSync.lastSyncAt} lastError={calendarSync.lastError}
        errorType={calendarSync.errorType} onRefresh={calendarSync.refresh} />
      <TodayOverview onOpenDrawer={handleOpenDrawer} />
      {view === "month"
        ? <MonthGrid year={monthYear.year} month={monthYear.month} selectedDate={selectedDate} onSelectDate={setSelectedDate} onAddEvent={d => openAddModal(d)} />
        : <WeekGrid dates={weekDates} selectedDate={selectedDate} onSelectDate={setSelectedDate} />}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <DayDetail date={selectedDate} onEdit={openEditModal} onAdd={() => openAddModal(selectedDate)}
            onAnalyze={handleAnalyze} onOpenDrawer={handleOpenDrawer} />
        </div>
        <div><AIPrepPanel onOpenDrawer={handleOpenDrawer} /></div>
      </div>
      <EventModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave}
        onDelete={editingEvent ? handleDelete : undefined} onAnalyze={handleAnalyze} onOpenDrawer={handleOpenDrawer}
        event={editingEvent} defaultDate={modalDefaultDate} />
      <PipelineDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        runId={drawerRunId}
        artifacts={drawerArtifacts}
        onRetry={handleRetry}
        onApprove={handleApprove}
        onReanalyze={drawerEventId ? () => {
          const ev = getEvents().find(e => e.id === drawerEventId);
          if (ev) handleAnalyze(ev);
        } : undefined}
      />
    </div>
  );
}
