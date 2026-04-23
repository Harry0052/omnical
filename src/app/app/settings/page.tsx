"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Shield, Bell, Trash2, ChevronRight, Globe, Key, Mail, AlertTriangle, Camera, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePipelineSettings } from "@/lib/pipeline/hooks";

type SettingsTab = "profile" | "account" | "notifications" | "pipeline" | "danger";

const tabs: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "account", label: "Account", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "pipeline", label: "AI Pipeline", icon: Sparkles },
  { id: "danger", label: "Delete Account", icon: Trash2 },
];

const inputClass = "w-full h-10 px-3.5 rounded-xl text-[13px] text-[#1a1a1a] bg-white border border-black/[0.1] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder:text-[#c6c8c7]";

function SettingsField({ label, value, type = "text", disabled = false }: { label: string; value: string; type?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-[#9ca3af] mb-1.5 uppercase tracking-wider">{label}</label>
      <input type={type} defaultValue={value} disabled={disabled} className={cn(inputClass, disabled && "opacity-40 cursor-not-allowed bg-[#f9fafb]")} />
    </div>
  );
}

function Toggle({ label, description, defaultOn = false, onChange }: { label: string; description: string; defaultOn?: boolean; onChange?: (on: boolean) => void }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center justify-between py-3.5">
      <div className="pr-4">
        <p className="text-[13px] font-medium text-[#1a1a1a] leading-tight">{label}</p>
        <p className="text-[11px] text-[#9ca3af] mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button onClick={() => { setOn(!on); onChange?.(!on); }} className={cn(
        "w-10 h-[22px] rounded-full transition-all cursor-pointer relative shrink-0 border",
        on ? "bg-blue-500 border-blue-500" : "bg-[#e9ebeb] border-[#d7d8d8]"
      )}>
        <div className={cn("absolute top-[2px] size-4 rounded-full transition-all duration-200 bg-white shadow-sm",
          on ? "left-[22px]" : "left-[2px]"
        )} />
      </button>
    </div>
  );
}

function SettingsRow({ label, desc }: { label: string; desc: string }) {
  return (
    <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[#f9fafb] transition-all text-left cursor-pointer group">
      <div>
        <p className="text-[13px] font-medium text-[#1a1a1a]">{label}</p>
        <p className="text-[11px] text-[#9ca3af] mt-0.5">{desc}</p>
      </div>
      <ChevronRight className="size-3.5 text-[#d7d8d8] group-hover:text-[#818380] transition-colors" />
    </button>
  );
}

function ProfileSection() {
  return (
    <motion.div key="profile" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
      <div className="rounded-xl border border-black/[0.08] bg-white p-5">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative group">
            <div className="size-14 rounded-2xl bg-[#f0f0ef] border border-black/[0.08] flex items-center justify-center">
              <span className="text-lg font-semibold text-[#818380]">U</span>
            </div>
            <button className="absolute -bottom-1 -right-1 size-6 rounded-full bg-white border border-black/[0.08] flex items-center justify-center hover:bg-[#f9fafb] transition-colors cursor-pointer shadow-sm">
              <Camera className="size-3 text-[#818380]" />
            </button>
          </div>
          <div>
            <h3 className="text-[16px] font-semibold text-[#1a1a1a]">Your Profile</h3>
            <p className="text-[12px] text-[#9ca3af]">Early Access</p>
          </div>
        </div>
        <div className="space-y-3.5">
          <SettingsField label="Full Name" value="" />
          <SettingsField label="Email" value="" type="email" />
          <SettingsField label="Timezone" value="" disabled />
        </div>
        <div className="mt-5 pt-4 border-t border-black/[0.06]">
          <button className="h-9 px-4 rounded-xl text-[12px] font-medium bg-[#1a1a1a] text-white hover:bg-[#2a2a2a] transition-all cursor-pointer">Save Changes</button>
        </div>
      </div>
    </motion.div>
  );
}

function AccountSection() {
  return (
    <motion.div key="account" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="space-y-3">
      <div className="rounded-xl border border-black/[0.08] bg-white p-5">
        <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-3 flex items-center gap-2"><Key className="size-3.5 text-[#9ca3af]" />Security</h3>
        <div className="space-y-0.5">
          <SettingsRow label="Change Password" desc="Update your account password" />
          <SettingsRow label="Two-Factor Authentication" desc="Not enabled" />
          <SettingsRow label="Active Sessions" desc="1 active session" />
        </div>
      </div>
      <div className="rounded-xl border border-black/[0.08] bg-white p-5">
        <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-3 flex items-center gap-2"><Globe className="size-3.5 text-[#9ca3af]" />Preferences</h3>
        <div className="space-y-0.5">
          <SettingsRow label="Language" desc="English (US)" />
          <SettingsRow label="Date Format" desc="MM/DD/YYYY" />
          <SettingsRow label="First Day of Week" desc="Sunday" />
        </div>
      </div>
    </motion.div>
  );
}

function NotificationsSection() {
  return (
    <motion.div key="notifications" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="space-y-3">
      <div className="rounded-xl border border-black/[0.08] bg-white p-5">
        <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-1 flex items-center gap-2"><Mail className="size-3.5 text-[#9ca3af]" />Email Notifications</h3>
        <p className="text-[11px] text-[#9ca3af] mb-3">Choose what Omni Cal sends to your email.</p>
        <div className="divide-y divide-black/[0.04]">
          <Toggle label="AI Prep Ready" description="When a study guide, brief, or prep doc is generated" defaultOn />
          <Toggle label="Daily Digest" description="A morning summary of your day ahead" defaultOn />
          <Toggle label="Weekly Summary" description="Weekly recap of events and AI activity" defaultOn={false} />
          <Toggle label="Integration Alerts" description="When an integration disconnects or needs attention" defaultOn />
        </div>
      </div>
      <div className="rounded-xl border border-black/[0.08] bg-white p-5">
        <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-1 flex items-center gap-2"><Bell className="size-3.5 text-[#9ca3af]" />Push Notifications</h3>
        <p className="text-[11px] text-[#9ca3af] mb-3">Control in-app and browser notifications.</p>
        <div className="divide-y divide-black/[0.04]">
          <Toggle label="Event Reminders" description="15 minutes before each event" defaultOn />
          <Toggle label="Prep Available" description="When AI prep is ready for an upcoming event" defaultOn />
          <Toggle label="Schedule Changes" description="When events are added, moved, or cancelled" defaultOn={false} />
        </div>
      </div>
    </motion.div>
  );
}

function PipelineSection() {
  const { settings, updateSettings } = usePipelineSettings();

  if (!settings) {
    return (
      <motion.div key="pipeline" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
        <div className="rounded-xl border border-black/[0.08] bg-white p-5 text-center py-8">
          <p className="text-[12px] text-[#818380]">Loading settings...</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div key="pipeline" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="space-y-3">
      <div className="rounded-xl border border-black/[0.08] bg-white p-5">
        <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-1 flex items-center gap-2">
          <Sparkles className="size-3.5 text-blue-500" />AI Pipeline
        </h3>
        <p className="text-[11px] text-[#9ca3af] mb-3">Control how Omni Cal analyzes your events.</p>
        <div className="divide-y divide-black/[0.04]">
          <Toggle
            label="Enable AI Pipeline"
            description="Automatically analyze events and generate prep materials"
            defaultOn={settings.enabled}
            onChange={(on) => updateSettings({ enabled: on })}
          />
          <Toggle
            label="Require approval before executing"
            description="Ask before running action plans on your events"
            defaultOn={settings.approvalMode === "approve_all"}
            onChange={(on) => updateSettings({ approvalMode: on ? "approve_all" : "auto" })}
          />
        </div>
      </div>
      <div className="rounded-xl border border-black/[0.08] bg-white p-5">
        <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-1">Rate Limits</h3>
        <p className="text-[11px] text-[#9ca3af] mb-3">Maximum pipeline runs to prevent excessive API usage.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-[#9ca3af] mb-1 uppercase tracking-wider">Per Hour</label>
            <p className="text-[14px] font-semibold text-[#1a1a1a]">{settings.rateLimits.maxRunsPerHour}</p>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#9ca3af] mb-1 uppercase tracking-wider">Per Day</label>
            <p className="text-[14px] font-semibold text-[#1a1a1a]">{settings.rateLimits.maxRunsPerDay}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function DangerSection() {
  return (
    <motion.div key="danger" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
      <div className="rounded-xl p-5 border border-red-200 bg-red-50/50">
        <div className="flex items-start gap-4">
          <div className="size-10 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center shrink-0">
            <AlertTriangle className="size-4 text-red-500" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-red-700 mb-1">Delete Account</h3>
            <p className="text-[13px] text-[#818380] leading-relaxed mb-4">
              Permanently delete your Omni Cal account and all associated data. This action cannot be undone.
            </p>
            <button className="h-9 px-4 rounded-xl text-[12px] font-medium bg-red-500 text-white hover:bg-red-600 transition-all cursor-pointer">
              Delete My Account
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  return (
    <div className="p-6 lg:p-8 max-w-[860px] mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-[#1a1a1a] tracking-tight">Settings</h1>
        <p className="text-[13px] text-[#818380] mt-0.5">Manage your account and preferences</p>
      </div>

      <div className="flex gap-6">
        <div className="w-44 shrink-0">
          <nav className="space-y-0.5 sticky top-8">
            {tabs.map((tab) => {
              const isDanger = tab.id === "danger";
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all text-left cursor-pointer",
                  active
                    ? isDanger ? "bg-red-50 text-red-600 border border-red-200" : "bg-blue-50 text-blue-600 border border-blue-200/60"
                    : isDanger ? "text-red-400 hover:text-red-600 hover:bg-red-50/50" : "text-[#818380] hover:text-[#1a1a1a] hover:bg-[#f9fafb]"
                )}>
                  <tab.icon className="size-3.5" />{tab.label}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="w-px bg-[#e5e7eb] shrink-0" />
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {activeTab === "profile" && <ProfileSection />}
            {activeTab === "account" && <AccountSection />}
            {activeTab === "notifications" && <NotificationsSection />}
            {activeTab === "pipeline" && <PipelineSection />}
            {activeTab === "danger" && <DangerSection />}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
