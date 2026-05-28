// src/app/demo/start/DemoStartRedirect.tsx
"use client";

import { useEffect } from "react";

export default function DemoStartRedirect() {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      window.location.replace("/api/demo-login");
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return null;
}