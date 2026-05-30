import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import type { SyncAccountsResultDTO } from '@application/use-cases/SyncAccounts.ts';
import { NoopMetrics } from '@modules/metrics/index.ts';
import { InProcessScheduler } from '@presentation/scheduler/InProcessScheduler.ts';
import { createMockLogger } from '../../helpers/mocks.ts';

function createScheduler(syncResult: SyncAccountsResultDTO) {
  const syncAccountsJob = {
    setWebhookUrl: mock(() => undefined),
    execute: mock(() => Promise.resolve(syncResult)),
  };
  const metrics = new NoopMetrics();
  const recordSync = mock(metrics.recordSync);
  metrics.recordSync = recordSync;

  const scheduler = new InProcessScheduler(
    syncAccountsJob as never,
    metrics,
    createMockLogger(),
  );

  return { scheduler, syncAccountsJob, recordSync };
}

describe('InProcessScheduler', () => {
  test('runSync calls syncAccountsJob.execute (not run) and records metrics', async () => {
    const syncResult: SyncAccountsResultDTO = {
      created: 2,
      updated: 1,
      unchanged: 3,
      errors: ['oops'],
    };
    const { scheduler, syncAccountsJob, recordSync } =
      createScheduler(syncResult);

    await (scheduler as unknown as { runSync: () => Promise<void> }).runSync();

    expect(syncAccountsJob.execute).toHaveBeenCalledTimes(1);
    expect(recordSync).toHaveBeenCalledWith({
      created: 2,
      updated: 1,
      unchanged: 3,
      errors: 1,
    });
  });
});
