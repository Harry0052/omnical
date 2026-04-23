"use client";

import { useState, useEffect, useCallback } from "react";
import { Mail, RefreshCw, Archive, ListChecks, AlertTriangle, Sparkles, Tag, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmailClassification, CleanupCandidate, ContextEngineSettings } from "@/lib/context-engine/types";

const tierConfig = {
  high: { label: "Important", accent: "bg-blue-50 text-blue-600", dot: "bg-blue-500" },
  mid: { label: "Reference", accent: "bg-amber-50 text-amber-600", dot: "bg-amber-500" },
  low: { label: "Low Priority", accent: "bg-gray-100 text-gray-500", dot: "bg-gray-400" },
  noise: { label: "Noise", accent: "bg-red-50 text-red-500", dot: "bg-red-400" },
} as const;

function EmailCard({ email }: { email: EmailClassification }) {
  const tier = tierConfig[email.valueTier];
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-4 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-[13px] font-semibold text-[#1a1a1a] truncate">{email.subject}</h3>
        <span className="text-[10px] text-[#9ca3af] whitespace-nowrap">
          {new Date(email.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </div>
      <p className="text-[11px] text-[#818380] mb-1">From: {email.from}</p>
      <p className="text-[11px] text-[#818380] line-clamp-2 leading-relaxed mb-3">{email.summary}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {email.categories.map((cat) => (
          <span key={cat} className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-[#f0f0ef] text-[#818380]">
            <Tag className="size-2.5" /> {cat.replace("_", " ")}
          </span>
        ))}
        <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded", tier.accent)}>
          {email.recommendedAction.replace("_", " ")}
        </span>
        {email.isProtected && (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded bg-violet-50 text-violet-600">
            <Shield className="size-2.5" /> Protected
          </span>
        )}
        <span className="text-[9px] text-[#9ca3af] ml-auto">{Math.round(email.confidence * 100)}% conf.</span>
      </div>
    </div>
  );
}

export default function TriagePage() {
  const [classifications, setClassifications] = useState<EmailClassification[]>([]);
  const [cleanup, setCleanup] = useState<CleanupCandidate[]>([]);
  const [settings, setSettings] = useState<ContextEngineSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [triaging, setTriaging] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, cleanupRes] = await Promise.all([
        fetch("/api/context-engine/settings"),
        fetch("/api/context-engine/cleanup"),
      ]);
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (cleanupRes.ok) {
        const data = await cleanupRes.json();
        setCleanup(Array.isArray(data) ? data : data.candidates ?? []);
      }
    } catch { /* silently fail */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function runTriage() {
    setTriaging(true);
    try {
      const res = await fetch("/api/context-engine/triage", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setClassifications(Array.isArray(data) ? data : data.classifications ?? []);
      }
    } catch { /* silently fail */ }
    setTriaging(false);
  }

  const grouped = {
    high: classifications.filter((e) => e.valueTier === "high"),
    mid: classifications.filter((e) => e.valueTier === "mid"),
    low: classifications.filter((e) => e.valueTier === "low"),
    noise: classifications.filter((e) => e.valueTier === "noise"),
  };

  const hasResults = classifications.length > 0;

  return (
    <div className="p-6 lg:p-8 max-w-[860px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-[#1a1a1a] tracking-tight">Email Triage</h1>
          <p className="text-[13px] text-[#818380] mt-0.5">Your inbox, organized by importance</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} disabled={loading}
            className="size-8 rounded-lg border border-black/[0.08] flex items-center justify-center text-[#9ca3af] hover:text-[#1a1a1a] hover:bg-[#f0f0ef] transition-colors cursor-pointer"
            title="Refresh">
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </button>
          <button onClick={runTriage} disabled={triaging}
            className="h-9 px-4 rounded-xl text-[12px] font-medium bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
            <Sparkles className={cn("size-3.5", triaging && "animate-pulse")} />
            {triaging ? "Triaging…" : "Triage Inbox"}
          </button>
        </div>
      </div>

      {/* Warning if triage disabled */}
      {settings && !settings.emailTriageEnabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-medium text-amber-800">Email triage is disabled</p>
            <p className="text-[11px] text-amber-600 mt-0.5">Enable it in Settings &gt; Context Engine to use automatic classification.</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasResults && !triaging && (
        <div className="rounded-2xl border border-black/[0.08] bg-white p-8 text-center">
          <div className="size-14 mx-auto rounded-2xl bg-[#f0f0ef] flex items-center justify-center mb-5">
            <Mail className="size-6 text-[#9ca3af]" />
          </div>
          <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-2">No classifications yet</h2>
          <p className="text-[13px] text-[#818380] leading-relaxed max-w-md mx-auto">
            Click <strong>Triage Inbox</strong> to classify your recent emails by importance. Omni Cal will sort them into tiers so you can focus on what matters.
          </p>
        </div>
      )}

      {/* Classified emails by tier */}
      {hasResults && (
        <div className="space-y-6">
          {(["high", "mid", "low", "noise"] as const).map((tier) => {
            const emails = grouped[tier];
            if (emails.length === 0) return null;
            const cfg = tierConfig[tier];
            return (
              <section key={tier}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={cn("size-2 rounded-full", cfg.dot)} />
                  <h2 className="text-[14px] font-semibold text-[#1a1a1a]">{cfg.label}</h2>
                  <span className="text-[11px] text-[#9ca3af]">{emails.length}</span>
                </div>
                <div className="space-y-2">
                  {emails.map((email) => <EmailCard key={email.id} email={email} />)}
                </div>
              </section>
            );
          })}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <button className="h-9 px-4 rounded-xl text-[12px] font-medium border border-black/[0.08] text-[#818380] hover:text-[#1a1a1a] hover:bg-[#f9fafb] transition-colors flex items-center gap-1.5 cursor-pointer">
              <Archive className="size-3.5" /> Archive Noise
            </button>
            <button className="h-9 px-4 rounded-xl text-[12px] font-medium border border-black/[0.08] text-[#818380] hover:text-[#1a1a1a] hover:bg-[#f9fafb] transition-colors flex items-center gap-1.5 cursor-pointer">
              <ListChecks className="size-3.5" /> Review Queue
            </button>
          </div>
        </div>
      )}

      {/* Cleanup candidates */}
      {cleanup.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <Archive className="size-4 text-[#9ca3af]" />
            <h2 className="text-[14px] font-semibold text-[#1a1a1a]">Cleanup Candidates</h2>
            <span className="text-[11px] text-[#9ca3af]">{cleanup.length}</span>
          </div>
          <div className="space-y-2">
            {cleanup.map((c) => (
              <div key={c.id} className="rounded-xl border border-black/[0.06] bg-[#f9fafb] p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-[#1a1a1a] truncate">{c.subject}</p>
                  <p className="text-[10px] text-[#9ca3af]">{c.from} &middot; {c.reason}</p>
                </div>
                <span className={cn("text-[9px] font-medium px-2 py-0.5 rounded shrink-0",
                  c.action === "trash" ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-500"
                )}>{c.action}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
