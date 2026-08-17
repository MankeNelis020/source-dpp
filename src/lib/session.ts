"use client";

const KEY = "source.session";

export interface SourceSession {
  email: string;
  name?: string;
  organisation: string;
}

export function readSession(): SourceSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SourceSession;
    if (!parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function subscribeSession(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("source-session", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("source-session", onStoreChange);
  };
}

export function writeSession(session: SourceSession) {
  window.localStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("source-session"));
}

export function clearSession() {
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("source-session"));
}
