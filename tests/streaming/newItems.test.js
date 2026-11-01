import { describe, it, expect } from 'vitest';
import { selectNewItems } from '../../src/streaming/newItems.js';

const t = (id) => ({ id, text: `tweet ${id}` });

describe('selectNewItems', () => {
  it('treats everything as new when nothing was seen', () => {
    const { fresh, seenIds } = selectNewItems([t('30'), t('20')], []);
    expect(fresh.map((x) => x.id)).toEqual(['30', '20']);
    expect(seenIds).toEqual(['30', '20']);
  });

  it('ignores an unseen tweet older than the newest seen one', () => {
    // The previous scrape skipped 2111577022183194937 (17 Oct) in the middle of
    // the timeline; it must not come back as a new post.
    const lastSeen = ['2115562363151954428', '2108672272236179648'];
    const scrape = [t('2115562363151954428'), t('2111577022183194937')];
    const { fresh, seenIds } = selectNewItems(scrape, lastSeen);
    expect(fresh).toEqual([]);
    expect(seenIds).toContain('2111577022183194937');
  });

  it('reports tweets above the high-water mark', () => {
    const lastSeen = ['2115562363151954428'];
    const scrape = [t('2116000000000000000'), t('2115562363151954428'), t('2110000000000000000')];
    const { fresh } = selectNewItems(scrape, lastSeen);
    expect(fresh.map((x) => x.id)).toEqual(['2116000000000000000']);
  });

  it('compares IDs numerically, not as strings', () => {
    const { fresh } = selectNewItems([t('1000')], ['999']);
    expect(fresh.map((x) => x.id)).toEqual(['1000']);
  });

  it('skips items without an id and bounds the seen list', () => {
    const lastSeen = Array.from({ length: 500 }, (_, i) => String(i + 1));
    const { fresh, seenIds } = selectNewItems([{ text: 'no id' }, t('501')], lastSeen);
    expect(fresh.map((x) => x.id)).toEqual(['501']);
    expect(seenIds).toHaveLength(500);
    expect(seenIds.at(-1)).toBe('501');
  });
});
