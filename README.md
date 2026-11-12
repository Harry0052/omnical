# Omni Cal

A prompt-less AI calendar assistant. It ingests upcoming events, classifies them with Anthropic Claude, gathers context, and prepares briefs, study guides, slide outlines, and notes. There is no chat box. Creating or syncing an event triggers the pipeline.

The marketing site headline is "The calendar that prepares you for life." The landing page includes a scroll-driven product demo and a waitlist form. The workspace lives at [`/app`](http://localhost:3000/app), which redirects to the calendar. Other workspace routes are inbox, triage, tasks, integrations, pipeline status, and settings.

This repository has no deployed demo URL.

## Demo

```bash
git clone https://github.com/Harry0052/omnical.git
cd omnical
npm install
cp .env.example .env.local
# Add ANTHROPIC_API_KEY for live classification and generation.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the marketing site and [http://localhost:3000/app](http://localhost:3000/app) for the workspace.

Server stores are in-memory singletons. They reset when the Node process restarts. The browser calendar list is also an in-memory module and resets on reload.

## Features

- Event ingest from manual entry and from the Google Calendar API when that account is connected
- Claude classification of event type (`study`, `meeting`, `interview`, `class`, `presentation`, `travel`, `social`, `admin`, `other`), urgency, and actionability, validated with Zod
- Pipeline stages: ingested → classifying → classified → planning → planned → queued or awaiting approval → executing → synthesizing → completed or failed
- Planner workflows: study guide, slide-deck content, meeting research brief, meeting notes, registration or RSVP, logistics booking, and task-prep bundle. The generic planner runs when Claude sets `actionType` to `generic_agent_task`, or when the event type is `other` and no template was selected with confidence of at least 0.6. Other event types map to a template. The last-resort workflow is `task_prep_bundle`
- Context engine: email classification, task extraction, event briefs, and email-cleanup candidates, each calling Claude
- OAuth implemented in code: Google (Calendar, Gmail, Docs, and Drive scopes on one consent flow) and Slack. API clients call the Google Calendar, Gmail, Docs, Drive, and Slack Web APIs
- Pipeline settings the orchestrator enforces: enable flag, `auto` vs `approve_all`, hourly and daily rate limits, and a disabled-workflows list. The settings screen toggles enable and approval mode and displays the rate limits
- Classification retries failed Claude calls. A failed run can be started again with `POST /api/pipeline/runs/[runId]/retry`
- Vitest tests for calendar sync, ingest, classification, planners, pipeline hardening, and the study-guide, slide-deck, and meeting-notes workflows

## Current limits

These are in the repo today. The landing-page FAQ describes a broader product than the code implements.

- API routes use the hardcoded user id `demo-user`. There is no login session. The sidebar shows a placeholder user. Profile, password, notification, and delete-account controls on the settings page do not persist anything
- The waitlist form waits one second and shows a success message. The submit handler is marked `TODO: Supabase insert` and does not store the email
- Pipeline event records, runs, artifacts, settings, context-engine data, OAuth tokens, and integration connection state are in-memory. A restart drops them, including Google and Slack connections
- Swap points for persistence are the store interfaces in `src/lib/pipeline/store.ts` and `src/lib/context-engine/store.ts`, plus the token map in `src/lib/integrations/token-store.ts`
- OAuth config implements Google and Slack only. The FAQ names Apple Calendar and Outlook. The integrations page also lists GroupMe and WhatsApp as coming soon. `src/lib/mock-data.ts` lists additional providers that the live integrations page does not use
- The FAQ says data is encrypted at rest. This repo has no database and no encryption-at-rest implementation
- The FAQ says you can still chat with Omni Cal. There is no chat UI
- Meeting-notes live capture is a stub (`StubCaptureProvider`, `isAvailable = false`) for Zoom, Google Meet, Teams, and Webex. The workflow generates preparation notes with Claude
- Steps typed `web_research` send URLs and instructions to Claude. They do not fetch those pages or run a browser
- `PipelineSettings.retryPolicy` is stored and accepted by the settings API. The orchestrator does not read it

Artifact types produced by the pipeline: study guide, meeting brief, notes, outline, slide content, checklist, action summary, research brief, and generic output.

## Stack

| Layer | Technology |
| --- | --- |
| App | Next.js 16.2 (App Router), TypeScript, React 19 |
| UI | Tailwind CSS v4, shadcn/ui, Framer Motion |
| AI | Anthropic Claude (`@anthropic-ai/sdk`). Default classification model: `claude-sonnet-4-20250514` |
| Validation | Zod |
| Tests | Vitest |
| Integrations | Google OAuth (Calendar, Gmail, Docs, Drive) and Slack OAuth |

## Architecture

```
src/app/                  Marketing site + /app workspace routes
src/app/api/
  calendar/               Google Calendar event fetch
  context-engine/         Briefs, triage, tasks, cleanup, audit, settings
  integrations/           Google and Slack OAuth + status
  pipeline/               Trigger, runs, approve, retry, artifacts, settings
src/lib/pipeline/         Orchestrator, classify, plan, execute, synthesize,
                          plus workflows (study-guide, slide-deck, zoom-notes)
src/lib/context-engine/   Classifier, task extractor, event brief, email cleanup
src/lib/integrations/     Google Calendar, Gmail, Docs, Drive, Slack, token store
src/lib/__tests__         Calendar sync tests
src/lib/pipeline/__tests__  Ingest, classification, planner, hardening, and workflow tests
```

## How to run

**Requirements:** Node.js 20.9 or newer (Next.js 16). An Anthropic API key is required for live classification and generation. Google and Slack OAuth credentials are required only to connect those accounts.

Copy [`.env.example`](.env.example) to `.env.local` and fill in the values you need. The example file contains empty placeholders.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server at localhost:3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Vitest once (`npm run test:watch` for watch mode) |
| `npm run lint` | ESLint |

## Suggested GitHub metadata

- **Description:** Prompt-less AI calendar assistant that prepares event briefs, study guides, and meeting artifacts from your schedule.
- **Website:** leave empty until a demo is deployed
- **Topics:** `nextjs` `typescript` `anthropic` `calendar` `ai-agents` `google-calendar` `slack`
