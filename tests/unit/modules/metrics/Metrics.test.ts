import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { NoopMetrics, PromMetrics } from '@modules/metrics/index.ts';

describe('PromMetrics', () => {
  test('render() returns exposition text containing a defined metric name', async () => {
    const metrics = new PromMetrics();
    metrics.incWebhookReceived();

    const output = await metrics.render();

    expect(output).toContain('budget_sync_webhooks_received_total');
  });

  test('contentType() returns the Prometheus content type', () => {
    const metrics = new PromMetrics();
    expect(metrics.contentType()).toContain('text/plain');
  });
});

describe('NoopMetrics', () => {
  test('render() returns an empty string', async () => {
    const metrics = new NoopMetrics();
    expect(await metrics.render()).toBe('');
  });

  test('contentType() returns text/plain', () => {
    const metrics = new NoopMetrics();
    expect(metrics.contentType()).toBe('text/plain');
  });
});
