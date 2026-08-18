import { useCallback, useEffect, useState } from "react";
import type { Command } from "@/domain/source";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message ?? "Request failed") as Error & { code?: string; status?: number };
    error.code = data.error;
    error.status = response.status;
    throw error;
  }
  return data as T;
}

export function useSourceQuery<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    void api<T>(path)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Request failed");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  return { data, error, loading, reload };
}

export function useDispatchCommand() {
  return useCallback(async (command: Command, extra?: { expectedVersion?: number; idempotencyKey?: string }) => {
    return api("/api/source/commands", {
      method: "POST",
      body: JSON.stringify({
        command,
        expectedVersion: extra?.expectedVersion,
        idempotencyKey: extra?.idempotencyKey ?? crypto.randomUUID(),
      }),
    });
  }, []);
}

export function usePortalCommand(token: string) {
  return useCallback(
    async (command: Command, extra?: { expectedVersion?: number }) => {
      return api(`/api/portal/${encodeURIComponent(token)}/commands`, {
        method: "POST",
        body: JSON.stringify({ command, expectedVersion: extra?.expectedVersion, idempotencyKey: crypto.randomUUID() }),
      });
    },
    [token]
  );
}

export { api };
