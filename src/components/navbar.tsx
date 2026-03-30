"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MagneticButton } from "@/components/magnetic-button";

const links = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "FAQ", href: "#faq" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
        scrolled
          ? "bg-white/80 backdrop-blur-2xl border-b border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          : "bg-transparent"
      )}
    >
      <div className="mx-auto max-w-6xl px-6 flex items-center justify-between h-16">
        <a href="#" className="flex items-center gap-2.5 group">
          <div className="relative size-7 rounded-lg border border-black/10 flex items-center justify-center group-hover:border-black/20 transition-colors duration-300">
            <div className="size-2.5 rounded-sm bg-[#1a1a1a]" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-[#1a1a1a]">
            Omni Cal
          </span>
        </a>

        <div className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-[#818380] hover:text-[#1a1a1a] transition-colors duration-200"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center">
          <MagneticButton strength={0.15}>
            <Link
              href="/app"
              className={cn(
                buttonVariants({ size: "sm" }),
                "bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white font-medium cursor-pointer"
              )}
            >
              Get Early Access
            </Link>
          </MagneticButton>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-[#818380] hover:text-[#1a1a1a] cursor-pointer"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.4, 0.25, 1] }}
            className="md:hidden bg-white/95 backdrop-blur-2xl border-b border-black/[0.04] overflow-hidden"
          >
            <div className="px-6 py-4 flex flex-col gap-3">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-sm text-[#818380] hover:text-[#1a1a1a] py-2 transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <Link
                href="/app"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white font-medium mt-2 w-full cursor-pointer"
                )}
              >
                Get Early Access
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
