export const CategorizationStatus = {
  PENDING: 'pending',
  CATEGORIZED: 'categorized',
  VERIFIED: 'verified',
  FAILED: 'failed',
} as const;

export type CategorizationStatus =
  (typeof CategorizationStatus)[keyof typeof CategorizationStatus];
