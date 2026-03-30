"use client";

// ── Pipeline Client Hooks ────────────────────────────
// React hooks for pipeline state management.

import { useState, useEffect, useCallback, useRef } from "react";
import type { PipelineRun, Artifact, CalendarEventRecord, PipelineSettings } from "./types";

// ── Poll a pipeline run status ───────────────────────

export function usePipelineRun(runId: string | null) {
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    async function poll() {
      try {
        const res = await fetch(`/api/pipeline/status/${runId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setRun(data.run);
          setIsLoading(false);

          // Stop polling when terminal
          if (data.run.stage === "completed" || data.run.stage === "failed") {
            if (intervalRef.current) clearInterval(intervalRef.current);
          }
        }
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    }

    poll();
    // Poll faster (1.5s) during active runs for responsive live status
    intervalRef.current = setInterval(poll, 1500);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runId]);

  return { run, isLoading };
}

// ── Get pipeline data for an event ───────────────────

export function useEventPipeline(eventId: string | null) {
  const [record, setRecord] = useState<CalendarEventRecord | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    if (!eventId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/pipeline/events/${eventId}`);
      if (res.ok) {
        const data = await res.json();
        setRecord(data.record);
        setRuns(data.runs);
        setArtifacts(data.artifacts);
      }
    } catch {
      // Silent failure
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  return { record, runs, artifacts, isLoading, refetch: fetch_ };
}

// ── Trigger pipeline for an event ────────────────────

export function useTriggerPipeline() {
  const [isTriggering, setIsTriggering] = useState(false);

  const trigger = useCallback(async (
    eventId: string,
    source: string,
    eventData?: {
      title: string;
      description?: string;
      location?: string;
      attendees?: string[];
      date: string;
      startTime: string;
      endTime: string;
      category?: string;
      links?: string[];
    },
  ): Promise<{ runId: string; status: string } | null> => {
    setIsTriggering(true);
    try {
      const res = await fetch("/api/pipeline/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, source, eventData }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Pipeline trigger failed:", err);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error("Pipeline trigger error:", err);
      return null;
    } finally {
      setIsTriggering(false);
    }
  }, []);

  return { trigger, isTriggering };
}

// ── Fetch all artifacts (for inbox) ──────────────────

export function useArtifacts(includeStale = false) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    setIsLoading(true);
    try {
      const url = includeStale
        ? "/api/pipeline/artifacts?include_stale=true"
        : "/api/pipeline/artifacts";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setArtifacts(data.artifacts);
      }
    } catch {
      // Silent failure
    } finally {
      setIsLoading(false);
    }
  }, [includeStale]);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  return { artifacts, isLoading, refetch: fetch_ };
}

// ── Pipeline settings ────────────────────────────────

export function usePipelineSettings() {
  const [settings, setSettings] = useState<PipelineSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/pipeline/settings");
        if (res.ok) {
          const data = await res.json();
          setSettings(data.settings);
        }
      } catch {
        // Silent failure
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const updateSettings = useCallback(async (updates: Partial<PipelineSettings>) => {
    try {
      const res = await fetch("/api/pipeline/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
      }
    } catch {
      // Silent failure
    }
  }, []);

  return { settings, isLoading, updateSettings };
}
