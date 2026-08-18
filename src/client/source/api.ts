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
  const [errorCode, setErrorCode] = useState<string | null>(null);
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
        setErrorCode(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Request failed");
        setErrorCode(err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code ?? "") : null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  return { data, error, errorCode, loading, reload };
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

export async function uploadSourceFile(args: {
  purpose: "IMPORT_SOURCE" | "EVIDENCE";
  file: File;
  caseId?: string;
  requirementId?: string;
  portalToken?: string;
  onProgress?: (stage: "intent" | "upload" | "finalize") => void;
}): Promise<{ id: string; sha256?: string; sizeBytes?: number; evidenceId?: string; availability: string }> {
  const base = args.portalToken
    ? `/api/portal/${encodeURIComponent(args.portalToken)}/uploads`
    : "/api/uploads";
  args.onProgress?.("intent");
  const intent = await api<{ id: string }>(`${base}/intents`, {
    method: "POST",
    body: JSON.stringify({
      purpose: args.purpose,
      filename: args.file.name,
      mimeType: args.file.type,
      size: args.file.size,
      caseId: args.caseId,
      requirementId: args.requirementId,
    }),
  });
  args.onProgress?.("upload");
  const form = new FormData();
  form.append("file", args.file);
  const uploaded = await fetch(`${base}/${encodeURIComponent(intent.id)}`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const uploadedBody = await uploaded.json().catch(() => ({}));
  if (!uploaded.ok) {
    throw Object.assign(new Error(uploadedBody.message ?? "We couldn't store this file. Nothing has been added yet."), {
      code: uploadedBody.error,
    });
  }
  args.onProgress?.("finalize");
  return api(`${base}/${encodeURIComponent(intent.id)}/finalize`, { method: "POST", body: "{}" });
}
