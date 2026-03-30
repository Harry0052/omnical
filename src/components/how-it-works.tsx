"use client";

import { useRef } from "react";
import { useScroll, motion, useTransform } from "framer-motion";
import { OmniCalDemo } from "./omni-cal-demo";

export function HowItWorks() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const titleOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0.5]);

  return (
    <section
      id="how-it-works"
      ref={containerRef}
      className="relative"
      style={{ height: "300vh" }}
    >
      <div className="sticky top-0 h-screen flex flex-col items-center px-4 md:px-6 pt-12 md:pt-16 pb-6 md:pb-8 overflow-hidden">
        {/* Section header */}
        <motion.div
          style={{ opacity: titleOpacity }}
          className="text-center mb-4 md:mb-6 shrink-0"
        >
          <p className="text-xs font-mono text-[#9c9e9b] tracking-widest uppercase mb-2 md:mb-3">
            See it in motion
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[#1a1a1a] max-w-2xl mx-auto leading-[1.15]">
            From inbox to insight,{" "}
            <span className="text-gradient">without a prompt</span>
          </h2>
        </motion.div>

        {/* Demo — fills remaining vertical space */}
        <div className="w-full max-w-4xl mx-auto flex-1 min-h-0">
          <OmniCalDemo scrollProgress={scrollYProgress} />
        </div>
      </div>
    </section>
  );
}
