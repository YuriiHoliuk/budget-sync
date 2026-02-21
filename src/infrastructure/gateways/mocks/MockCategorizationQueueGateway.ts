import { CategorizationQueueGateway } from '@domain/gateways/CategorizationQueueGateway.ts';
import { injectable } from 'tsyringe';

/**
 * Mock categorization queue gateway for local development.
 * Logs messages instead of publishing to real Pub/Sub topic.
 */
@injectable()
export class MockCategorizationQueueGateway extends CategorizationQueueGateway {
  private messageCounter = 0;

  publish(_data: unknown): Promise<string> {
    this.messageCounter++;
    const messageId = `mock-categorization-${this.messageCounter}`;
    return Promise.resolve(messageId);
  }
}
