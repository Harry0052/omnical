"use client";

import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const sectionVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 40,
    filter: "blur(6px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.8,
      ease: [0.25, 0.4, 0.25, 1],
    },
  },
};

interface SectionRevealProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

/**
 * Wraps a section with a cinematic scroll-triggered reveal:
 * fade in + translate up + blur clear.
 */
export function SectionReveal({ children, className, id }: SectionRevealProps) {
  return (
    <motion.section
      id={id}
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}
