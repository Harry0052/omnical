"use client";

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface OrbitNode {
  id: string;
  icon: ReactNode;
  label: string;
  title: string;
  description: string;
  relatedIds: string[];
}

interface RadialOrbitProps {
  nodes: OrbitNode[];
  centerLabel?: string;
  centerSublabel?: string;
}

/**
 * Compute static position for a node on the orbit ring.
 * Angle 0 = 12 o'clock (top), proceeds clockwise.
 */
function nodeAngle(index: number, total: number) {
  return (index / total) * Math.PI * 2 - Math.PI / 2;
}

export function RadialOrbit({
  nodes,
  centerLabel = "Omni Cal",
  centerSublabel = "Intelligence Core",
}: RadialOrbitProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [radius, setRadius] = useState(190);
  const [containerSize, setContainerSize] = useState(560);
  const containerRef = useRef<HTMLDivElement>(null);

  // Responsive orbit radius
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 640) setRadius(110);
      else if (w < 1024) setRadius(150);
      else setRadius(190);
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  // Measure actual container width for SVG line alignment
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) setContainerSize(containerRef.current.offsetWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const handleSelect = useCallback(
    (id: string) => setSelected((prev) => (prev === id ? null : id)),
    [],
  );
  const handleDeselect = useCallback(() => setSelected(null), []);

  const selectedNode = nodes.find((n) => n.id === selected);
  const relatedSet = useMemo(
    () => new Set(selectedNode?.relatedIds ?? []),
    [selectedNode],
  );

  // Pre-compute static positions for nodes and labels
  const positions = useMemo(() => {
    const labelGap = 32; // distance from node center to label anchor
    return nodes.map((_, i) => {
      const a = nodeAngle(i, nodes.length);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      // Label alignment: right side of circle → left-align, left side → right-align
      const align: "left" | "right" | "center" =
        cos > 0.35 ? "left" : cos < -0.35 ? "right" : "center";
      return {
        // Node icon center (on the orbit ring)
        nx: cos * radius,
        ny: sin * radius,
        // Label anchor (pushed outward from node)
        lx: cos * (radius + labelGap),
        ly: sin * (radius + labelGap),
        align,
        cos,
        sin,
      };
    });
  }, [nodes.length, radius]);

  return (
    <div className="relative">
      {/* Orbit visualization */}
      <div
        ref={containerRef}
        className="relative w-full aspect-square max-w-[560px] mx-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleDeselect();
        }}
      >
        {/* Single primary orbit ring */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#d7d8d8]"
          style={{ width: radius * 2, height: radius * 2 }}
        />
        {/* Faint outer halo */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#e9ebeb]/60"
          style={{ width: radius * 2 + 80, height: radius * 2 + 80 }}
        />

        {/* ── Center node ─────────────────────────── */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          <div className="size-14 sm:size-16 rounded-full bg-white border border-[#c6c8c7] flex flex-col items-center justify-center shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="size-3.5 rounded-[5px] bg-[#1a1a1a] mb-1" />
            <span className="text-[7px] sm:text-[8px] font-semibold text-[#1a1a1a] tracking-tight leading-none">
              {centerLabel}
            </span>
          </div>
        </div>

        {/* ── SVG lines (shown only when a node is selected) ── */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          aria-hidden
        >
          {selected &&
            nodes.map((node, i) => {
              const isActive = node.id === selected;
              const isRelated = relatedSet.has(node.id);
              if (!isActive && !isRelated) return null;
              const { nx, ny } = positions[i];
              return (
                <line
                  key={node.id}
                  x1="50%"
                  y1="50%"
                  x2={`${50 + (nx / containerSize) * 100}%`}
                  y2={`${50 + (ny / containerSize) * 100}%`}
                  stroke={isActive ? "#9c9e9b" : "#c6c8c7"}
                  strokeWidth={isActive ? 1.5 : 1}
                  className="transition-all duration-500"
                />
              );
            })}
        </svg>

        {/* ── Node icon circles (on the orbit ring) ── */}
        {nodes.map((node, i) => {
          const { nx, ny } = positions[i];
          const isSelected = selected === node.id;
          const isRelated = relatedSet.has(node.id);
          const isDimmed = selected !== null && !isSelected && !isRelated;

          return (
            <motion.div
              key={node.id}
              className="absolute z-20"
              style={{
                top: "50%",
                left: "50%",
                transform: `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`,
              }}
              animate={{ opacity: isDimmed ? 0.2 : 1 }}
              transition={{ duration: 0.4 }}
            >
              <button
                onClick={() => handleSelect(node.id)}
                className={`group size-11 sm:size-12 rounded-full flex items-center justify-center cursor-pointer outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[#9c9e9b]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f7f6] ${
                  isSelected
                    ? "bg-white border-2 border-[#9c9e9b] shadow-[0_4px_16px_rgba(0,0,0,0.1)] scale-110"
                    : isRelated
                    ? "bg-white border border-[#b2b4b2] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                    : "bg-white border border-[#d7d8d8] shadow-[0_1px_4px_rgba(0,0,0,0.03)] hover:border-[#c6c8c7] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                }`}
                aria-label={node.label}
                aria-expanded={isSelected}
              >
                <div
                  className={`transition-colors duration-300 [&>svg]:size-[18px] sm:[&>svg]:size-5 ${
                    isSelected || isRelated
                      ? "[&>svg]:text-[#1a1a1a]"
                      : "[&>svg]:text-[#9c9e9b] group-hover:[&>svg]:text-[#818380]"
                  }`}
                >
                  {node.icon}
                </div>
              </button>
            </motion.div>
          );
        })}

        {/* ── Labels (positioned radially OUTSIDE the nodes) ── */}
        {nodes.map((node, i) => {
          const { lx, ly, align } = positions[i];
          const isSelected = selected === node.id;
          const isDimmed =
            selected !== null && !isSelected && !relatedSet.has(node.id);

          // Transform adjusts based on alignment to prevent overflow:
          // left-aligned (right side) → anchor at left edge of text
          // right-aligned (left side) → anchor at right edge of text
          // center (top/bottom) → anchor at center
          const tx =
            align === "left"
              ? `${lx}px`
              : align === "right"
              ? `calc(-100% + ${lx}px)`
              : `calc(-50% + ${lx}px)`;

          return (
            <motion.div
              key={`label-${node.id}`}
              className="absolute pointer-events-none z-10"
              style={{
                top: "50%",
                left: "50%",
                transform: `translate(${tx}, calc(-50% + ${ly}px))`,
              }}
              animate={{ opacity: isDimmed ? 0.15 : 1 }}
              transition={{ duration: 0.4 }}
            >
              <span
                className={`block text-[10px] sm:text-[11px] font-medium whitespace-nowrap transition-colors duration-300 ${
                  isSelected
                    ? "text-[#1a1a1a]"
                    : "text-[#9c9e9b]"
                }`}
                style={{ textAlign: align }}
              >
                {node.label}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* ── Detail card (cleanly below the orbit) ── */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: [0.25, 0.4, 0.25, 1] }}
            className="mt-8 mx-auto max-w-sm"
          >
            <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
              <div className="flex items-center gap-3 mb-3">
                <div className="size-9 rounded-lg bg-[#e9ebeb] border border-black/[0.04] flex items-center justify-center [&>svg]:text-[#1a1a1a]">
                  {selectedNode.icon}
                </div>
                <p className="text-sm font-semibold text-[#1a1a1a]">
                  {selectedNode.title}
                </p>
              </div>
              <p className="text-[13px] text-[#818380] leading-relaxed">
                {selectedNode.description}
              </p>
              {selectedNode.relatedIds.length > 0 && (
                <div className="mt-3 pt-3 border-t border-black/[0.04]">
                  <p className="text-[9px] font-mono text-[#9c9e9b] uppercase tracking-wider mb-1.5">
                    Connected to
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNode.relatedIds.map((rid) => {
                      const related = nodes.find((n) => n.id === rid);
                      if (!related) return null;
                      return (
                        <button
                          key={rid}
                          onClick={() => handleSelect(rid)}
                          className="text-[11px] text-[#818380] hover:text-[#1a1a1a] bg-[#e9ebeb] rounded-full px-2.5 py-0.5 cursor-pointer transition-colors"
                        >
                          {related.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
