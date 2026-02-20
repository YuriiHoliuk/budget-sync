import { useState, useEffect } from "react";

/**
 * Returns a debounced version of the provided value.
 * The debounced value updates only after no changes have occurred for the specified delay.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
