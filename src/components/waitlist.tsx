"use client";

import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MagneticButton } from "@/components/magnetic-button";
import { SectionReveal } from "@/components/section-reveal";

type FormState = "idle" | "submitting" | "success" | "error";

export function Waitlist() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("submitting");
    // TODO: Supabase insert
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setState("success");
    setEmail("");
  }

  return (
    <SectionReveal id="waitlist" className="relative py-28 md:py-36 overflow-hidden">
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#e9ebeb]/40 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute inset-0 bg-dot-grid opacity-15 pointer-events-none" />

      <div className="relative mx-auto max-w-2xl px-6 text-center">
        <div className="space-y-6">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#1a1a1a]">
            Ready to never <span className="text-gradient">underprepare</span> again?
          </h2>
          <p className="text-[#818380] text-lg max-w-lg mx-auto leading-relaxed">
            Join the waitlist for early access. Be among the first to experience a calendar that actually prepares you for life.
          </p>
        </div>

        <div className="mt-10">
          {state === "success" ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center justify-center gap-2.5 py-4">
              <CheckCircle2 className="size-5 text-[#2a2a2a]" />
              <span className="text-sm font-medium text-[#2a2a2a]">You are on the list. We will be in touch soon.</span>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={state === "submitting"}
                className="h-11 bg-white border-black/[0.08] text-[#1a1a1a] placeholder:text-[#c6c8c7] flex-1 focus:border-black/15 focus:ring-[#9c9e9b]/20" />
              <MagneticButton>
                <Button type="submit" disabled={state === "submitting"}
                  className="h-11 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white font-semibold gap-2 px-6 cursor-pointer w-full sm:w-auto">
                  {state === "submitting" ? <Loader2 className="size-4 animate-spin" /> : <><span>Join waitlist</span><ArrowRight className="size-4" /></>}
                </Button>
              </MagneticButton>
            </form>
          )}
          {state === "error" && <p className="text-sm text-red-500 mt-3">Something went wrong. Please try again.</p>}
          <p className="text-[9px] text-[#c6c8c7] mt-5 font-mono">No spam. Unsubscribe anytime.</p>
        </div>
      </div>
    </SectionReveal>
  );
}
