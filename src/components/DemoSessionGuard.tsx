// src/components/DemoSessionGuard.tsx
"use client";

import { useEffect } from "react";

const DEMO_SESSION_KEY = "venaris_demo_session_started_at";
const DEMO_SESSION_MAX_MS = 60 * 60 * 1000;

export default function DemoSessionGuard() {
  useEffect(() => {
    let cancelled = false;

    async function forceLogout() {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        // best effort logout
      }

      if (!cancelled) {
        window.location.href = "/login?demo_timeout=1";
      }
    }

    const now = Date.now();
    const raw = window.sessionStorage.getItem(DEMO_SESSION_KEY);
    const startedAt = raw ? Number(raw) : NaN;

    const sessionStartedAt =
      Number.isFinite(startedAt) && startedAt > 0 ? startedAt : now;

    if (!raw || !Number.isFinite(startedAt) || startedAt <= 0) {
      window.sessionStorage.setItem(
        DEMO_SESSION_KEY,
        String(sessionStartedAt)
      );
    }

    const elapsed = now - sessionStartedAt;
    const remaining = DEMO_SESSION_MAX_MS - elapsed;

    if (remaining <= 0) {
      void forceLogout();
      return () => {
        cancelled = true;
      };
    }

    const timeout = window.setTimeout(() => {
      void forceLogout();
    }, remaining);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  return null;
}