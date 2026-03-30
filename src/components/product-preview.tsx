"use client";

import { motion } from "framer-motion";
import { Calendar, FileText, BookOpen, MessageSquare, Brain, TrendingUp } from "lucide-react";
import { SectionReveal } from "@/components/section-reveal";
import { TiltCard } from "@/components/tilt-card";

function PreviewCard({ icon: Icon, label, title, lines, delay }: { icon: React.ComponentType<{ className?: string }>; label: string; title: string; lines: string[]; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ delay, duration: 0.5 }}>
      <TiltCard tiltDeg={4}>
        <div className="rounded-xl border border-[#e9ebeb]/[0.05] bg-[#0a0a0a]/60 p-5 space-y-3 h-full">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-lg bg-[#e9ebeb]/[0.04] flex items-center justify-center">
              <Icon className="size-3.5 text-[#9c9e9b]" />
            </div>
            <div>
              <p className="text-[9px] font-mono uppercase text-[#818380] tracking-wider">{label}</p>
              <p className="text-sm font-medium text-[#d7d8d8]">{title}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {lines.map((line, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="mt-1.5 size-1 rounded-full bg-[#818380]/50 shrink-0" />
                <p className="text-[11px] text-[#9c9e9b] leading-relaxed">{line}</p>
              </div>
            ))}
          </div>
        </div>
      </TiltCard>
    </motion.div>
  );
}

export function ProductPreview() {
  return (
    <SectionReveal id="preview" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-14 space-y-4">
          <p className="text-xs font-mono text-[#818380] tracking-widest uppercase">Product preview</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#e9ebeb]">Intelligence at a glance</h2>
          <p className="text-[#b2b4b2] max-w-xl mx-auto text-base leading-relaxed">
            A look at the AI-powered surfaces that keep you prepared throughout your day.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="lg:col-span-2">
            <TiltCard tiltDeg={3}>
              <div className="rounded-xl border border-[#e9ebeb]/[0.05] bg-[#0a0a0a]/60 p-6">
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="size-7 rounded-lg bg-[#e9ebeb]/[0.04] flex items-center justify-center">
                    <Calendar className="size-3.5 text-[#9c9e9b]" />
                  </div>
                  <div>
                    <p className="text-[9px] font-mono uppercase text-[#818380] tracking-wider">Daily feed</p>
                    <p className="text-sm font-medium text-[#d7d8d8]">Your morning briefing</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {[
                    { time: "9:00 AM", event: "Design review with Eng", note: "Review the Figma changes — 3 open comments" },
                    { time: "12:30 PM", event: "Lunch with Marcus", note: "He launched his podcast last week. Congrats might be a good opener." },
                    { time: "4:00 PM", event: "Investor update call", note: "MRR is up 18%. ARR projection updated in the deck." },
                  ].map((item, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
                      className="flex items-start gap-4 rounded-lg bg-[#e9ebeb]/[0.02] px-4 py-3">
                      <span className="text-[10px] font-mono text-[#818380] w-14 pt-0.5 shrink-0">{item.time}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#d7d8d8] truncate">{item.event}</p>
                        <p className="text-[11px] text-[#9c9e9b] mt-0.5">{item.note}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </TiltCard>
          </motion.div>

          <PreviewCard icon={Brain} label="Event Briefing" title="Q1 board meeting" delay={0.1} lines={["Revenue up 24% QoQ", "12 enterprise deals in pipeline", "Prepare burn rate answer"]} />
          <PreviewCard icon={BookOpen} label="Study Guide" title="Organic Chemistry" delay={0.15} lines={["Focus: Reaction mechanisms Ch. 8-12", "Weak area: Stereochemistry", "Suggested: 3hr review session"]} />
          <PreviewCard icon={FileText} label="Meeting Prep" title="Client onboarding" delay={0.2} lines={["Acme Corp, Series B, 80 employees", "Goal: Demo custom workflows", "Follow up on pricing question"]} />
          <PreviewCard icon={MessageSquare} label="Social Brief" title="Coffee with Priya" delay={0.25} lines={["Changed roles — now at Notion", "Posted about running a half marathon", "Last met: 4 months ago"]} />

          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3, duration: 0.5 }} className="lg:col-span-3">
            <div className="rounded-xl border border-[#e9ebeb]/[0.05] bg-[#0a0a0a]/60 p-6">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="size-7 rounded-lg bg-[#e9ebeb]/[0.04] flex items-center justify-center">
                  <TrendingUp className="size-3.5 text-[#9c9e9b]" />
                </div>
                <div>
                  <p className="text-[9px] font-mono uppercase text-[#818380] tracking-wider">Weekly insight</p>
                  <p className="text-sm font-medium text-[#d7d8d8]">Your preparation stats</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[{ value: "12", label: "Events prepped" }, { value: "3h", label: "Time saved" }, { value: "96%", label: "Prep coverage" }, { value: "8", label: "Insights surfaced" }].map((stat) => (
                  <div key={stat.label} className="text-center py-3">
                    <p className="text-2xl font-bold text-gradient">{stat.value}</p>
                    <p className="text-[11px] text-[#9c9e9b] mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </SectionReveal>
  );
}
