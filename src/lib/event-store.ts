// ── Event Store ───────────────────────────────────────
// Client-side event state with CRUD operations.
// Starts empty. Events come from user creation or synced integrations.

import type { CalendarEvent, EventCategory } from "./types";

let allEvents: CalendarEvent[] = [];
let listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function getEvents(): CalendarEvent[] {
  return allEvents;
}

export function getEvent(id: string): CalendarEvent | undefined {
  return allEvents.find((e) => e.id === id);
}

export function addEvent(event: Omit<CalendarEvent, "id" | "source">): CalendarEvent {
  const newEvent: CalendarEvent = {
    ...event,
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    source: "local",
  };
  allEvents = [...allEvents, newEvent];
  notify();

  // Auto-trigger pipeline for newly created events
  triggerPipelineForEvent(newEvent);

  return newEvent;
}

// Fire-and-forget pipeline trigger for a new event
function triggerPipelineForEvent(event: CalendarEvent): void {
  fetch("/api/pipeline/trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId: event.id,
      source: event.source === "google-calendar" ? "google_calendar" : "manual",
      eventData: {
        title: event.title,
        description: event.description,
        location: event.location,
        attendees: event.attendees,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        category: event.category,
      },
    }),
  })
    .then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        if (data.runId) {
          // Update the event with pipeline status
          updateEvent(event.id, {
            pipelineStatus: "analyzing",
            pipelineRunId: data.runId,
          });
          console.log(`[event-store] Pipeline auto-triggered for "${event.title}" (runId: ${data.runId})`);
        }
      } else {
        console.warn(`[event-store] Pipeline trigger returned ${res.status} for "${event.title}"`);
      }
    })
    .catch((err) => {
      console.warn(`[event-store] Pipeline auto-trigger failed for "${event.title}":`, err);
    });
}

// Fields that constitute a "material" change requiring artifact invalidation
const MATERIAL_FIELDS: (keyof CalendarEvent)[] = ["title", "date", "startTime", "endTime", "description", "location", "attendees"];

export function updateEvent(id: string, updates: Partial<CalendarEvent>): CalendarEvent | null {
  const idx = allEvents.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const original = allEvents[idx];
  const updated = { ...original, ...updates, id };
  allEvents = [...allEvents.slice(0, idx), updated, ...allEvents.slice(idx + 1)];

  // Check for material changes and invalidate artifacts if needed
  const hasMaterialChange = MATERIAL_FIELDS.some((field) => {
    const oldVal = JSON.stringify(original[field]);
    const newVal = JSON.stringify(updated[field]);
    return oldVal !== newVal;
  });

  if (hasMaterialChange && original.pipelineStatus && original.pipelineStatus !== "none") {
    updated.pipelineStatus = "stale";
    allEvents[idx] = updated;
    // Fire invalidation request (best-effort)
    fetch(`/api/pipeline/events/${id}/invalidate`, { method: "POST" }).catch(() => {});
  }

  notify();
  return updated;
}

export function deleteEvent(id: string): boolean {
  const before = allEvents.length;
  allEvents = allEvents.filter((e) => e.id !== id);
  if (allEvents.length !== before) {
    notify();
    return true;
  }
  return false;
}

// Bulk import from synced sources (Google Calendar, etc.)
// Upserts by ID — adds new events, replaces existing ones with incoming data.
// The caller (e.g. calendar-sync) is responsible for merging local-only fields
// before passing events here.
export function importEvents(events: CalendarEvent[]): void {
  const existingById = new Map(allEvents.map((e) => [e.id, e]));
  let changed = false;

  for (const event of events) {
    const existing = existingById.get(event.id);
    if (!existing) {
      // New event — append
      allEvents = [...allEvents, event];
      existingById.set(event.id, event);
      changed = true;
    } else {
      // Existing event — replace in-place if anything differs
      const isDifferent = existing.title !== event.title
        || existing.startTime !== event.startTime
        || existing.endTime !== event.endTime
        || existing.date !== event.date
        || existing.description !== event.description
        || existing.location !== event.location
        || JSON.stringify(existing.attendees) !== JSON.stringify(event.attendees)
        || existing.pipelineStatus !== event.pipelineStatus;

      if (isDifferent) {
        const idx = allEvents.findIndex((e) => e.id === event.id);
        if (idx !== -1) {
          allEvents = [...allEvents.slice(0, idx), event, ...allEvents.slice(idx + 1)];
          existingById.set(event.id, event);
          changed = true;
        }
      }
    }
  }

  if (changed) {
    notify();
  }
}

// ── Calendar math helpers ─────────────────────────────

export function getMonthDates(year: number, month: number): string[][] {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const weeks: string[][] = [];
  let currentWeek: string[] = [];

  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthDays - i);
    currentWeek.push(d.toISOString().split("T")[0]);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    currentWeek.push(d.toISOString().split("T")[0]);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    let nextDay = 1;
    while (currentWeek.length < 7) {
      const d = new Date(year, month + 1, nextDay++);
      currentWeek.push(d.toISOString().split("T")[0]);
    }
    weeks.push(currentWeek);
  }

  return weeks;
}

export function getWeekDates(offset = 0): string[] {
  const today = new Date();
  today.setDate(today.getDate() + offset * 7);
  const day = today.getDay();
  const start = new Date(today);
  start.setDate(today.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

export function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split("T")[0];
}

export function isCurrentMonth(dateStr: string, year: number, month: number): boolean {
  const d = new Date(dateStr + "T00:00:00");
  return d.getFullYear() === year && d.getMonth() === month;
}

export function formatDateFull(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatDateShort(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

export function categoryDot(category: EventCategory): string {
  const colors: Record<string, string> = {
    academic: "bg-violet-400",
    work: "bg-blue-400",
    social: "bg-amber-400",
    personal: "bg-emerald-400",
    health: "bg-rose-400",
  };
  return colors[category] || colors.work;
}

export const CATEGORIES: { value: EventCategory; label: string; color: string }[] = [
  { value: "work", label: "Work", color: "bg-blue-400" },
  { value: "academic", label: "Academic", color: "bg-violet-400" },
  { value: "social", label: "Social", color: "bg-amber-400" },
  { value: "personal", label: "Personal", color: "bg-emerald-400" },
  { value: "health", label: "Health", color: "bg-rose-400" },
];
