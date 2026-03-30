"use client";

import { useEffect, useRef } from "react";

export function CursorGlow() {
  const glowRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });
  const raf = useRef<number>(0);

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const onMouseMove = (e: MouseEvent) => {
      target.current = { x: e.clientX, y: e.clientY };
    };

    const animate = () => {
      pos.current.x += (target.current.x - pos.current.x) * 0.12;
      pos.current.y += (target.current.y - pos.current.y) * 0.12;
      if (glowRef.current) {
        glowRef.current.style.transform = `translate(${pos.current.x - 300}px, ${pos.current.y - 300}px)`;
      }
      raf.current = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    raf.current = requestAnimationFrame(animate);
    if (glowRef.current) glowRef.current.style.opacity = "1";

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div
      ref={glowRef}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-30 opacity-0 transition-opacity duration-1000"
      style={{
        width: 600,
        height: 600,
        background:
          "radial-gradient(circle, rgba(0,0,0,0.012) 0%, rgba(0,0,0,0.004) 40%, transparent 70%)",
        willChange: "transform",
      }}
    />
  );
}
