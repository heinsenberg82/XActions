// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
/**
 * Tests: when the MCP server restores streams at startup
 *
 * @author nich (@nichxbt)
 */

import { describe, it, expect } from 'vitest';

import { shouldRestoreStreams } from '../../src/mcp/server.js';

describe('shouldRestoreStreams', () => {
  it('restores for an HTTP server with Redis configured', () => {
    expect(shouldRestoreStreams('http', { REDIS_HOST: 'redis' })).toBe(true);
  });

  it('skips stdio servers, which live for one client session', () => {
    expect(shouldRestoreStreams('stdio', { REDIS_HOST: 'redis' })).toBe(false);
  });

  it('skips when Redis is not configured, so the queue never retries localhost', () => {
    expect(shouldRestoreStreams('http', {})).toBe(false);
  });
});
