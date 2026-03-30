"use client";

import { UtensilsCrossed, GraduationCap, Presentation, Plane, Sun } from "lucide-react";
import { SectionReveal } from "@/components/section-reveal";
import { MorphingCardStack, type MorphCard } from "@/components/ui/morphing-card-stack";

const momentCards: MorphCard[] = [
  { id: "dinner", icon: <UtensilsCrossed className="size-5" />, title: "Dinner tonight", subtitle: "Social prep", description: "You know the time and place. Omni Cal fills in the rest — what your friends have been up to, shared context, and something worth mentioning.", prepItems: ["Sarah started at Stripe two weeks ago", "Marcus posted about his podcast launch", "Last group dinner: 3 months ago"] },
  { id: "exam", icon: <GraduationCap className="size-5" />, title: "Midterm tomorrow", subtitle: "Study intelligence", description: "Notes scattered across tabs, docs, and messages. Omni Cal identifies what matters most and builds a focused review plan before you start.", prepItems: ["Weak area: Stereochemistry (Ch. 9)", "45 practice problems remaining", "Suggested: 3-hour review block tonight"] },
  { id: "meeting", icon: <Presentation className="size-5" />, title: "Board review at 3", subtitle: "Work readiness", description: "Key talking points are still in your head. Omni Cal organizes them into structure before the room starts asking questions.", prepItems: ["Revenue up 24% QoQ — slides updated", "Headcount plan needs approval", "Prepare answer for burn rate question"] },
  { id: "travel", icon: <Plane className="size-5" />, title: "Flight next Tuesday", subtitle: "Travel prep", description: "Confirmation buried in your inbox. Omni Cal surfaces the useful details so you stop wondering about terminals.", prepItems: ["United UA 472 — Terminal C, Gate 24", "Seat 14A (window), boarding at 6:15 AM", "Hotel check-in after 3 PM"] },
  { id: "morning", icon: <Sun className="size-5" />, title: "Monday morning", subtitle: "Daily guidance", description: "Your week starts before coffee finishes. Omni Cal clarifies what matters today so you stop scanning five apps.", prepItems: ["3 meetings — all prepped", "Follow up: Jamie's onboarding email", "Focus block protected: 2–4 PM"] },
];

export function BeforeTheMoment() {
  return (
    <SectionReveal className="relative py-24 md:py-32 overflow-hidden">
      <div className="relative mx-auto max-w-6xl px-6">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-12 items-center">
          <div className="space-y-6 text-center lg:text-left">
            <p className="text-xs font-mono text-[#9c9e9b] tracking-widest uppercase">Before the moment</p>
            <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-[#1a1a1a] leading-[1.12]">
              The best moments start <span className="text-[#818380]">before they begin.</span>
            </h2>
            <p className="text-[#818380] text-base leading-relaxed max-w-lg mx-auto lg:mx-0">
              That quiet stress before something important — scattered notes, missing context, unfinished thoughts. Omni Cal dissolves it. Before the moment arrives, you already feel ready.
            </p>
            <div className="relative max-w-md mx-auto lg:mx-0 pt-4">
              <blockquote className="text-base text-[#4a4a4a] leading-relaxed italic">
                &ldquo;Preparation should feel invisible. That is what makes it powerful.&rdquo;
              </blockquote>
            </div>
          </div>
          <div>
            <MorphingCardStack cards={momentCards} />
          </div>
        </div>
      </div>
    </SectionReveal>
  );
}
