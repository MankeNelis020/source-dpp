"use client";

const KEY = "source.session";
const EVENT = "source-session";

export interface SourceSession {
  email: string;
  name?: string;
  organisation: string;
}

let snapshot: SourceSession | null = null;
let snapshotRaw: string | null = null;

function parseSession(raw: string | null): SourceSession | null {
  if (raw === snapshotRaw) return snapshot;
  snapshotRaw = raw;
  if (!raw) {
    snapshot = null;
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as SourceSession;
    snapshot = parsed?.email ? parsed : null;
  } catch {
    snapshot = null;
  }
  return snapshot;
}

export function subscribeSession(onStoreChange: () => void) {
  window.addEventListener(EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function readSession(): SourceSession | null {
  if (typeof window === "undefined") return null;
  return parseSession(window.localStorage.getItem(KEY));
}

export function writeSession(session: SourceSession) {
  window.localStorage.setItem(KEY, JSON.stringify(session));
  snapshotRaw = null;
  window.dispatchEvent(new Event(EVENT));
}

export function clearSession() {
  window.localStorage.removeItem(KEY);
  snapshotRaw = null;
  window.dispatchEvent(new Event(EVENT));
}
