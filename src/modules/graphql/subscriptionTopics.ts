/**
 * GraphQL Subscription Topics
 *
 * Constants for subscription event names used across the application.
 */

/**
 * Subscription event topics for real-time updates
 */
export const SubscriptionTopic = {
  /** Monthly overview metrics changed (allocation, transaction, etc.) */
  MONTHLY_OVERVIEW_UPDATED: 'MONTHLY_OVERVIEW_UPDATED',
  /** Budget created, updated, or archived */
  BUDGET_UPDATED: 'BUDGET_UPDATED',
  /** Allocation created, updated, or deleted */
  ALLOCATION_UPDATED: 'ALLOCATION_UPDATED',
  /** Transaction created, updated, or categorized */
  TRANSACTION_UPDATED: 'TRANSACTION_UPDATED',
} as const;

export type SubscriptionTopicType =
  (typeof SubscriptionTopic)[keyof typeof SubscriptionTopic];
