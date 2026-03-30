"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Calendar, Mail, Hash, MessageCircle, Users, FileText, FolderOpen, Check, Clock, Zap, Puzzle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type ConnectionStatus = "connected" | "disconnected" | "coming-soon";

interface IntegrationDef {
  id: string; name: string; description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: ConnectionStatus; category: string; connectUrl?: string;
}

const INTEGRATION_DEFAULTS: IntegrationDef[] = [
  { id: "google-calendar", name: "Google Calendar", description: "Sync your events, schedules, and availability in real time.", icon: Calendar, status: "disconnected", category: "calendar", connectUrl: "/api/integrations/google/connect" },
  { id: "gmail", name: "Gmail", description: "Pull context from emails to prepare you for meetings and events.", icon: Mail, status: "disconnected", category: "email", connectUrl: "/api/integrations/google/connect" },
  { id: "google-docs", name: "Google Docs", description: "Export AI-generated prep materials as real Google Docs.", icon: FileText, status: "disconnected", category: "productivity", connectUrl: "/api/integrations/google/connect" },
  { id: "google-drive", name: "Google Drive", description: "Store generated documents in a dedicated Omni Cal folder.", icon: FolderOpen, status: "disconnected", category: "productivity", connectUrl: "/api/integrations/google/connect" },
  { id: "slack", name: "Slack", description: "Surface relevant Slack threads and channel context before meetings.", icon: Hash, status: "disconnected", category: "messaging", connectUrl: "/api/integrations/slack/connect" },
  { id: "groupme", name: "GroupMe", description: "Pull group plans and social events into your calendar.", icon: Users, status: "coming-soon", category: "messaging" },
  { id: "whatsapp", name: "WhatsApp", description: "Understand social context from recent conversations.", icon: MessageCircle, status: "coming-soon", category: "messaging" },
];

function useIntegrationStatuses(): IntegrationDef[] {
  const [integrations, setIntegrations] = useState<IntegrationDef[]>(INTEGRATION_DEFAULTS);

  useEffect(() => {
    async function fetchStatuses() {
      try {
        const res = await fetch("/api/integrations/status");
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data.integrations)) return;

        const statusMap = new Map<string, ConnectionStatus>();
        for (const item of data.integrations) {
          statusMap.set(item.provider, item.status as ConnectionStatus);
        }

        setIntegrations((prev) =>
          prev.map((integration) => ({
            ...integration,
            status: statusMap.get(integration.id) ?? integration.status,
          }))
        );
      } catch {
        // Silent — keep defaults
      }
    }

    fetchStatuses();
  }, []);

  return integrations;
}

const statusConfig: Record<ConnectionStatus, { dot: string; label: string; labelClass: string }> = {
  connected: { dot: "bg-emerald-500", label: "Connected", labelClass: "text-emerald-600" },
  disconnected: { dot: "bg-[#d7d8d8]", label: "Not connected", labelClass: "text-[#9ca3af]" },
  "coming-soon": { dot: "bg-blue-300", label: "Coming soon", labelClass: "text-blue-500" },
};

function IntegrationCard({ integration, index }: { integration: IntegrationDef; index: number }) {
  const Icon = integration.icon;
  const status = statusConfig[integration.status];
  const isConnected = integration.status === "connected";
  const isComingSoon = integration.status === "coming-soon";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={cn("rounded-xl border border-black/[0.08] bg-white p-4 hover:border-black/[0.12] hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all", isComingSoon && "opacity-60")}
    >
      <div className="flex items-start gap-3.5">
        <div className={cn("size-10 rounded-xl flex items-center justify-center shrink-0 border",
          isConnected ? "bg-emerald-50 border-emerald-200" : "bg-[#f9fafb] border-black/[0.06]"
        )}>
          <Icon className={cn("size-[18px]", isConnected ? "text-emerald-500" : "text-[#9ca3af]")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-[14px] font-semibold text-[#1a1a1a] leading-tight">{integration.name}</h3>
            <div className="flex items-center gap-1.5">
              <div className={cn("size-[5px] rounded-full", status.dot, isConnected && "pulse-live")} />
              <span className={cn("text-[10px] font-medium", status.labelClass)}>{status.label}</span>
            </div>
          </div>
          <p className="text-[12px] text-[#818380] leading-relaxed mb-3">{integration.description}</p>
          {isConnected ? (
            <button className="h-7 px-3 rounded-lg text-[11px] font-medium border border-black/[0.08] text-[#818380] hover:text-[#1a1a1a] hover:bg-[#f9fafb] transition-all cursor-pointer inline-flex items-center gap-1.5">
              <Check className="size-3" /> Manage
            </button>
          ) : isComingSoon ? (
            <span className="h-7 px-3 rounded-lg text-[11px] font-medium border border-black/[0.04] bg-[#f9fafb] text-[#9ca3af] inline-flex items-center gap-1.5">
              <Clock className="size-3" /> Coming soon
            </span>
          ) : integration.connectUrl ? (
            <a href={integration.connectUrl} className="h-7 px-3 rounded-lg text-[11px] font-medium bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white transition-all cursor-pointer inline-flex items-center gap-1.5">
              <Zap className="size-3" /> Connect
            </a>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

export default function IntegrationsPage() {
  const INTEGRATIONS = useIntegrationStatuses();
  const connectedCount = INTEGRATIONS.filter(i => i.status === "connected").length;

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-[#1a1a1a] tracking-tight">Integrations</h1>
        <p className="text-[13px] text-[#818380] mt-0.5">
          Connect your tools so Omni Cal can prepare you automatically
          {connectedCount > 0 && <><span className="text-[#d7d8d8] mx-1.5">/</span><span className="text-emerald-600">{connectedCount} active</span></>}
        </p>
      </div>

      {connectedCount === 0 && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 mb-6">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <Puzzle className="size-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-[#1a1a1a] mb-0.5">Connect your first integration</p>
              <p className="text-[12px] text-[#818380] leading-relaxed">
                Start with Google Calendar to let Omni Cal see your schedule and begin generating prep materials.
              </p>
            </div>
            <a href="/api/integrations/google/connect" className="shrink-0 h-9 px-4 rounded-xl bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white text-[12px] font-medium transition-colors flex items-center gap-1.5">
              Connect Google <ArrowRight className="size-3" />
            </a>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {INTEGRATIONS.map((integration, i) => (
          <IntegrationCard key={integration.id} integration={integration} index={i} />
        ))}
      </div>
    </div>
  );
}
