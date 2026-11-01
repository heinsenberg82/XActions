import { describe, it, expect } from 'vitest';
import { applyPollSuccess, applyPollError, isActiveStatus } from '../../src/streaming/pollMeta.js';

const NOW = '2026-11-01T20:00:00.000Z';
const NOW_MS = Date.parse(NOW);

function meta(overrides = {}) {
  return {
    id: 'stream_tweet_x_1',
    interval: 60_000,
    status: 'running',
    pollCount: 3,
    eventCount: 5,
    errorCount: 1,
    consecutiveErrors: 0,
    backoffUntil: null,
    lastError: null,
    lastPollAt: null,
    ...overrides,
  };
}

describe('applyPollSuccess', () => {
  it('counts the poll and its events', () => {
    const m = applyPollSuccess(meta(), { eventCount: 2, now: NOW });
    expect(m).toMatchObject({ pollCount: 4, eventCount: 7, lastPollAt: NOW, status: 'running' });
  });

  it('clears a backoff', () => {
    const m = applyPollSuccess(
      meta({ status: 'backoff', consecutiveErrors: 2, backoffUntil: NOW, lastError: 'x' }),
      { eventCount: 0, now: NOW }
    );
    expect(m).toMatchObject({ status: 'running', consecutiveErrors: 0, backoffUntil: null, lastError: null });
  });

  it('keeps a stream paused while the poll ran paused', () => {
    const m = applyPollSuccess(meta({ status: 'paused' }), { eventCount: 1, now: NOW });
    expect(m.status).toBe('paused');
    expect(m.pollCount).toBe(4);
  });

  it('keeps a stopped stream stopped', () => {
    expect(applyPollSuccess(meta({ status: 'stopped' }), { eventCount: 0, now: NOW }).status).toBe('stopped');
  });
});

describe('applyPollError', () => {
  it('backs off exponentially, capped at 15 minutes', () => {
    const { meta: m, autoStopped } = applyPollError(meta(), { message: 'boom', maxErrors: 10, nowMs: NOW_MS });
    expect(autoStopped).toBe(false);
    expect(m).toMatchObject({ status: 'backoff', consecutiveErrors: 1, errorCount: 2, lastError: 'boom' });
    expect(Date.parse(m.backoffUntil) - NOW_MS).toBe(120_000);

    const { meta: capped } = applyPollError(meta({ consecutiveErrors: 8 }), { message: 'boom', maxErrors: 10, nowMs: NOW_MS });
    expect(Date.parse(capped.backoffUntil) - NOW_MS).toBe(15 * 60 * 1000);
  });

  it('stops the stream after maxErrors in a row', () => {
    const { meta: m, autoStopped } = applyPollError(meta({ consecutiveErrors: 4 }), { message: 'boom', maxErrors: 5, nowMs: NOW_MS });
    expect(autoStopped).toBe(true);
    expect(m.status).toBe('stopped');
    expect(m.lastError).toMatch(/Auto-stopped after 5/);
  });

  it('records the error but keeps a paused stream paused', () => {
    const { meta: m, autoStopped } = applyPollError(meta({ status: 'paused', consecutiveErrors: 4 }), {
      message: 'boom',
      maxErrors: 5,
      nowMs: NOW_MS,
    });
    expect(autoStopped).toBe(false);
    expect(m).toMatchObject({ status: 'paused', consecutiveErrors: 5, lastError: 'boom', backoffUntil: null });
  });
});

describe('isActiveStatus', () => {
  it('treats running and backoff as active', () => {
    expect(['running', 'backoff', 'paused', 'stopped'].map(isActiveStatus)).toEqual([true, true, false, false]);
  });
});
