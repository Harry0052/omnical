import type {
  CalendarEvent,
  InboxItem,
  Integration,
} from "./types";

// ── Helper: dates relative to "today" ────────────────────
function d(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().split("T")[0];
}

// ── Calendar Events ──────────────────────────────────────
export const events: CalendarEvent[] = [
  {
    id: "evt-1",
    title: "Biology Midterm",
    date: d(1),
    startTime: "09:00",
    endTime: "11:00",
    category: "academic",
    location: "Science Hall 201",
    description: "Covers chapters 8-14: Cell biology, genetics, and evolution",
    inboxItemId: "inbox-1",
  },
  {
    id: "evt-2",
    title: "Startup Strategy Meeting",
    date: d(4),
    startTime: "14:00",
    endTime: "15:30",
    category: "work",
    location: "Zoom",
    attendees: ["Jordan Lee", "Priya Patel", "Marcus Chen"],
    description: "Q2 roadmap review and fundraising timeline discussion",
    inboxItemId: "inbox-2",
  },
  {
    id: "evt-3",
    title: "Coffee with Alex Rivera",
    date: d(2),
    startTime: "10:30",
    endTime: "11:30",
    category: "social",
    location: "Blue Bottle Coffee, Hayes Valley",
    attendees: ["Alex Rivera"],
    description: "Catch-up — Alex recently moved to SF from NYC",
    inboxItemId: "inbox-3",
  },
  {
    id: "evt-4",
    title: "Team Standup",
    date: d(0),
    startTime: "09:30",
    endTime: "09:45",
    category: "work",
    location: "Slack Huddle",
    attendees: ["Jordan Lee", "Sam Torres"],
  },
  {
    id: "evt-5",
    title: "Gym — Upper Body",
    date: d(0),
    startTime: "07:00",
    endTime: "08:00",
    category: "health",
    location: "Equinox FiDi",
  },
  {
    id: "evt-6",
    title: "Organic Chemistry Lab",
    date: d(3),
    startTime: "13:00",
    endTime: "16:00",
    category: "academic",
    location: "Chem Building B12",
    description: "Experiment 7: Fischer esterification synthesis",
  },
  {
    id: "evt-7",
    title: "Dinner with Mom",
    date: d(5),
    startTime: "19:00",
    endTime: "21:00",
    category: "personal",
    location: "Nopa Restaurant",
  },
  {
    id: "evt-8",
    title: "Product Design Review",
    date: d(1),
    startTime: "15:00",
    endTime: "16:00",
    category: "work",
    location: "Figma / Zoom",
    attendees: ["Priya Patel", "Lena Zhao"],
    description: "Review new onboarding flow mockups",
    inboxItemId: "inbox-4",
  },
  {
    id: "evt-9",
    title: "Yoga",
    date: d(2),
    startTime: "07:30",
    endTime: "08:30",
    category: "health",
    location: "CorePower Yoga",
  },
  {
    id: "evt-10",
    title: "Investor Call — Series A",
    date: d(6),
    startTime: "11:00",
    endTime: "12:00",
    category: "work",
    location: "Google Meet",
    attendees: ["Rachel Kim (Sequoia)", "David Park"],
    description: "First intro call with Sequoia partner",
    inboxItemId: "inbox-5",
  },
];

// ── Inbox Items ──────────────────────────────────────────
export const inboxItems: InboxItem[] = [
  {
    id: "inbox-1",
    type: "study-guide",
    title: "Biology Midterm Study Guide",
    summary:
      "Comprehensive review covering cell biology, genetics, and evolutionary mechanisms from chapters 8–14.",
    status: "ready",
    eventId: "evt-1",
    eventTitle: "Biology Midterm",
    eventDate: d(1),
    createdAt: new Date().toISOString(),
    trigger: "Detected exam event on your calendar — automatically generated study materials",
    sources: ["Google Calendar", "Gmail (course syllabus email from Prof. Chen)"],
    generatedAgo: "3 hours ago",
    confidence: "high",
    content: {
      sections: [
        {
          heading: "Exam Overview",
          body: "Your Biology midterm covers Chapters 8–14 and will be held tomorrow in Science Hall 201. Based on the syllabus attached in Prof. Chen's email from Feb 28, the exam format includes 40 multiple-choice questions and 3 short-answer essays. Past exams from this professor emphasize mechanism understanding over rote memorization — focus your review accordingly.",
        },
        {
          heading: "Key Concepts to Review",
          body: "These topics were identified from the course syllabus and weighted by the chapter distribution in your professor's previous midterms:",
          items: [
            "Cell membrane transport — active vs passive, osmosis, facilitated diffusion",
            "Cellular respiration — glycolysis, Krebs cycle, electron transport chain (know the ATP yield at each stage)",
            "Photosynthesis — light reactions vs Calvin cycle, C3/C4/CAM plant adaptations",
            "DNA replication — leading vs lagging strand, Okazaki fragments, proofreading enzymes",
            "Gene expression — transcription, translation, post-translational modifications",
            "Mendelian genetics — Punnett squares, incomplete dominance, epistasis, sex-linked traits",
            "Evolution — natural selection, genetic drift, speciation mechanisms, Hardy-Weinberg equilibrium",
          ],
        },
        {
          heading: "Suggested Study Plan",
          body: "You have approximately 18 hours before the exam. Based on chapter density and typical exam weighting, here is a time-optimized breakdown:",
          items: [
            "Tonight (3 hrs): Review chapters 8–10, focus on cellular respiration diagrams and ATP accounting",
            "Tomorrow morning (2 hrs): Chapters 11–12, work through genetics practice problems",
            "Tomorrow afternoon (2 hrs): Chapters 13–14, review evolution case studies and speciation examples",
            "Final hour before exam: Skim flashcards, re-read your highlighted notes, do not attempt new material",
          ],
        },
        {
          heading: "High-Yield Practice Questions",
          body: "These are modeled after the question style Prof. Chen uses based on previous exam patterns:",
          items: [
            "Explain why the electron transport chain produces significantly more ATP than glycolysis alone. Include the role of the proton gradient.",
            "Compare and contrast C3 and C4 photosynthesis pathways. Under what environmental conditions does each have an advantage?",
            "A heterozygous tall plant (Tt) is crossed with a homozygous short plant (tt). Draw the Punnett square and state the expected phenotypic ratio.",
            "Describe two mechanisms that can lead to speciation. Give a real-world example of each.",
          ],
        },
        {
          heading: "Exam Day Logistics",
          items: [
            "Location: Science Hall 201 — arrive by 8:45 AM, exam starts at 9:00 AM sharp",
            "Duration: 2 hours (9:00 – 11:00 AM)",
            "Bring: #2 pencil, student ID, approved calculator (no phone calculators)",
            "Note: You have a Product Design Review at 3 PM the same day — study guide for that is also in your inbox",
          ],
        },
      ],
    },
  },
  {
    id: "inbox-2",
    type: "meeting-notes",
    title: "Startup Strategy Meeting Prep",
    summary:
      "Agenda, talking points, and attendee context for the Q2 roadmap and fundraising discussion with your co-founders.",
    status: "ready",
    eventId: "evt-2",
    eventTitle: "Startup Strategy Meeting",
    eventDate: d(4),
    createdAt: new Date().toISOString(),
    trigger: "Recurring meeting with 3 attendees detected — generated prep from recent Slack threads and email context",
    sources: ["Google Calendar", "Gmail (investor intro threads)", "Slack (#product, #growth channels)"],
    generatedAgo: "12 hours ago",
    confidence: "high",
    content: {
      sections: [
        {
          heading: "Meeting Context",
          body: "This is your bi-weekly strategy sync with co-founders Jordan, Priya, and Marcus. The primary focus this session is finalizing the Q2 product roadmap and aligning on fundraising timelines. Your last meeting (March 7) flagged the need to decide between expanding features vs. deepening core product quality — that decision is still open.",
        },
        {
          heading: "Suggested Agenda",
          body: "Based on open threads in Slack and unresolved action items from your last sync:",
          items: [
            "Quick wins from the past two weeks — Jordan shipped the API rate limiter, Priya finished user research (5 min)",
            "Q2 roadmap prioritization — feature expansion vs core polish, need a final decision (20 min)",
            "Fundraising timeline — Marcus has 3 new warm intros from the YC dinner, target close date discussion (15 min)",
            "Hiring plan — do we need a third engineer before Series A? Jordan flagged this in #hiring (10 min)",
            "Action items and owners (5 min)",
          ],
        },
        {
          heading: "Attendee Context",
          body: "What each person is likely focused on based on their recent messages and activity:",
          items: [
            "Jordan Lee (CTO) — Has been pushing for a rewrite of the auth system in #engineering. Expect him to advocate for infrastructure investment over new features. Also mentioned burnout concerns in a 1:1 message last week.",
            "Priya Patel (Head of Design) — Just completed user research showing a 34% drop-off at onboarding step 3 (permission granting). Will likely push for UX improvements as the top Q2 priority.",
            "Marcus Chen (COO) — Managing investor pipeline. Has 3 warm intros from last week's YC dinner he wants to discuss. Sent you a DM about timing the raise.",
          ],
        },
        {
          heading: "Key Numbers to Reference",
          items: [
            "MAU grew 18% month-over-month — strongest organic growth to date",
            "NPS dropped from 62 to 58 — likely correlated with onboarding friction Priya identified",
            "Current burn rate: $47K/month — gives ~14 months of runway at current spend",
            "Pipeline: 6 investors in active conversations, 3 new warm intros pending",
          ],
        },
        {
          heading: "Open Decision",
          body: "The core question to resolve this meeting: Should you target a Series A raise in Q3 (requires strong Q2 metrics) or extend the seed runway with a small bridge round? Marcus and Jordan are split on this — come prepared with a point of view.",
        },
      ],
    },
  },
  {
    id: "inbox-3",
    type: "social-brief",
    title: "Coffee with Alex — People Brief",
    summary:
      "Background, recent activity, and conversation starters for your catch-up with Alex Rivera.",
    status: "ready",
    eventId: "evt-3",
    eventTitle: "Coffee with Alex Rivera",
    eventDate: d(2),
    createdAt: new Date().toISOString(),
    trigger: "Social event with attendee detected — built a context brief from public profiles and mutual connections",
    sources: ["Google Calendar", "LinkedIn (Alex Rivera profile)", "Gmail (meetup RSVP thread)"],
    generatedAgo: "6 hours ago",
    confidence: "high",
    content: {
      sections: [
        {
          heading: "Who Is Alex Rivera",
          body: "Alex is a senior product designer who recently relocated from NYC to San Francisco. You met at a design systems meetup on February 18 and exchanged numbers. He previously worked at Figma for 3 years on the collaboration tools team and just started at Stripe 3 weeks ago on the payments UX team. He studied Visual Communication at SVA in New York.",
        },
        {
          heading: "Recent Activity",
          body: "Updates from Alex's public profiles and your shared context:",
          items: [
            "Started at Stripe ~3 weeks ago — likely still onboarding and forming first impressions",
            "Posted on LinkedIn about exploring SF's trail running scene — you also run, this is a natural connection point",
            "Shared an article on design systems in fintech with the comment \"This is exactly the kind of problem I want to solve\"",
            "Previously lived in Brooklyn for 6 years — has mentioned missing NYC pizza and Prospect Park",
            "Mutual connection: Jordan Lee (your CTO) also worked at Figma briefly — could be a conversation bridge",
          ],
        },
        {
          heading: "Conversation Starters",
          body: "Openers that feel natural based on shared interests and his current context:",
          items: [
            "\"How's the first month at Stripe going? Is the design culture different from Figma?\"",
            "\"Have you found any good running trails yet? I do the Lands End trail most weekends.\"",
            "\"I saw your post about design systems in fintech — are you getting to work on that at Stripe?\"",
            "\"How's the move to SF treating you? Found any spots that remind you of Brooklyn?\"",
          ],
        },
        {
          heading: "Venue Note",
          body: "You're meeting at Blue Bottle Coffee in Hayes Valley. It tends to get crowded after 11 AM on weekdays — since your slot is 10:30, you should be fine. Street parking is limited; there's a garage on Fell Street nearby.",
        },
      ],
    },
  },
  {
    id: "inbox-4",
    type: "work-notes",
    title: "Design Review — Talking Points",
    summary:
      "Context, key questions, and data points for the onboarding flow design review with Priya and Lena.",
    status: "generating",
    eventId: "evt-8",
    eventTitle: "Product Design Review",
    eventDate: d(1),
    createdAt: new Date().toISOString(),
    trigger: "Work meeting with design team detected — pulling context from Figma comments and Slack discussions",
    sources: ["Google Calendar", "Slack (#design-review thread)", "Gmail (Figma file share)"],
    generatedAgo: "just now",
    confidence: "medium",
    content: {
      sections: [
        {
          heading: "Review Context",
          body: "Priya's team has been iterating on the new onboarding flow for the past two sprints. The current flow has a 34% drop-off at step 3 (permission granting). This review covers three alternative mockups that aim to reduce friction. Priya shared the Figma file via email yesterday — Omni Cal is still processing the design comments to generate more detailed notes.",
        },
        {
          heading: "Key Questions to Address",
          body: "Based on the Slack thread in #design-review and Priya's email summary:",
          items: [
            "Does the progressive disclosure approach in Variant B meaningfully reduce cognitive load at step 3?",
            "Should we A/B test the simplified vs detailed permission explanation, or go with one?",
            "Is the illustration style consistent with the brand guidelines Lena updated last month?",
            "Timeline: can the winning variant ship before the Q2 marketing push on April 15?",
          ],
        },
        {
          heading: "Data Points",
          body: "Omni Cal is still gathering additional context. The following has been collected so far:",
          items: [
            "Current step 3 drop-off rate: 34% (from Mixpanel, shared in Priya's Slack message)",
            "Competitor benchmark: Notion's onboarding has a ~22% drop-off at permission step",
            "User interview quote (from Priya's research): \"I didn't understand why the app needed access to my contacts\"",
          ],
        },
      ],
    },
  },
  {
    id: "inbox-5",
    type: "prep-summary",
    title: "Investor Call Prep — Sequoia",
    summary:
      "Rachel Kim's background, Sequoia's current thesis, and a suggested narrative for your Series A intro call.",
    status: "ready",
    eventId: "evt-10",
    eventTitle: "Investor Call — Series A",
    eventDate: d(6),
    createdAt: new Date().toISOString(),
    trigger: "High-stakes investor meeting detected — generated deep-prep brief from public data and your metrics",
    sources: ["Google Calendar", "Gmail (Marcus Chen's intro email)", "LinkedIn (Rachel Kim profile)", "Crunchbase"],
    generatedAgo: "1 day ago",
    confidence: "high",
    content: {
      sections: [
        {
          heading: "Investor Background",
          body: "Rachel Kim is a Partner at Sequoia Capital, where she focuses on early-stage consumer and productivity software. She led Notion's Series A ($10M, 2019) and was involved in Linear's seed round. She joined Sequoia from First Round Capital in 2021. She's known for favoring founders with strong product intuition and clear organic distribution strategies. Her LinkedIn shows she studied CS at Stanford and briefly worked as a PM at Dropbox before moving to VC.",
        },
        {
          heading: "Sequoia's Current Thesis",
          body: "Based on their recent investments and Rachel's public talks, Sequoia is actively looking for:",
          items: [
            "AI-native productivity tools — high conviction area, multiple recent bets",
            "Vertical SaaS with strong network effects and organic growth loops",
            "Consumer products that grow bottom-up without heavy paid acquisition",
            "Small founding teams (2–3 people) with deep technical capability",
            "Products that create a new category rather than competing in an existing one",
          ],
        },
        {
          heading: "Recommended Narrative Arc",
          body: "Structure your 30-minute call around this flow (based on what resonates with Rachel's investment style):",
          items: [
            "Open with the problem (2 min): People use 5+ apps to manage their day and still feel unprepared",
            "Introduce the insight (3 min): The calendar is the universal data layer — everyone has one, and it's the richest signal of what's coming next",
            "Demo the product (8 min): Show how Omni Cal proactively generates prep — the study guide, the meeting notes, the social brief",
            "Share traction (5 min): 18% MoM organic growth, zero paid acquisition, NPS of 58",
            "Paint the vision (5 min): From calendar assistant → personal AI chief of staff → the operating system for daily life",
            "Leave time for Q&A (7 min): Rachel typically asks deep product questions, not financial ones, in first calls",
          ],
        },
        {
          heading: "Things to Avoid",
          body: "Common missteps with Sequoia partners at the intro stage:",
          items: [
            "Don't compare directly to Google Calendar or Notion — position Omni Cal as a new category",
            "Don't lead with AI jargon (\"LLMs\", \"RAG\", \"embeddings\") — focus on user outcomes",
            "Don't volunteer specific revenue projections unless asked — it's too early and she'll discount them",
            "Don't badmouth competitors — Rachel invested in several productivity tools and it will feel off",
          ],
        },
        {
          heading: "Marcus's Intro Context",
          body: "Marcus met Rachel at the YC Winter Dinner on March 12. She asked about Omni Cal unprompted after Marcus described it casually. She said: \"That sounds like it could be a very big company.\" Marcus followed up via email and she responded within 2 hours to schedule this call. Signal is strong.",
        },
      ],
    },
  },
];

// ── Integrations ─────────────────────────────────────────
export const integrations: Integration[] = [
  {
    id: "int-1",
    name: "Google Calendar",
    description: "Sync your events, schedules, and availability in real time.",
    icon: "calendar",
    status: "connected",
    category: "calendar",
  },
  {
    id: "int-2",
    name: "Gmail",
    description: "Pull context from emails to prepare you for meetings and events.",
    icon: "mail",
    status: "connected",
    category: "email",
  },
  {
    id: "int-3",
    name: "Slack",
    description: "Surface relevant Slack threads and channel context before meetings.",
    icon: "hash",
    status: "disconnected",
    category: "messaging",
  },
  {
    id: "int-4",
    name: "Apple Calendar",
    description: "Import events from iCloud Calendar for unified scheduling.",
    icon: "apple",
    status: "disconnected",
    category: "calendar",
  },
  {
    id: "int-5",
    name: "WhatsApp",
    description: "Understand social context from recent conversations.",
    icon: "message-circle",
    status: "coming-soon",
    category: "messaging",
  },
  {
    id: "int-6",
    name: "GroupMe",
    description: "Pull group plans and social events into your calendar.",
    icon: "users",
    status: "coming-soon",
    category: "messaging",
  },
  {
    id: "int-7",
    name: "LinkedIn",
    description: "Enrich attendee profiles with professional background.",
    icon: "briefcase",
    status: "disconnected",
    category: "social",
  },
  {
    id: "int-8",
    name: "Notion",
    description: "Connect notes and docs for deeper meeting preparation.",
    icon: "file-text",
    status: "disconnected",
    category: "productivity",
  },
  {
    id: "int-9",
    name: "Outlook",
    description: "Sync Outlook calendar and email for full context.",
    icon: "mail",
    status: "coming-soon",
    category: "email",
  },
  {
    id: "int-10",
    name: "X (Twitter)",
    description: "Surface recent posts from people you are meeting with.",
    icon: "at-sign",
    status: "coming-soon",
    category: "social",
  },
];

// ── Helpers ──────────────────────────────────────────────
export function getEventsForDate(date: string): CalendarEvent[] {
  return events.filter((e) => e.date === date);
}

export function getInboxItem(id: string): InboxItem | undefined {
  return inboxItems.find((item) => item.id === id);
}

export function getEvent(id: string): CalendarEvent | undefined {
  return events.find((e) => e.id === id);
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

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
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

export function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split("T")[0];
}

export function categoryColor(category: CalendarEvent["category"]): string {
  const colors: Record<string, string> = {
    academic: "from-violet-500/20 to-violet-500/5 border-violet-400/30",
    work: "from-blue-500/20 to-blue-500/5 border-blue-400/30",
    social: "from-amber-500/20 to-amber-500/5 border-amber-400/30",
    personal: "from-emerald-500/20 to-emerald-500/5 border-emerald-400/30",
    health: "from-rose-500/20 to-rose-500/5 border-rose-400/30",
  };
  return colors[category] || colors.work;
}

export function categoryDot(category: CalendarEvent["category"]): string {
  const colors: Record<string, string> = {
    academic: "bg-violet-400",
    work: "bg-blue-400",
    social: "bg-amber-400",
    personal: "bg-emerald-400",
    health: "bg-rose-400",
  };
  return colors[category] || colors.work;
}

export function inboxTypeLabel(type: InboxItem["type"]): string {
  const labels: Record<string, string> = {
    "study-guide": "Study Guide",
    "meeting-notes": "Meeting Notes",
    "work-notes": "Work Notes",
    "social-brief": "Social Brief",
    "prep-summary": "Prep Summary",
  };
  return labels[type] || type;
}

export function inboxTypeIcon(type: InboxItem["type"]): string {
  const icons: Record<string, string> = {
    "study-guide": "graduation-cap",
    "meeting-notes": "message-square",
    "work-notes": "file-text",
    "social-brief": "users",
    "prep-summary": "sparkles",
  };
  return icons[type] || "file";
}

export function timeUntilEvent(eventDate: string): string {
  const now = new Date();
  const event = new Date(eventDate + "T00:00:00");
  const diffMs = event.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays < 0) return `${Math.abs(diffDays)}d ago`;
  return `in ${diffDays} days`;
}
