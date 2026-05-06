"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

type Ctx = {
  start: () => void;
  complete: () => void;
};

const NavigationProgressContext = createContext<Ctx | null>(null);

export function useNavigationProgress() {
  const ctx = useContext(NavigationProgressContext);
  if (!ctx) {
    // Safe no-op so consumers don't crash if used outside provider
    return { start: () => {}, complete: () => {} };
  }
  return ctx;
}

export function NavigationProgressProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);
  const lastPathRef = useRef(pathname);

  const clearTrickle = () => {
    if (trickleRef.current) {
      clearInterval(trickleRef.current);
      trickleRef.current = null;
    }
  };

  const clearHide = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const start = useCallback(() => {
    clearHide();
    clearTrickle();
    startedRef.current = true;
    setVisible(true);
    // quick burst 0 -> 30
    setProgress(10);
    // schedule jump to 30 right after
    requestAnimationFrame(() => setProgress(30));
    // then trickle 30 -> 90 over ~3s with random increments
    trickleRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        const remaining = 90 - p;
        const inc = Math.max(1, Math.random() * remaining * 0.15);
        return Math.min(90, p + inc);
      });
    }, 250);
  }, []);

  const complete = useCallback(() => {
    if (!startedRef.current) return;
    startedRef.current = false;
    clearTrickle();
    setProgress(100);
    clearHide();
    hideTimeoutRef.current = setTimeout(() => {
      setVisible(false);
      // reset after fade so next start animates from 0
      setTimeout(() => setProgress(0), 50);
    }, 200);
  }, []);

  // When pathname changes, the new page rendered → complete.
  useEffect(() => {
    if (lastPathRef.current !== pathname) {
      lastPathRef.current = pathname;
      complete();
    }
  }, [pathname, complete]);

  useEffect(() => {
    return () => {
      clearTrickle();
      clearHide();
    };
  }, []);

  return (
    <NavigationProgressContext.Provider value={{ start, complete }}>
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 right-0 z-[9999] h-[2px]"
        style={{
          opacity: visible ? 1 : 0,
          transition: "opacity 200ms ease-out",
        }}
      >
        <div
          className="h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]"
          style={{
            width: `${progress}%`,
            transition: "width 300ms ease-out",
          }}
        />
      </div>
      {children}
    </NavigationProgressContext.Provider>
  );
}
