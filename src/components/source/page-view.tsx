"use client";

import { useEffect } from "react";

/** Optional first-party beacon. No third-party scripts. Enable with NEXT_PUBLIC_ANALYTICS=1. */
export function PageView() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ANALYTICS !== "1") return;
    try {
      const key = "source.events";
      const prev = JSON.parse(window.localStorage.getItem(key) || "[]") as unknown[];
      const ref = document.referrer || "";
      const host = ref ? new URL(ref).hostname : "direct";
      const row = {
        t: Date.now(),
        path: window.location.pathname,
        search: window.location.search,
        referrerHost: host,
      };
      window.localStorage.setItem(key, JSON.stringify([...prev, row].slice(-200)));
    } catch {
      /* ignore quota / private mode */
    }
  }, []);
  return null;
}
