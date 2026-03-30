"use client";

import { use } from "react";
import { ArrowLeft, Inbox } from "lucide-react";
import Link from "next/link";

export default function InboxDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  void id;

  return (
    <div className="p-6 lg:p-8 max-w-[760px] mx-auto">
      <Link href="/app/inbox" className="inline-flex items-center gap-2 text-[13px] text-[#818380] hover:text-[#1a1a1a] transition-colors mb-6 group">
        <ArrowLeft className="size-3.5 group-hover:-translate-x-0.5 transition-transform" /> Back to Inbox
      </Link>
      <div className="rounded-2xl border border-black/[0.08] bg-white p-8 text-center">
        <div className="size-12 mx-auto rounded-xl bg-[#f0f0ef] flex items-center justify-center mb-4">
          <Inbox className="size-5 text-[#9ca3af]" />
        </div>
        <h2 className="text-[15px] font-semibold text-[#1a1a1a] mb-1">Item not found</h2>
        <p className="text-[12px] text-[#818380]">This inbox item doesn&apos;t exist or hasn&apos;t been generated yet.</p>
      </div>
    </div>
  );
}
