// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
/**
 * Tests: Telegram channel configured from the environment, and message escaping
 *
 * fetch is stubbed; nothing reaches the Telegram API.
 *
 * @author nich (@nichxbt)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { Notifier } from '../../src/notifications/notifier.js';

const ENV = { XACTIONS_TELEGRAM_BOT_TOKEN: '123:abc', XACTIONS_TELEGRAM_CHAT_ID: '42' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Notifier telegram from the environment', () => {
  it('enables telegram when both variables are set', () => {
    const n = new Notifier();
    n._applyEnv(ENV);
    expect(n.config.telegram).toEqual({ enabled: true, botToken: '123:abc', chatId: '42' });
  });

  it('leaves telegram off when either variable is missing', () => {
    const n = new Notifier();
    n._applyEnv({ XACTIONS_TELEGRAM_BOT_TOKEN: '123:abc' });
    expect(n.config.telegram.enabled).toBe(false);
  });

  it('keeps a telegram channel already enabled in config.json', () => {
    const n = new Notifier();
    n.config.telegram = { enabled: true, botToken: 'file', chatId: '1' };
    n._applyEnv(ENV);
    expect(n.config.telegram.botToken).toBe('file');
  });
});

describe('Notifier telegram message', () => {
  it('escapes Markdown so tweets with _ * ` [ are not rejected', async () => {
    const fetch = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetch);

    await new Notifier()._sendTelegram(
      { botToken: '123:abc', chatId: '42' },
      { title: 'Novo tweet de @SF_Moro', message: 'veja [isso] *agora* em https://x.com/a_b', severity: 'info' },
    );

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bot123:abc/sendMessage');
    const { text, chat_id } = JSON.parse(init.body);
    expect(chat_id).toBe('42');
    expect(text).toContain('veja \\[isso] \\*agora\\* em https://x.com/a\\_b');
    expect(text).toContain('*Novo tweet de @SF\\_Moro*');
  });
});
