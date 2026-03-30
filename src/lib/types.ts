export type EventCategory = "academic" | "work" | "social" | "personal" | "health";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO date YYYY-MM-DD
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  category: EventCategory;
  location?: string;
  description?: string;
  notes?: string;
  attendees?: string[];
  inboxItemId?: string;
  source?: "local" | "google-calendar"; // where the event came from
  pipelineStatus?: "none" | "analyzing" | "planning" | "queued" | "awaiting_approval" | "executing" | "completed" | "failed" | "stale";
  pipelineRunId?: string;
  artifactIds?: string[];
}

export type InboxItemType =
  | "study-guide"
  | "meeting-notes"
  | "work-notes"
  | "social-brief"
  | "prep-summary";

export type InboxItemStatus = "generating" | "ready" | "failed" | "viewed";

export interface InboxItem {
  id: string;
  type: InboxItemType;
  title: string;
  summary: string;
  status: InboxItemStatus;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  createdAt: string;
  content: InboxItemContent;
  trigger: string;
  sources: string[];
  generatedAgo: string;
  confidence: "high" | "medium";
  documentUrl?: string;
  documentId?: string;
}

export interface InboxItemContent {
  sections: ContentSection[];
}

export interface ContentSection {
  heading: string;
  body?: string;
  items?: string[];
}

export type IntegrationStatus = "connected" | "disconnected" | "coming-soon";

export interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: IntegrationStatus;
  category: "calendar" | "email" | "messaging" | "social" | "productivity";
}
