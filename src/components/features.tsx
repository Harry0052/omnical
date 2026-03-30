"use client";

import { Link2, Brain, Users, GraduationCap, Presentation, CalendarClock, Rss } from "lucide-react";
import { SectionReveal } from "@/components/section-reveal";
import { RadialOrbit, type OrbitNode } from "@/components/ui/radial-orbit";

const featureNodes: OrbitNode[] = [
  { id: "connect", icon: <Link2 className="size-5" />, label: "Signal Capture", title: "Signal Capture", description: "Pulls signals from the tools you already live in — Gmail, calendars, Slack, messages. One connection, unified awareness.", relatedIds: ["understand"] },
  { id: "understand", icon: <Brain className="size-5" />, label: "Event Intelligence", title: "Event Intelligence", description: "Detects what matters before the moment arrives. Understands context, urgency, and what kind of preparation is needed.", relatedIds: ["connect", "social", "study", "meeting"] },
  { id: "social", icon: <Users className="size-5" />, label: "Social Prep", title: "Social Briefings", description: "Turns upcoming social plans into useful context — recent updates, shared history, conversation starters. Walk in informed.", relatedIds: ["understand", "feed"] },
  { id: "study", icon: <GraduationCap className="size-5" />, label: "Study Prep", title: "Exam Intelligence", description: "Identifies what to study based on your schedule, builds focused guides, and suggests review blocks before deadlines hit.", relatedIds: ["understand", "schedule"] },
  { id: "meeting", icon: <Presentation className="size-5" />, label: "Meeting Prep", title: "Work Readiness", description: "Organizes talking points, agenda context, and relevant notes before work meetings. No more scrambling five minutes before.", relatedIds: ["understand", "feed"] },
  { id: "schedule", icon: <CalendarClock className="size-5" />, label: "Smart Scheduling", title: "Smart Scheduling", description: "AI-assisted time blocking that protects focus, adapts to priorities, and optimizes your day around what actually matters.", relatedIds: ["study", "feed"] },
  { id: "feed", icon: <Rss className="size-5" />, label: "Assistant Feed", title: "Daily Guidance", description: "Surfaces the next helpful action without needing a prompt — reminders, prep notes, suggestions, and follow-ups.", relatedIds: ["social", "meeting", "schedule"] },
];

export function Features() {
  return (
    <SectionReveal id="features" className="relative py-24 md:py-32">
      <div className="relative mx-auto max-w-6xl px-6">
        {/* Mobile/tablet: stacked. Desktop: side-by-side */}
        <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-12 lg:gap-16 items-start">
          {/* Left column — section copy */}
          <div className="space-y-5 lg:pt-16">
            <p className="text-xs font-mono text-[#9c9e9b] tracking-widest uppercase">
              The system
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1a1a1a] leading-[1.12]">
              One assistant.
              <br />
              <span className="text-[#818380]">Every form of readiness.</span>
            </h2>
            <p className="text-[#818380] text-base leading-relaxed max-w-md">
              Omni Cal is not a list of features. It is a connected intelligence
              system — click any node to explore how the pieces work together.
            </p>
            <div className="hidden lg:block pt-4 space-y-2.5">
              {featureNodes.map((node) => (
                <div key={node.id} className="flex items-center gap-2.5">
                  <div className="size-1.5 rounded-full bg-[#d7d8d8]" />
                  <span className="text-sm text-[#9c9e9b]">{node.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right column — orbital visualization */}
          <div>
            <RadialOrbit nodes={featureNodes} />
          </div>
        </div>
      </div>
    </SectionReveal>
  );
}
