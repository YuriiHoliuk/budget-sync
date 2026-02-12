import { generateKeyBetween } from 'fractional-indexing';

/**
 * Generate a fractional indexing key between two existing keys.
 *
 * @param lower - The key before the new position (null = beginning of list)
 * @param upper - The key after the new position (null = end of list)
 * @returns A new key that sorts between lower and upper
 */
export function generateOrderKey(
  lower: string | null,
  upper: string | null,
): string {
  return generateKeyBetween(lower, upper);
}
