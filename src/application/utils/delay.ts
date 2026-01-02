/**
 * Promise-based delay utility.
 * @param ms - Delay in milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
