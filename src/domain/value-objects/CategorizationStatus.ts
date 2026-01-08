export const CategorizationStatus = {
  PENDING: 'pending',
  CATEGORIZED: 'categorized',
  VERIFIED: 'verified',
} as const;

export type CategorizationStatus =
  (typeof CategorizationStatus)[keyof typeof CategorizationStatus];
