"use client";

import { motion } from "framer-motion";
import { UtensilsCrossed, GraduationCap, Users, Plane, Bell } from "lucide-react";
import { SectionReveal } from "@/components/section-reveal";
import { DisplayCards, type DisplayCard } from "@/components/ui/display-cards";

const fragmentCards: DisplayCard[] = [
  {
    icon: <UtensilsCrossed className="size-4 text-[#818380]" />,
    title: "Dinner at 7:30",
    description: "You know when. Not what to say. No idea what Sarah has been up to.",
    meta: "Tonight",
  },
  {
    icon: <GraduationCap className="size-4 text-[#818380]" />,
    title: "Midterm — Friday",
    description: "Study materials scattered across tabs, docs, and three messaging threads.",
    meta: "3 days",
  },
  {
    icon: <Users className="size-4 text-[#818380]" />,
    title: "Product review",
    description: "Key talking points still live in your head. No one has shared an agenda.",
    meta: "Monday",
  },
  {
    icon: <Plane className="size-4 text-[#818380]" />,
    title: "Flight to NYC",
    description: "Confirmation buried somewhere in your inbox. Seat, terminal — unknown.",
    meta: "Next week",
  },
  {
    icon: <Bell className="size-4 text-[#818380]" />,
    title: "Reminder: 10 min",
    description: "Your calendar tells you when. Never how to prepare.",
    meta: "Recurring",
  },
];

const painPoints = [
  "Calendars track time — they do not understand context.",
  "Important details live across email, messages, docs, and memory.",
  "Reminders tell you when. Nothing tells you how to be ready.",
];

export function WhyItMatters() {
  return (
    <SectionReveal className="relative py-24 md:py-32 overflow-hidden">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <div className="space-y-8">
            <div className="space-y-5">
              <p className="text-xs font-mono text-[#9c9e9b] tracking-widest uppercase">
                The problem
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1a1a1a] leading-[1.12]">
                Your schedule tells you where to be.
                <br />
                <span className="text-[#818380]">It does not help you be ready.</span>
              </h2>
              <p className="text-[#818380] text-base leading-relaxed max-w-lg">
                People do not struggle because they lack a calendar. They struggle because everything important lives in separate places, and nothing prepares them before the moment arrives.
              </p>
            </div>

            <div className="space-y-3">
              {painPoints.map((point, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: 0.3 + i * 0.08, duration: 0.5 }}
                  className="flex items-start gap-3"
                >
                  <div className="mt-2 size-1 rounded-full bg-[#b2b4b2] shrink-0" />
                  <p className="text-sm text-[#818380] leading-relaxed">{point}</p>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="relative flex items-center justify-center lg:justify-end">
            <DisplayCards cards={fragmentCards} />
          </div>
        </div>
      </div>
    </SectionReveal>
  );
}
