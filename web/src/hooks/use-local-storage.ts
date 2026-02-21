"use client";

import { useSyncExternalStore, useCallback } from "react";

// Module-level cache ensures referential stability for getSnapshot return values.
// Without this, JSON.parse would return new object references on every render,
// causing useSyncExternalStore to re-render infinitely for non-primitive values.
const snapshotCache = new Map<
  string,
  { raw: string | null; parsed: unknown }
>();

function readFromStorage<T>(key: string, initialValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    const cached = snapshotCache.get(key);
    if (cached && cached.raw === raw) {
      return cached.parsed as T;
    }
    const parsed = raw !== null ? (JSON.parse(raw) as T) : initialValue;
    snapshotCache.set(key, { raw, parsed });
    return parsed;
  } catch {
    return initialValue;
  }
}

/**
 * A hook that mirrors useState but persists the value in localStorage.
 * Uses useSyncExternalStore for React Compiler compatibility (no setState in effects).
 * Returns initialValue during SSR; reads from localStorage on the client.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      // Cross-tab updates via native storage event
      const storageHandler = (event: StorageEvent) => {
        if (event.key === key || event.key === null) {
          onStoreChange();
        }
      };
      // Same-tab updates via custom event
      const customHandler = () => onStoreChange();
      window.addEventListener("storage", storageHandler);
      window.addEventListener(`ls:${key}`, customHandler);
      return () => {
        window.removeEventListener("storage", storageHandler);
        window.removeEventListener(`ls:${key}`, customHandler);
      };
    },
    [key],
  );

  const getSnapshot = useCallback(
    () => readFromStorage(key, initialValue),
    [key, initialValue],
  );

  const getServerSnapshot = useCallback(() => initialValue, [initialValue]);

  const value = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      const current = readFromStorage(key, initialValue);
      const next =
        typeof newValue === "function"
          ? (newValue as (prev: T) => T)(current)
          : newValue;
      try {
        const serialized = JSON.stringify(next);
        localStorage.setItem(key, serialized);
        snapshotCache.set(key, { raw: serialized, parsed: next });
      } catch {
        // Silently fail on storage errors (quota exceeded, etc.)
      }
      // Notify same-tab subscribers
      window.dispatchEvent(new Event(`ls:${key}`));
    },
    [key, initialValue],
  );

  return [value, setValue];
}
