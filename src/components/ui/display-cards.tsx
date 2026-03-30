"use client";

import { useState, useCallback, type ReactNode } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";

export interface DisplayCard {
  icon: ReactNode;
  title: string;
  description: string;
  meta?: string;
  className?: string;
}

interface DisplayCardsProps {
  cards: DisplayCard[];
}

function SwipeCard({
  card,
  stackIndex,
  onDismiss,
}: {
  card: DisplayCard;
  stackIndex: number;
  onDismiss: () => void;
}) {
  const isTop = stackIndex === 0;
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-10, 10]);
  const dragOpacity = useTransform(x, [-200, -80, 0, 80, 200], [0.6, 1, 1, 1, 0.6]);

  return (
    <motion.div
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.8}
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 400) {
          const dir = info.offset.x > 0 ? 350 : -350;
          animate(x, dir, {
            duration: 0.3,
            ease: [0.25, 0.4, 0.25, 1],
            onComplete: () => {
              x.set(0);
              onDismiss();
            },
          });
        }
      }}
      animate={{
        scale: 1 - stackIndex * 0.04,
        y: stackIndex * -10,
      }}
      style={{
        x: isTop ? x : 0,
        rotate: isTop ? rotate : stackIndex % 2 === 0 ? -1.5 : 1.5,
        opacity: isTop ? dragOpacity : Math.max(0, 1 - stackIndex * 0.2),
        zIndex: 10 - stackIndex,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="absolute inset-0 touch-pan-y"
    >
      <div className="h-full rounded-2xl border border-black/[0.06] bg-white/90 backdrop-blur-sm p-5 sm:p-6 shadow-[0_2px_16px_rgba(0,0,0,0.05)] cursor-grab active:cursor-grabbing">
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-lg bg-[#e9ebeb] border border-black/[0.04] flex items-center justify-center shrink-0 mt-0.5">
            {card.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-medium text-[#1a1a1a] truncate">{card.title}</p>
              {card.meta && (
                <span className="text-[9px] font-mono text-[#9c9e9b] bg-[#e9ebeb] px-1.5 py-0.5 rounded-full shrink-0">
                  {card.meta}
                </span>
              )}
            </div>
            <p className="text-[13px] text-[#818380] leading-relaxed">
              {card.description}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function DisplayCards({ cards }: DisplayCardsProps) {
  const [stack, setStack] = useState(cards.map((_, i) => i));

  const cycle = useCallback(() => {
    setStack((prev) => {
      const [top, ...rest] = prev;
      return [...rest, top];
    });
  }, []);

  const visible = stack.slice(0, 4);

  return (
    <div className="relative w-full h-[160px] sm:h-[150px] max-w-[340px] md:max-w-[360px] mx-auto">
      {[...visible].reverse().map((cardIndex) => {
        const stackPos = visible.indexOf(cardIndex);
        return (
          <SwipeCard
            key={cards[cardIndex].title}
            card={cards[cardIndex]}
            stackIndex={stackPos}
            onDismiss={cycle}
          />
        );
      })}
      <p className="absolute -bottom-7 left-0 right-0 text-center text-[9px] text-[#c6c8c7] font-mono">
        Swipe to shuffle
      </p>
    </div>
  );
}
