/**
 * Convert major units (e.g. 100.50 UAH) to minor units (10050 kopecks)
 * Used when accepting GraphQL input values
 */
export function toMinorUnits(majorUnits: number): number {
  return Math.round(majorUnits * 100);
}

/**
 * Convert minor units (10050 kopecks) to major units (100.50 UAH)
 * Used when returning values in GraphQL responses
 */
export function toMajorUnits(minorUnits: number): number {
  return minorUnits / 100;
}

/**
 * Convert minor units to major units, returning null for null input
 */
export function toMajorUnitsOrNull(minorUnits: number | null): number | null {
  return minorUnits != null ? toMajorUnits(minorUnits) : null;
}
