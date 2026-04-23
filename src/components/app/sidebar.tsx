"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Inbox, Puzzle, Settings, LogOut, Activity, Brain, CheckSquare, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Calendar", href: "/app/calendar", icon: Calendar },
  { label: "Inbox", href: "/app/inbox", icon: Inbox },
  { label: "Tasks", href: "/app/tasks", icon: CheckSquare },
  { label: "Email Triage", href: "/app/triage", icon: Brain },
  { label: "Status", href: "/app/status", icon: Activity },
  { label: "Integrations", href: "/app/integrations", icon: Puzzle },
];

function NavLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-200",
        active
          ? "bg-blue-50 text-blue-600 border border-blue-200/60"
          : "text-[#6b7280] hover:text-[#1a1a1a] hover:bg-black/[0.03]"
      )}
    >
      <Icon
        className={cn(
          "size-[17px] transition-colors",
          active ? "text-blue-500" : "text-[#9ca3af] group-hover:text-[#6b7280]"
        )}
      />
      {label}
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[240px] bg-white border-r border-[#e5e7eb] flex flex-col z-40">
      {/* Logo — matches landing page navbar */}
      <div className="px-5 h-[60px] flex items-center gap-2.5">
        <div className="size-7 rounded-lg border border-black/10 flex items-center justify-center">
          <div className="size-2.5 rounded-sm bg-[#1a1a1a]" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-[#1a1a1a]">
          Omni Cal
        </span>
      </div>

      <div className="mx-4 h-px bg-[#e5e7eb]" />

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            active={pathname.startsWith(item.href)}
          />
        ))}
      </nav>

      <div className="px-3 pb-3">
        <div className="mx-1 mb-3 h-px bg-[#e5e7eb]" />

        <NavLink
          href="/app/settings"
          icon={Settings}
          label="Settings"
          active={pathname.startsWith("/app/settings")}
        />

        <div className="mt-3 mx-0.5 p-2.5 rounded-xl border border-black/[0.06] bg-[#f9fafb] flex items-center gap-3">
          <div className="size-8 rounded-full bg-[#e9ebeb] border border-black/[0.06] flex items-center justify-center">
            <span className="text-[11px] font-semibold text-[#818380]">U</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-[#1a1a1a] truncate leading-tight">User</p>
            <p className="text-[10px] text-[#9ca3af] truncate leading-tight mt-0.5">Early Access</p>
          </div>
          <button className="size-7 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-[#6b7280] hover:bg-black/[0.04] transition-colors cursor-pointer">
            <LogOut className="size-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
