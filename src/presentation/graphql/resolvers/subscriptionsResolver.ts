/**
 * Subscriptions Resolver
 *
 * Handles GraphQL subscription resolvers for real-time updates.
 * Subscriptions use the in-memory PubSub from graphql-subscriptions.
 */

import { SubscriptionTopic } from '@modules/graphql/subscriptionTopics.ts';
import { injectable } from 'tsyringe';
import { Resolver, type ResolverMap } from '../Resolver.ts';

/**
 * Resolver for GraphQL subscriptions.
 * Provides real-time updates for monthly overview, budgets, allocations, and transactions.
 */
@injectable()
export class SubscriptionsResolver extends Resolver {
  getResolverMap(): ResolverMap {
    return {
      Subscription: {
        monthlyOverviewUpdated: {
          subscribe: (_parent, _args, { pubsub }) => {
            return pubsub.asyncIterableIterator(
              SubscriptionTopic.MONTHLY_OVERVIEW_UPDATED,
            );
          },
        },
        budgetUpdated: {
          subscribe: (_parent, _args, { pubsub }) => {
            return pubsub.asyncIterableIterator(
              SubscriptionTopic.BUDGET_UPDATED,
            );
          },
        },
        allocationUpdated: {
          subscribe: (_parent, _args, { pubsub }) => {
            return pubsub.asyncIterableIterator(
              SubscriptionTopic.ALLOCATION_UPDATED,
            );
          },
        },
        transactionUpdated: {
          subscribe: (_parent, _args, { pubsub }) => {
            return pubsub.asyncIterableIterator(
              SubscriptionTopic.TRANSACTION_UPDATED,
            );
          },
        },
      },
    };
  }
}
