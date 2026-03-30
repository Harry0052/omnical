"use client";

import { useState } from "react";
import { Inbox as InboxIcon, Sparkles, Calendar, Puzzle, ArrowRight, FileText, AlertTriangle, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useArtifacts } from "@/lib/pipeline/hooks";
import { PipelineDrawer } from "@/components/app/pipeline-drawer";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/lib/pipeline/types";

const artifactTypeLabels: Record<string, string> = {
  study_guide: "Study Guide",
  meeting_brief: "Meeting Brief",
  notes: "Notes",
  outline: "Outline",
  slide_content: "Slide Deck",
  checklist: "Checklist",
  action_summary: "Action Summary",
  research_brief: "Research Brief",
  generic_output: "AI Generated",
};

const artifactTypeColors: Record<string, { bg: string; text: string }> = {
  study_guide: { bg: "bg-violet-50", text: "text-violet-600" },
  meeting_brief: { bg: "bg-blue-50", text: "text-blue-600" },
  notes: { bg: "bg-emerald-50", text: "text-emerald-600" },
  slide_content: { bg: "bg-amber-50", text: "text-amber-600" },
  checklist: { bg: "bg-rose-50", text: "text-rose-600" },
  action_summary: { bg: "bg-blue-50", text: "text-blue-600" },
  research_brief: { bg: "bg-violet-50", text: "text-violet-600" },
  outline: { bg: "bg-emerald-50", text: "text-emerald-600" },
  generic_output: { bg: "bg-blue-50", text: "text-blue-600" },
};

function ArtifactCard({ artifact, onClick }: { artifact: Artifact; onClick: () => void }) {
  const colors = artifactTypeColors[artifact.type] ?? { bg: "bg-[#f0f0ef]", text: "text-[#818380]" };
  const isNew = Date.now() - new Date(artifact.createdAt).getTime() < 5 * 60 * 1000;

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-black/[0.06] bg-white hover:border-black/[0.1] hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-4 transition-all cursor-pointer group"
    >
      <div className="flex items-start gap-3">
        <div className={cn("size-9 rounded-lg flex items-center justify-center shrink-0", colors.bg)}>
          <FileText className={cn("size-4", colors.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-[13px] font-semibold text-[#1a1a1a] truncate group-hover:text-blue-600 transition-colors">
              {artifact.title}
            </h3>
            {isNew && !artifact.stale && (
              <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 uppercase tracking-wider shrink-0">
                New
              </span>
            )}
            {artifact.stale && (
              <span className="inline-flex items-center gap-1 text-[9px] font-medium text-amber-600 uppercase tracking-wider shrink-0">
                <AlertTriangle className="size-2.5" /> Stale
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#818380] line-clamp-2 leading-relaxed mb-2">{artifact.summary}</p>
          <div className="flex items-center gap-3 text-[10px] text-[#9ca3af]">
            <span className={cn("px-1.5 py-0.5 rounded font-medium", colors.bg, colors.text)}>
              {artifactTypeLabels[artifact.type] ?? artifact.type}
            </span>
            <span>{artifact.confidence} confidence</span>
            <span>{new Date(artifact.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            {artifact.documentUrl && (
              <a href={artifact.documentUrl} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-blue-500 hover:text-blue-600 flex items-center gap-0.5">
                Google Doc <ExternalLink className="size-2.5" />
              </a>
            )}
          </div>
        </div>
        <ArrowRight className="size-3.5 text-[#d7d8d8] group-hover:text-blue-500 transition-colors shrink-0 mt-1" />
      </div>
    </button>
  );
}

export default function InboxPage() {
  const { artifacts, isLoading, refetch } = useArtifacts(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

  function openArtifact(artifact: Artifact) {
    setSelectedArtifact(artifact);
    setDrawerOpen(true);
  }

  // Show empty state if no artifacts
  if (!isLoading && artifacts.length === 0) {
    return (
      <div className="p-6 lg:p-8 max-w-[860px] mx-auto">
        <div className="mb-6">
          <h1 className="text-[22px] font-semibold text-[#1a1a1a] tracking-tight">Inbox</h1>
          <p className="text-[13px] text-[#818380] mt-0.5">AI-generated prep for your upcoming events</p>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white p-8 text-center">
          <div className="size-14 mx-auto rounded-2xl bg-[#f0f0ef] flex items-center justify-center mb-5">
            <InboxIcon className="size-6 text-[#9ca3af]" />
          </div>
          <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-2">Your inbox is empty</h2>
          <p className="text-[13px] text-[#818380] leading-relaxed max-w-md mx-auto mb-6">
            When Omni Cal detects upcoming events on your calendar, it will automatically generate
            prep materials — study guides, meeting notes, social briefs, and more — and deliver them here.
          </p>

          <div className="rounded-xl border border-black/[0.06] bg-[#f9fafb] p-5 max-w-sm mx-auto text-left mb-6">
            <p className="text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider mb-3">To get started</p>
            <div className="space-y-2.5">
              {[
                { icon: Puzzle, title: "Connect Google Calendar", desc: "So Omni Cal can see your schedule" },
                { icon: Calendar, title: "Add events to your calendar", desc: "Manual or synced — both work" },
                { icon: Sparkles, title: "Omni Cal generates prep automatically", desc: "No prompts needed — it just works" },
              ].map((step) => (
                <div key={step.title} className="flex items-center gap-3">
                  <div className="size-7 rounded-lg bg-white border border-black/[0.06] flex items-center justify-center shrink-0">
                    <step.icon className="size-3.5 text-[#9ca3af]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-[#1a1a1a]">{step.title}</p>
                    <p className="text-[10px] text-[#9ca3af]">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <Link href="/app/integrations" className="h-9 px-4 rounded-xl text-[12px] font-medium bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white transition-colors flex items-center gap-1.5">
              Connect integrations <ArrowRight className="size-3" />
            </Link>
            <Link href="/app/calendar" className="h-9 px-4 rounded-xl text-[12px] font-medium border border-black/[0.08] text-[#818380] hover:text-[#1a1a1a] hover:bg-[#f9fafb] transition-colors flex items-center gap-1.5">
              Go to calendar
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[860px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-[#1a1a1a] tracking-tight">Inbox</h1>
          <p className="text-[13px] text-[#818380] mt-0.5">
            {artifacts.length} artifact{artifacts.length !== 1 ? "s" : ""} generated
          </p>
        </div>
        <button
          onClick={refetch}
          disabled={isLoading}
          className="size-8 rounded-lg border border-black/[0.08] flex items-center justify-center text-[#9ca3af] hover:text-[#1a1a1a] hover:bg-[#f0f0ef] transition-colors cursor-pointer"
          title="Refresh inbox"
        >
          <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
        </button>
      </div>

      <div className="space-y-2">
        {artifacts.map((artifact) => (
          <ArtifactCard key={artifact.id} artifact={artifact} onClick={() => openArtifact(artifact)} />
        ))}
      </div>

      <PipelineDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        runId={selectedArtifact?.pipelineRunId ?? null}
        artifacts={selectedArtifact ? [selectedArtifact] : undefined}
      />
    </div>
  );
}
