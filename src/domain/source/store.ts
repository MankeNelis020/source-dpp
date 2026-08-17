"use client";

import { useSyncExternalStore } from "react";
import { applyCommand } from "./engine";
import { createSeedState } from "./seed";
import type { Command, EngineState } from "./types";

const serverSnapshot = createSeedState();
let memory = createSeedState();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getEngineState(): EngineState {
  return memory;
}

export function dispatchCommand(command: Command, now = new Date()) {
  const result = applyCommand(memory, command, now);
  memory = result.state;
  emit();
  return result;
}

export function resetEngineState() {
  memory = createSeedState();
  emit();
}

export function subscribeEngine(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEngineState(): EngineState {
  return useSyncExternalStore(subscribeEngine, getEngineState, () => serverSnapshot);
}
