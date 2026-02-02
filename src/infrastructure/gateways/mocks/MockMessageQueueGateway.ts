import {
  MessageQueueGateway,
  type QueueMessage,
} from '@domain/gateways/MessageQueueGateway.ts';
import { injectable } from 'tsyringe';

/**
 * Mock message queue gateway for local development.
 * Logs messages instead of publishing to real queue.
 */
@injectable()
export class MockMessageQueueGateway extends MessageQueueGateway {
  private messageCounter = 0;

  publish(_data: unknown): Promise<string> {
    this.messageCounter++;
    const messageId = `mock-${this.messageCounter}`;
    return Promise.resolve(messageId);
  }

  pull(_maxMessages?: number): Promise<QueueMessage[]> {
    return Promise.resolve([]);
  }

  acknowledge(_ackId: string): Promise<void> {
    return Promise.resolve();
  }
}
