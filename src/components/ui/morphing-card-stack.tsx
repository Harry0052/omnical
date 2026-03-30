"use client";

import { useState, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface MorphCard {
  id: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  description: string;
  prepItems: string[];
}

interface MorphingCardStackProps {
  cards: MorphCard[];
}

export function MorphingCardStack({ cards }: MorphingCardStackProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const advance = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % cards.length);
  }, [cards.length]);

  const goTo = useCallback((i: number) => { setActiveIndex(i); }, []);

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="relative h-[320px] sm:h-[340px] cursor-pointer" onClick={advance} role="button" tabIndex={0} aria-label="Next card"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); advance(); } }}>
        {[2, 1].map((offset) => (
          <div key={`bg-${offset}`} className="absolute inset-x-0 bottom-0 mx-auto rounded-2xl border border-black/[0.04] bg-white/50"
            style={{ height: `calc(100% - ${offset * 10}px)`, width: `calc(100% - ${offset * 20}px)`, transform: `translateY(-${offset * 7}px)`, zIndex: 10 - offset, opacity: 0.5 - offset * 0.15 }} />
        ))}

        <AnimatePresence mode="wait">
          <motion.div key={cards[activeIndex].id}
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
            className="absolute inset-0 z-20">
            <div className="h-full rounded-2xl border border-black/[0.06] bg-white/90 backdrop-blur-sm p-6 sm:p-8 flex flex-col shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-[#e9ebeb] border border-black/[0.04] flex items-center justify-center [&>svg]:text-[#818380]">
                    {cards[activeIndex].icon}
                  </div>
                  <div>
                    <p className="text-base font-semibold text-[#1a1a1a]">{cards[activeIndex].title}</p>
                    <p className="text-[10px] font-mono text-[#9c9e9b] uppercase tracking-wider">{cards[activeIndex].subtitle}</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-[#c6c8c7]">
                  {String(activeIndex + 1).padStart(2, "0")}/{String(cards.length).padStart(2, "0")}
                </span>
              </div>

              <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.35 }}
                className="text-sm text-[#818380] leading-relaxed mb-5">
                {cards[activeIndex].description}
              </motion.p>

              <div className="mt-auto">
                <p className="text-[9px] font-mono text-[#c6c8c7] uppercase tracking-wider mb-2">What Omni Cal prepared</p>
                <div className="space-y-2">
                  {cards[activeIndex].prepItems.map((item, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + i * 0.06, duration: 0.3 }}
                      className="flex items-center gap-2.5">
                      <div className="size-1 rounded-full bg-[#b2b4b2] shrink-0" />
                      <span className="text-[12px] text-[#818380]">{item}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-center gap-2 mt-5">
        {cards.map((_, i) => (
          <button key={i} onClick={(e) => { e.stopPropagation(); goTo(i); }} aria-label={`Card ${i + 1}`}
            className={`h-1 rounded-full transition-all duration-400 cursor-pointer ${i === activeIndex ? "w-5 bg-[#818380]/50" : "w-1.5 bg-black/[0.06] hover:bg-black/[0.1]"}`} />
        ))}
      </div>
      <p className="text-center text-[9px] text-[#c6c8c7] mt-2.5 font-mono">Tap to cycle</p>
    </div>
  );
}
