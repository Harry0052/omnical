// Treat this section like the clearest product proof on the whole site —
// it should be the moment where Omni Cal finally clicks.

"use client";

import React, { useState } from "react";
import {
  motion,
  useTransform,
  useMotionValueEvent,
  type MotionValue,
} from "framer-motion";
import {
  Mail,
  Calendar,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  BookOpen,
  Briefcase,
  Plane,
  Utensils,
  Bell,
} from "lucide-react";
import { MessageLoading } from "@/components/ui/message-loading";

/* ═══════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════ */

const STEPS = ["Connect", "Sync", "Understand", "Prepare", "Deliver"] as const;

const STATE_DESCRIPTIONS = [
  "Omni Cal connects to your tools and begins scanning",
  "Your schedule fills with events from across your world",
  "Important events are identified and context is gathered",
  "Useful preparation is generated automatically",
  "Delivered to you before the moment arrives",
];

const WEEKS = [
  [1, 2, 3, 4, 5, 6, 7],
  [8, 9, 10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19, 20, 21],
  [22, 23, 24, 25, 26, 27, 28],
  [29, 30, 31, 0, 0, 0, 0],
];

const TODAY = 19;
const EVENT_DAYS = new Set([5, 12, 17, 19, 24, 26]);

const SCHEDULE = [
  { time: "9:00 AM", title: "Biology Midterm Review", icon: BookOpen, highlight: false },
  { time: "1:00 PM", title: "Dinner with Maya", icon: Utensils, highlight: false },
  { time: "3:00 PM", title: "Product Review Meeting", icon: Briefcase, highlight: true },
  { time: "5:30 PM", title: "Flight to SF", icon: Plane, highlight: false },
];

const INSIGHTS = [
  "Q1 revenue deck updated yesterday",
  "3 open action items from last review",
  "Sarah added 2 agenda comments",
];

const PREP_ITEMS = [
  "Key talking points organized",
  "Revenue summary: MRR up 18% QoQ",
  "Action items from last meeting formatted",
  "Sarah's agenda comments integrated",
];

const NOTIFICATIONS = [
  {
    title: "Meeting prep is ready",
    body: "I created key talking points for your 3 PM product review",
    time: "2m ago",
  },
  {
    title: "Bio 101 study guide created",
    body: "5 key topics from your notes — exam is Thursday",
    time: "15m ago",
  },
  {
    title: "Dinner briefing ready",
    body: "Maya recently started at Notion — congrats might be a good opener",
    time: "1h ago",
  },
];

/* ═══════════════════════════════════════════════════════
   Progress Steps
   ═══════════════════════════════════════════════════════ */

function ProgressSteps({ active }: { active: number }) {
  return (
    <div className="flex items-center justify-center gap-1 md:gap-2">
      {STEPS.map((step, i) => (
        <React.Fragment key={step}>
          {i > 0 && (
            <div
              className={`h-px w-3 md:w-6 transition-colors duration-500 ${
                i <= active ? "bg-[#4285F4]/25" : "bg-black/[0.06]"
              }`}
            />
          )}
          <div className="flex items-center gap-1.5">
            <div
              className={`size-1.5 md:size-2 rounded-full transition-all duration-500 ${
                i === active
                  ? "bg-[#4285F4] shadow-[0_0_6px_rgba(66,133,244,0.4)]"
                  : i < active
                  ? "bg-[#4285F4]/35"
                  : "bg-[#d7d8d8]"
              }`}
            />
            <span
              className={`text-[9px] md:text-[10px] font-mono hidden sm:inline transition-colors duration-500 ${
                i === active
                  ? "text-[#4285F4]"
                  : i < active
                  ? "text-[#9c9e9b]"
                  : "text-[#d7d8d8]"
              }`}
            >
              {step}
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Panel Chrome — shared app header for states 0–3
   ═══════════════════════════════════════════════════════ */

function PanelChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full rounded-2xl border border-black/[0.06] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col">
      {/* App header bar */}
      <div className="flex items-center justify-between px-4 md:px-5 py-2.5 border-b border-black/[0.04] shrink-0">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-lg border border-black/[0.08] flex items-center justify-center">
            <div className="size-2.5 rounded-sm bg-[#1a1a1a]" />
          </div>
          <span className="text-[13px] font-semibold text-[#2a2a2a]">
            Omni Cal
          </span>
          <motion.div
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            className="size-1.5 rounded-full bg-[#4285F4] ml-0.5"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {[
            { icon: Mail, label: "Gmail", accent: true },
            { icon: Calendar, label: "Calendar", accent: false },
          ].map((src) => (
            <div
              key={src.label}
              className="flex items-center gap-1.5 rounded-full border border-black/[0.04] bg-[#f7f7f6] px-2.5 py-1"
            >
              <src.icon
                className={`size-3 ${
                  src.accent ? "text-[#4285F4]" : "text-[#b2b4b2]"
                }`}
              />
              <span className="text-[9px] font-medium text-[#9c9e9b] hidden md:inline">
                {src.label}
              </span>
              <div
                className={`size-1.5 rounded-full ${
                  src.accent ? "bg-[#4285F4]" : "bg-[#c6c8c7]"
                }`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   State 0 — Connect
   Gmail and tools sync. MessageLoading as processing state.
   ═══════════════════════════════════════════════════════ */

function ConnectContent() {
  const sources = [
    { icon: Mail, label: "Gmail", color: "#4285F4" },
    { icon: Calendar, label: "Google Calendar", color: "#0F9D58" },
    { icon: MessageSquare, label: "Slack", color: "#611f69" },
  ];

  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 md:gap-8 p-4 md:p-6">
      <div className="text-center space-y-1.5">
        <h3 className="text-base md:text-lg font-semibold text-[#1a1a1a]">
          Your tools are connected
        </h3>
        <p className="text-xs text-[#9c9e9b] max-w-xs mx-auto">
          Omni Cal is scanning your inbox, calendar, and messages
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2.5 md:gap-3">
        {sources.map((src) => (
          <div
            key={src.label}
            className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-[#f7f7f6] px-3 md:px-4 py-2 md:py-2.5"
          >
            <src.icon className="size-4" style={{ color: src.color }} />
            <span className="text-xs md:text-sm text-[#4a4a4a]">
              {src.label}
            </span>
            <div
              className="size-2 rounded-full"
              style={{ backgroundColor: src.color }}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2.5 text-[#4285F4]">
        <MessageLoading />
        <span className="text-[11px] font-mono text-[#9c9e9b]">
          Syncing your data...
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   State 1 — Calendar Sync
   Calendar fills with events. This is the hero UI —
   wide, readable, premium. NOT crushed.
   ═══════════════════════════════════════════════════════ */

function CalendarContent() {
  return (
    <div className="h-full flex flex-col p-3 md:p-5">
      {/* Month header */}
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <div className="flex items-center gap-2">
          <ChevronLeft className="size-3.5 text-[#c6c8c7]" />
          <span className="text-sm md:text-base font-semibold text-[#1a1a1a]">
            March 2026
          </span>
          <ChevronRight className="size-3.5 text-[#c6c8c7]" />
        </div>
        <span className="text-[10px] font-mono text-[#c6c8c7]">Week 12</span>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] md:text-[11px] font-medium text-[#b2b4b2] py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid — generous spacing, readable sizes */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {WEEKS.flat().map((day, i) => {
          if (day === 0) return <div key={i} />;
          const isToday = day === TODAY;
          const hasEvent = EVENT_DAYS.has(day);
          const isPast = day < TODAY;

          return (
            <div
              key={i}
              className="relative flex flex-col items-center py-1.5 md:py-2 rounded-lg"
            >
              {isToday && (
                <div className="absolute inset-x-1 inset-y-0.5 rounded-lg bg-[#4285F4]/[0.06] border border-[#4285F4]/15" />
              )}
              <span
                className={`relative z-10 text-[11px] md:text-[13px] ${
                  isToday
                    ? "font-bold text-[#4285F4]"
                    : isPast
                    ? "text-[#c6c8c7]"
                    : "text-[#4a4a4a]"
                }`}
              >
                {day}
              </span>
              {hasEvent && (
                <div
                  className={`relative z-10 size-1 md:size-[5px] rounded-full mt-0.5 ${
                    isToday
                      ? "bg-[#4285F4]"
                      : isPast
                      ? "bg-[#d7d8d8]"
                      : "bg-[#b2b4b2]"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div className="h-px bg-black/[0.04] my-2 md:my-3" />

      {/* Today's schedule */}
      <div className="flex-1 min-h-0">
        <p className="text-[9px] font-mono text-[#b2b4b2] uppercase tracking-wider mb-1.5 md:mb-2">
          Today — Thursday, Mar 19
        </p>
        <div className="space-y-1 md:space-y-1.5">
          {SCHEDULE.map((ev) => (
            <div
              key={ev.title}
              className="flex items-center gap-2.5 rounded-lg px-2.5 md:px-3 py-1.5 md:py-2 bg-[#f7f7f6]/60"
            >
              <span className="text-[10px] md:text-[11px] font-mono text-[#b2b4b2] w-14 shrink-0">
                {ev.time}
              </span>
              <ev.icon className="size-3 text-[#c6c8c7] shrink-0" />
              <span className="text-[11px] md:text-[13px] text-[#4a4a4a] flex-1 truncate">
                {ev.title}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   State 2 — Understand
   One event is highlighted. An insight card appears inline
   showing what Omni Cal found. MessageLoading as it thinks.
   ═══════════════════════════════════════════════════════ */

function UnderstandContent() {
  return (
    <div className="h-full flex flex-col p-3 md:p-5 overflow-y-auto">
      <p className="text-[9px] font-mono text-[#b2b4b2] uppercase tracking-wider mb-2 md:mb-3">
        Today — Thursday, Mar 19
      </p>
      <div className="space-y-1.5">
        {SCHEDULE.map((ev) => {
          const isHighlighted = ev.highlight;

          return (
            <div key={ev.title}>
              {/* Event row */}
              <div
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-all duration-300 ${
                  isHighlighted
                    ? "bg-white border border-[#4285F4]/20 shadow-[0_1px_8px_rgba(66,133,244,0.08)]"
                    : "bg-[#f7f7f6]/60"
                }`}
              >
                <span className="text-[10px] md:text-[11px] font-mono text-[#b2b4b2] w-14 shrink-0">
                  {ev.time}
                </span>
                <ev.icon
                  className={`size-3 shrink-0 ${
                    isHighlighted ? "text-[#4285F4]" : "text-[#c6c8c7]"
                  }`}
                />
                <span
                  className={`text-[11px] md:text-[13px] flex-1 truncate ${
                    isHighlighted
                      ? "text-[#1a1a1a] font-medium"
                      : "text-[#4a4a4a]"
                  }`}
                >
                  {ev.title}
                </span>
                {isHighlighted && (
                  <div className="flex items-center gap-1 rounded-full bg-[#4285F4]/[0.08] px-2 py-0.5">
                    <Sparkles className="size-2.5 text-[#4285F4]" />
                    <span className="text-[8px] font-mono text-[#4285F4]">
                      AI
                    </span>
                  </div>
                )}
              </div>

              {/* Insight card — inline below the highlighted event */}
              {isHighlighted && (
                <div className="ml-6 md:ml-8 mt-1.5">
                  <div className="rounded-xl border border-[#4285F4]/10 bg-[#4285F4]/[0.03] p-3 md:p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles className="size-3.5 text-[#4285F4]" />
                      <span className="text-[10px] font-mono text-[#4285F4] uppercase tracking-wider">
                        Context found
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {INSIGHTS.map((insight, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <div className="size-1 rounded-full bg-[#4285F4]/40 mt-1.5 shrink-0" />
                          <span className="text-[11px] text-[#4a4a4a] leading-relaxed">
                            {insight}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-3 text-[#4285F4]/60">
                      <MessageLoading />
                      <span className="text-[10px] font-mono">
                        Analyzing context...
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   State 3 — Prepare
   Omni Cal generates a prep card. The result of real work.
   ═══════════════════════════════════════════════════════ */

function PrepareContent() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-4 md:mb-5">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#4285F4]/[0.08] px-3 py-1 mb-3">
            <CheckCircle2 className="size-3.5 text-[#4285F4]" />
            <span className="text-[10px] font-mono text-[#4285F4] uppercase tracking-wider">
              Preparation ready
            </span>
          </div>
          <h3 className="text-base md:text-lg font-semibold text-[#1a1a1a]">
            Product Review Meeting
          </h3>
          <p className="text-xs text-[#9c9e9b] mt-1">Today at 3:00 PM</p>
        </div>

        {/* Generated prep card */}
        <div className="rounded-xl border border-black/[0.06] bg-[#f7f7f6] p-4 md:p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <Briefcase className="size-3.5 text-[#4285F4]" />
            <span className="text-[11px] font-mono text-[#9c9e9b] uppercase tracking-wider">
              Meeting prep
            </span>
          </div>
          <div className="space-y-2">
            {PREP_ITEMS.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <CheckCircle2 className="size-3.5 text-[#4285F4]/60 mt-0.5 shrink-0" />
                <span className="text-[12px] md:text-[13px] text-[#4a4a4a] leading-relaxed">
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   State 4 — Deliver
   iPhone-style lock screen with Omni Cal notifications.
   The product delivers value before the moment arrives.
   ═══════════════════════════════════════════════════════ */

function PhoneDelivery() {
  return (
    <div className="relative w-[260px] md:w-[300px]">
      {/* iPhone frame */}
      <div className="rounded-[36px] md:rounded-[40px] border-[3px] border-[#1a1a1a]/10 bg-white shadow-[0_8px_40px_rgba(0,0,0,0.08)] overflow-hidden">
        {/* Dynamic island */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-20 md:w-24 h-[22px] md:h-[26px] rounded-full bg-[#1a1a1a] opacity-90" />
        </div>

        {/* Lock screen */}
        <div className="px-5 md:px-6 pt-5 md:pt-6 pb-6 md:pb-8">
          {/* Time display */}
          <div className="text-center mb-5 md:mb-6">
            <p className="text-[32px] md:text-[40px] font-light text-[#1a1a1a] tracking-tight leading-none">
              11:42
            </p>
            <p className="text-[11px] text-[#9c9e9b] mt-1">
              Thursday, March 19
            </p>
          </div>

          {/* Notification stack */}
          <div className="space-y-2">
            {NOTIFICATIONS.map((notif, i) => (
              <div
                key={i}
                className="rounded-2xl bg-[#f7f7f6]/90 backdrop-blur-sm border border-black/[0.04] p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="size-5 rounded-md bg-[#4285F4]/10 flex items-center justify-center">
                    <Bell className="size-2.5 text-[#4285F4]" />
                  </div>
                  <span className="text-[10px] font-semibold text-[#1a1a1a] flex-1">
                    Omni Cal
                  </span>
                  <span className="text-[9px] text-[#b2b4b2]">
                    {notif.time}
                  </span>
                </div>
                <p className="text-[11px] font-medium text-[#2a2a2a] mb-0.5">
                  {notif.title}
                </p>
                <p className="text-[10px] text-[#818380] leading-relaxed">
                  {notif.body}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Home indicator */}
        <div className="flex justify-center pb-2">
          <div className="w-28 h-1 rounded-full bg-[#1a1a1a]/15" />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Demo Component
   Scroll-driven 5-state workflow. Each state's content
   crossfades via opacity transforms tied to scroll progress.
   ═══════════════════════════════════════════════════════ */

export function OmniCalDemo({
  scrollProgress,
}: {
  scrollProgress: MotionValue<number>;
}) {
  const [activeStep, setActiveStep] = useState(0);

  /* ── Opacity transforms for each state ── */
  const s0 = useTransform(
    scrollProgress,
    [0, 0.14, 0.18, 0.22],
    [1, 1, 0.3, 0]
  );
  const s1 = useTransform(
    scrollProgress,
    [0.16, 0.22, 0.36, 0.42],
    [0, 1, 1, 0]
  );
  const s2 = useTransform(
    scrollProgress,
    [0.36, 0.42, 0.56, 0.62],
    [0, 1, 1, 0]
  );
  const s3 = useTransform(
    scrollProgress,
    [0.56, 0.62, 0.74, 0.82],
    [0, 1, 1, 0]
  );
  const s4 = useTransform(
    scrollProgress,
    [0.76, 0.84, 1, 1],
    [0, 1, 1, 1]
  );

  /* Panel fades out as phone fades in */
  const panelOpacity = useTransform(
    scrollProgress,
    [0.74, 0.84],
    [1, 0]
  );

  /* ── Track active step for progress indicator ── */
  useMotionValueEvent(scrollProgress, "change", (v) => {
    if (v < 0.2) setActiveStep(0);
    else if (v < 0.4) setActiveStep(1);
    else if (v < 0.6) setActiveStep(2);
    else if (v < 0.8) setActiveStep(3);
    else setActiveStep(4);
  });

  return (
    <div className="h-full flex flex-col">
      {/* Progress + description */}
      <div className="shrink-0 mb-3 md:mb-4">
        <ProgressSteps active={activeStep} />
        <p className="text-[11px] md:text-xs text-[#9c9e9b] text-center mt-2 h-4">
          {STATE_DESCRIPTIONS[activeStep]}
        </p>
      </div>

      {/* Content area — states crossfade here */}
      <div className="relative flex-1 min-h-0">
        {/* ── Panel: states 0–3 ── */}
        <motion.div
          style={{ opacity: panelOpacity }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="w-full h-full max-h-[500px]">
            <PanelChrome>
              <div className="relative h-full">
                <motion.div
                  style={{ opacity: s0 }}
                  className="absolute inset-0"
                >
                  <ConnectContent />
                </motion.div>
                <motion.div
                  style={{ opacity: s1 }}
                  className="absolute inset-0"
                >
                  <CalendarContent />
                </motion.div>
                <motion.div
                  style={{ opacity: s2 }}
                  className="absolute inset-0"
                >
                  <UnderstandContent />
                </motion.div>
                <motion.div
                  style={{ opacity: s3 }}
                  className="absolute inset-0"
                >
                  <PrepareContent />
                </motion.div>
              </div>
            </PanelChrome>
          </div>
        </motion.div>

        {/* ── Phone: state 4 ── */}
        <motion.div
          style={{ opacity: s4 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <PhoneDelivery />
        </motion.div>
      </div>
    </div>
  );
}
