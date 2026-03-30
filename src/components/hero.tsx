"use client";

import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, Brain, Sparkles, GraduationCap, Users, Zap } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MagneticButton } from "@/components/magnetic-button";

function FloatingCard({
  icon: Icon,
  label,
  title,
  detail,
  className,
  delay,
  z,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  title: string;
  detail: string;
  className?: string;
  delay: number;
  z: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, duration: 0.9, ease: [0.25, 0.4, 0.25, 1] }}
      className={cn("absolute rounded-xl border border-black/[0.06] bg-white/80 backdrop-blur-sm p-4 w-52 pointer-events-none shadow-[0_2px_12px_rgba(0,0,0,0.04)]", className)}
      style={{ transform: `translateZ(${z}px)` }}
    >
      <motion.div
        animate={{ y: [-3, 3, -3] }}
        transition={{ duration: 5 + delay, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="size-5 rounded-md bg-[#e9ebeb] flex items-center justify-center">
            <Icon className="size-3 text-[#818380]" />
          </div>
          <span className="text-[9px] font-mono uppercase text-[#9c9e9b] tracking-wider">
            {label}
          </span>
        </div>
        <p className="text-[12px] font-medium text-[#2a2a2a] mb-1">{title}</p>
        <p className="text-[10px] text-[#818380] leading-relaxed">{detail}</p>
      </motion.div>
    </motion.div>
  );
}

function HeroScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      mouseRef.current = {
        x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
        y: ((e.clientY - rect.top) / rect.height - 0.5) * 2,
      };
    };

    const animate = () => {
      currentRef.current.x += (mouseRef.current.x - currentRef.current.x) * 0.06;
      currentRef.current.y += (mouseRef.current.y - currentRef.current.y) * 0.06;
      if (containerRef.current) {
        const rx = currentRef.current.y * -3;
        const ry = currentRef.current.x * 5;
        containerRef.current.style.transform = `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="relative w-full max-w-2xl mx-auto h-[320px] sm:h-[360px]">
      <div
        ref={containerRef}
        className="relative w-full h-full"
        style={{ transformStyle: "preserve-3d", willChange: "transform" }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.8, ease: [0.25, 0.4, 0.25, 1] }}
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto w-72 sm:w-80 rounded-2xl border border-black/[0.06] bg-white/80 backdrop-blur-sm p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="size-3.5 text-[#9c9e9b]" />
              <span className="text-[10px] font-mono text-[#9c9e9b] tracking-wide uppercase">Today</span>
            </div>
            <div className="flex items-center gap-1.5">
              <motion.div
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: 2.5, repeat: Infinity }}
                className="size-1.5 rounded-full bg-[#818380]"
              />
              <span className="text-[9px] font-mono text-[#9c9e9b]">Active</span>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { time: "10:00", title: "Team standup", status: "Prepped" },
              { time: "1:00", title: "Lunch with Sarah", status: "Brief ready" },
              { time: "3:30", title: "Q1 Presentation", status: "Notes ready" },
            ].map((ev, i) => (
              <motion.div
                key={ev.title}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.15, duration: 0.5 }}
                className="flex items-center gap-3 rounded-lg bg-black/[0.02] px-3 py-2"
              >
                <span className="text-[10px] font-mono text-[#9c9e9b] w-10 shrink-0">{ev.time}</span>
                <span className="text-[12px] text-[#2a2a2a] flex-1 truncate">{ev.title}</span>
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full text-[#818380] bg-[#e9ebeb]">
                  {ev.status}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <FloatingCard icon={Brain} label="AI Prep" title="Lunch with Sarah" detail="She just started at Stripe. Posted about her Tokyo trip last week." className="top-2 -right-2 sm:top-4 sm:-right-8" delay={1.0} z={60} />
        <FloatingCard icon={GraduationCap} label="Study Guide" title="Organic Chem Final" detail="Focus: Reaction mechanisms Ch. 8–12. 3hr review suggested." className="-bottom-2 -left-2 sm:bottom-2 sm:-left-8" delay={1.2} z={40} />
        <FloatingCard icon={Users} label="Social Brief" title="Dinner with Alex" detail="Recently promoted to VP. Mutual interest: trail running." className="top-0 -left-4 sm:-top-2 sm:-left-12 hidden sm:block" delay={1.4} z={80} />
      </div>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#e9ebeb]/40 rounded-full blur-[120px] pointer-events-none" />
    </div>
  );
}

export function Hero() {
  const words = "The calendar that prepares you for life".split(" ");

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      <div className="absolute inset-0 bg-dot-grid opacity-30" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(233,235,235,0.3)_0%,_transparent_70%)]" />

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-20 md:py-28">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex justify-center mb-8"
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-white/60 border border-black/[0.06] px-4 py-1.5 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
            <Sparkles className="size-3 text-[#9c9e9b]" />
            <span className="text-xs font-medium text-[#818380]">Prompt-less AI assistant</span>
          </div>
        </motion.div>

        <h1 className="text-center text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] mb-6 max-w-4xl mx-auto">
          {words.map((word, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.15 + i * 0.06, duration: 0.7, ease: [0.25, 0.4, 0.25, 1] }}
              className={cn(
                "inline-block mr-[0.3em]",
                i >= 3 && i <= 4 ? "text-gradient" : "text-[#1a1a1a]"
              )}
            >
              {word}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.7 }}
          className="text-center text-lg sm:text-xl text-[#818380] max-w-xl mx-auto mb-10 leading-relaxed"
        >
          An AI personal assistant that works silently in the background. It understands what is coming up and gets you ready — no prompts needed.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-20"
        >
          <MagneticButton>
            <Link
              href="/app"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white font-semibold gap-2 px-7 h-11 cursor-pointer"
              )}
            >
              <Zap className="size-4" />
              Get Early Access
              <ArrowRight className="size-4" />
            </Link>
          </MagneticButton>
          <MagneticButton>
            <a
              href="#how-it-works"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "border-black/[0.08] hover:border-black/15 hover:bg-black/[0.02] text-[#4a4a4a] h-11 cursor-pointer"
              )}
            >
              See how it works
            </a>
          </MagneticButton>
        </motion.div>

        <HeroScene />
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#f7f7f6] to-transparent pointer-events-none" />
    </section>
  );
}
