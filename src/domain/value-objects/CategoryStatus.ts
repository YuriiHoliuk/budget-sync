export const CategoryStatus = {
  ACTIVE: 'active',
  SUGGESTED: 'suggested',
  ARCHIVED: 'archived',
} as const;

export type CategoryStatus =
  (typeof CategoryStatus)[keyof typeof CategoryStatus];
