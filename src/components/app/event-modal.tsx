"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, MapPin, Users, Tag, StickyNote, Trash2, Calendar, Sparkles, ChevronDown, FileText, AlertTriangle, RotateCcw, CheckCircle2 } from "lucide-react";
import type { CalendarEvent, EventCategory } from "@/lib/types";
import { CATEGORIES, formatDateFull } from "@/lib/event-store";
import { PipelineBadge } from "@/components/app/pipeline-badge";
import { cn } from "@/lib/utils";

interface EventModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: EventFormData) => void;
  onDelete?: () => void;
  onAnalyze?: (event: CalendarEvent) => void;
  onOpenDrawer?: (event: CalendarEvent) => void;
  event?: CalendarEvent | null;
  defaultDate?: string;
}

export interface EventFormData {
  title: string; date: string; startTime: string; endTime: string;
  category: EventCategory; location: string; description: string; notes: string; attendees: string;
}

const categoryDot: Record<string, string> = {
  work: "bg-blue-500", academic: "bg-violet-500", social: "bg-amber-500", personal: "bg-emerald-500", health: "bg-rose-500",
};

const inputClass = "w-full h-9 px-3 rounded-lg bg-white border border-black/[0.1] text-[13px] text-[#1a1a1a] placeholder:text-[#c6c8c7] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all";
const textareaClass = "w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] text-[13px] text-[#1a1a1a] placeholder:text-[#c6c8c7] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none";

function EventForm({ event, defaultDate, onSave, onClose, onDelete, onAnalyze, onOpenDrawer }: {
  event?: CalendarEvent | null; defaultDate?: string;
  onSave: (data: EventFormData) => void; onClose: () => void; onDelete?: () => void;
  onAnalyze?: (event: CalendarEvent) => void; onOpenDrawer?: (event: CalendarEvent) => void;
}) {
  const isEditing = !!event;
  const [form, setForm] = useState<EventFormData>(() =>
    event ? {
      title: event.title, date: event.date, startTime: event.startTime, endTime: event.endTime,
      category: event.category, location: event.location || "", description: event.description || "",
      notes: event.notes || "", attendees: (event.attendees || []).join(", "),
    } : {
      title: "", date: defaultDate || new Date().toISOString().split("T")[0],
      startTime: "09:00", endTime: "10:00", category: "work" as EventCategory,
      location: "", description: "", notes: "", attendees: "",
    }
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleSubmit(e: React.FormEvent) { e.preventDefault(); if (!form.title.trim()) return; onSave(form); onClose(); }
  function set(field: keyof EventFormData, value: string) { setForm(f => ({ ...f, [field]: value })); }

  return (
    <form onSubmit={handleSubmit} className="p-6 flex flex-col min-h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[18px] font-semibold text-[#1a1a1a]">{isEditing ? "Edit Event" : "New Event"}</h2>
        <button type="button" onClick={onClose} className="size-8 rounded-lg border border-black/[0.08] flex items-center justify-center text-[#9ca3af] hover:text-[#1a1a1a] transition-colors cursor-pointer">
          <X className="size-4" />
        </button>
      </div>

      <div className="mb-4">
        <input type="text" value={form.title} onChange={e => set("title", e.target.value)} placeholder="Event title" autoFocus
          className="w-full text-[20px] font-semibold text-[#1a1a1a] bg-transparent border-none outline-none placeholder:text-[#d7d8d8]" />
      </div>

      <div className="flex items-center gap-2 mb-5 text-[13px] text-[#818380]">
        <Calendar className="size-3.5 text-[#9ca3af]" /><span>{formatDateFull(form.date)}</span>
      </div>

      <div className="space-y-3 flex-1">
        <div className="rounded-xl border border-black/[0.06] p-3">
          <label className="flex items-center gap-2 text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider mb-2"><Clock className="size-3" />Time</label>
          <div className="flex items-center gap-2">
            <input type="time" value={form.startTime} onChange={e => set("startTime", e.target.value)} className={inputClass} />
            <span className="text-[#9ca3af] text-[12px]">to</span>
            <input type="time" value={form.endTime} onChange={e => set("endTime", e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="rounded-xl border border-black/[0.06] p-3">
          <label className="flex items-center gap-2 text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider mb-2"><Calendar className="size-3" />Date</label>
          <input type="date" value={form.date} onChange={e => set("date", e.target.value)} className={inputClass} />
        </div>

        <div className="rounded-xl border border-black/[0.06] p-3">
          <label className="flex items-center gap-2 text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider mb-2"><Tag className="size-3" />Category</label>
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map(cat => (
              <button key={cat.value} type="button" onClick={() => set("category", cat.value)} className={cn(
                "h-7 px-3 rounded-lg text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1.5 border",
                form.category === cat.value ? "bg-blue-50 border-blue-500 text-blue-600" : "border-black/[0.06] text-[#818380] hover:text-[#1a1a1a] hover:bg-[#f9fafb]"
              )}>
                <div className={cn("size-[6px] rounded-full", categoryDot[cat.value])} />{cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-black/[0.06] p-3">
          <label className="flex items-center gap-2 text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider mb-2"><MapPin className="size-3" />Location</label>
          <input type="text" value={form.location} onChange={e => set("location", e.target.value)} placeholder="Add location" className={inputClass} />
        </div>

        <div className="rounded-xl border border-black/[0.06] p-3">
          <label className="flex items-center gap-2 text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider mb-2"><Users className="size-3" />Attendees</label>
          <input type="text" value={form.attendees} onChange={e => set("attendees", e.target.value)} placeholder="Comma-separated names" className={inputClass} />
        </div>

        <div className="rounded-xl border border-black/[0.06] p-3">
          <label className="flex items-center gap-2 text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider mb-2">Description</label>
          <textarea value={form.description} onChange={e => set("description", e.target.value)} placeholder="What is this event about?" rows={2} className={textareaClass} />
        </div>

        <div className="rounded-xl border border-black/[0.06] p-3">
          <label className="flex items-center gap-2 text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider mb-2"><StickyNote className="size-3" />Notes</label>
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Personal notes for this event..." rows={3} className={textareaClass} />
        </div>
      </div>

      {/* AI Analysis Section (edit mode only) */}
      {isEditing && event && (
        <AIAnalysisSection event={event} onAnalyze={onAnalyze} onOpenDrawer={onOpenDrawer} />
      )}

      <div className="mt-6 pt-4 border-t border-black/[0.06] flex items-center gap-2">
        {isEditing && onDelete && (
          confirmDelete ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { onDelete(); onClose(); }} className="h-9 px-4 rounded-xl text-[12px] font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-all cursor-pointer">Confirm delete</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="h-9 px-3 rounded-xl text-[12px] font-medium text-[#9ca3af] hover:text-[#1a1a1a] transition-colors cursor-pointer">Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="size-9 rounded-xl border border-black/[0.06] flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer">
              <Trash2 className="size-4" />
            </button>
          )
        )}
        <div className="flex-1" />
        <button type="button" onClick={onClose} className="h-9 px-4 rounded-xl text-[12px] font-medium text-[#818380] hover:text-[#1a1a1a] transition-colors cursor-pointer">Cancel</button>
        <button type="submit" disabled={!form.title.trim()} className={cn(
          "h-9 px-5 rounded-xl text-[12px] font-medium transition-all cursor-pointer",
          form.title.trim() ? "bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white" : "bg-[#e9ebeb] text-[#c6c8c7] cursor-not-allowed"
        )}>
          {isEditing ? "Save changes" : "Create event"}
        </button>
      </div>
    </form>
  );
}

function AIAnalysisSection({ event, onAnalyze, onOpenDrawer }: {
  event: CalendarEvent;
  onAnalyze?: (event: CalendarEvent) => void;
  onOpenDrawer?: (event: CalendarEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasAnalysis = event.pipelineStatus && event.pipelineStatus !== "none";
  const isStale = event.pipelineStatus === "stale";
  const isCompleted = event.pipelineStatus === "completed";
  const isFailed = event.pipelineStatus === "failed";
  const isActive = event.pipelineStatus === "analyzing" || event.pipelineStatus === "planning" ||
    event.pipelineStatus === "executing" || event.pipelineStatus === "queued";

  return (
    <div className="mt-4 rounded-xl border border-black/[0.06] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-[#f9fafb] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-blue-500" />
          <span className="text-[11px] font-medium text-[#1a1a1a] uppercase tracking-wider">AI Analysis</span>
          {hasAnalysis && <PipelineBadge status={event.pipelineStatus} />}
        </div>
        <ChevronDown className={cn("size-3.5 text-[#9ca3af] transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-black/[0.04]">
          {!hasAnalysis && (
            <div className="py-4 text-center">
              <p className="text-[11px] text-[#818380] mb-2">This event has not been analyzed yet.</p>
              {onAnalyze && (
                <button type="button" onClick={() => onAnalyze(event)}
                  className="h-7 px-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer mx-auto">
                  <Sparkles className="size-3" /> Analyze Event
                </button>
              )}
            </div>
          )}

          {isActive && (
            <div className="py-4 text-center">
              <div className="size-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-[11px] text-[#818380]">Analysis in progress...</p>
            </div>
          )}

          {isCompleted && (
            <div className="py-3 space-y-2">
              <div className="flex items-center gap-2 text-[11px]">
                {event.artifactIds && event.artifactIds.length > 0 ? (
                  <>
                    <FileText className="size-3 text-emerald-500" />
                    <span className="text-[#1a1a1a] font-medium">Artifacts ready</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-3 text-[#9ca3af]" />
                    <span className="text-[#818380] font-medium">Classified — no action needed</span>
                  </>
                )}
              </div>
              {onOpenDrawer && (
                <button type="button" onClick={() => onOpenDrawer(event)}
                  className="w-full h-8 rounded-lg border border-black/[0.06] hover:bg-[#f9fafb] text-[11px] font-medium text-blue-500 hover:text-blue-600 transition-colors flex items-center justify-center gap-1.5 cursor-pointer">
                  View details
                </button>
              )}
            </div>
          )}

          {isStale && (
            <div className="py-3 space-y-2">
              <div className="flex items-center gap-2 text-[11px]">
                <AlertTriangle className="size-3 text-amber-500" />
                <span className="text-amber-600 font-medium">Event changed — analysis is outdated</span>
              </div>
              {onAnalyze && (
                <button type="button" onClick={() => onAnalyze(event)}
                  className="w-full h-8 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer">
                  <RotateCcw className="size-3" /> Re-analyze
                </button>
              )}
            </div>
          )}

          {isFailed && (
            <div className="py-3 space-y-2">
              <div className="flex items-center gap-2 text-[11px]">
                <AlertTriangle className="size-3 text-red-500" />
                <span className="text-red-600 font-medium">Analysis failed</span>
              </div>
              {onAnalyze && (
                <button type="button" onClick={() => onAnalyze(event)}
                  className="w-full h-8 rounded-lg border border-red-200 hover:bg-red-50 text-[11px] font-medium text-red-600 transition-colors flex items-center justify-center gap-1.5 cursor-pointer">
                  <RotateCcw className="size-3" /> Retry
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EventModal({ open, onClose, onSave, onDelete, onAnalyze, onOpenDrawer, event, defaultDate }: EventModalProps) {
  const formKey = event ? `edit-${event.id}` : `create-${defaultDate || "new"}-${open}`;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50" onClick={onClose} />
          <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-[440px] z-50 bg-white border-l border-black/[0.08] overflow-y-auto shadow-[0_0_40px_rgba(0,0,0,0.08)]">
            <EventForm key={formKey} event={event} defaultDate={defaultDate} onSave={onSave} onClose={onClose} onDelete={onDelete}
              onAnalyze={onAnalyze} onOpenDrawer={onOpenDrawer} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
