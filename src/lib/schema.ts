// ── Omni Cal – Production Data Schema ─────────────────
// These types represent the real data model for the app.
// They extend the existing UI types with backend-ready fields.

// ── Users ─────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  timezone: string;
  plan: "free" | "pro" | "team";
  createdAt: string; // ISO
  settings: UserSettings;
}

export interface UserSettings {
  notifications: {
    emailPrepReady: boolean;
    emailDailyDigest: boolean;
    emailWeeklySummary: boolean;
    emailIntegrationAlerts: boolean;
    pushEventReminders: boolean;
    pushPrepAvailable: boolean;
    pushScheduleChanges: boolean;
  };
  preferences: {
    language: string;
    dateFormat: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
    firstDayOfWeek: "sunday" | "monday";
  };
}

// ── OAuth / Integration Tokens ────────────────────────
export type IntegrationProvider =
  | "google-calendar"
  | "gmail"
  | "google-docs"
  | "google-drive"
  | "slack"
  | "groupme"
  | "whatsapp";

export interface OAuthToken {
  provider: IntegrationProvider;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix timestamp
  scopes: string[];
  metadata?: Record<string, string>; // workspace ID, email, etc.
}

export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "connecting"
  | "error"
  | "coming-soon";

export interface ConnectedIntegration {
  id: string;
  userId: string;
  provider: IntegrationProvider;
  status: ConnectionStatus;
  connectedAt?: string;
  lastSyncAt?: string;
  error?: string;
  metadata?: Record<string, string>;
}

// ── Calendar Events (from integrations) ───────────────
export interface SyncedCalendarEvent {
  id: string;
  userId: string;
  externalId: string; // Google Calendar event ID, etc.
  source: IntegrationProvider;
  title: string;
  description?: string;
  startTime: string; // ISO datetime
  endTime: string; // ISO datetime
  location?: string;
  attendees: EventAttendee[];
  category: "academic" | "work" | "social" | "personal" | "health";
  isAllDay: boolean;
  recurrence?: string;
  syncedAt: string;
  raw?: Record<string, unknown>; // original API response
}

export interface EventAttendee {
  name: string;
  email?: string;
  responseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
}

// ── AI-Generated Inbox Items ──────────────────────────
export type GenerationStatus = "queued" | "generating" | "ready" | "failed" | "viewed";

export type GenerationType =
  | "study-guide"
  | "meeting-notes"
  | "work-notes"
  | "social-brief"
  | "prep-summary";

export interface GeneratedItem {
  id: string;
  userId: string;
  eventId: string;
  type: GenerationType;
  status: GenerationStatus;
  title: string;
  summary: string;
  trigger: string; // why this was generated
  sources: string[]; // what data was used
  confidence: "high" | "medium" | "low";
  content: GeneratedContent;
  documentUrl?: string; // Google Doc link if exported
  documentId?: string; // Google Doc ID
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export interface GeneratedContent {
  sections: GeneratedSection[];
}

export interface GeneratedSection {
  heading: string;
  body?: string;
  items?: string[];
}

// ── Document Generation ───────────────────────────────
export interface GeneratedDocument {
  id: string;
  userId: string;
  inboxItemId: string;
  provider: "google-docs" | "google-drive";
  externalId: string; // Google Doc/Drive file ID
  url: string; // shareable link
  title: string;
  createdAt: string;
  folderId?: string; // Google Drive folder ID
}
