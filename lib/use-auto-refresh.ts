"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Options {
  /** Interval in ms. Default 5min (300_000). */
  intervalMs?: number;
  /** Min time since last refresh before a visibilitychange triggers a refetch. Default 2min (120_000). */
  minVisibilityRefetchMs?: number;
  /** When false, the auto-refresh is paused (e.g. user has dirty filters). */
  enabled?: boolean;
}

/**
 * Hook that periodically calls `fetcher` every `intervalMs`,
 * also refetches when the tab regains focus (if enough time has passed),
 * and exposes a `lastRefresh` timestamp + a real-time "há Xmin" label.
 */
export function useAutoRefresh(fetcher: () => void, options: Options = {}) {
  const {
    intervalMs = 5 * 60 * 1000,
    minVisibilityRefetchMs = 2 * 60 * 1000,
    enabled = true,
  } = options;

  const [lastRefresh, setLastRefresh] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());

  // Keep latest fetcher in a ref so we don't reset interval on every parent render.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  /** Mark a refresh as having just happened (call this after each fetch). */
  const markRefreshed = useCallback(() => {
    setLastRefresh(Date.now());
  }, []);

  // Tick the "now" clock every 30s so the "Atualizado há Xmin" label updates live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Periodic auto-refresh
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      fetcherRef.current();
      setLastRefresh(Date.now());
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);

  // Refetch on tab focus if it's been long enough.
  useEffect(() => {
    if (!enabled) return;
    function onVis() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefresh >= minVisibilityRefetchMs) {
        fetcherRef.current();
        setLastRefresh(Date.now());
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled, lastRefresh, minVisibilityRefetchMs]);

  const ageMs = Math.max(0, now - lastRefresh);
  const label = formatAge(ageMs);

  return { lastRefresh, label, markRefreshed };
}

function formatAge(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "Atualizado agora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `Atualizado há ${min}min`;
  const hr = Math.floor(min / 60);
  return `Atualizado há ${hr}h`;
}
