import { summarizeReactions } from './reaction-summary';

describe('reaction summaries', () => {
  it('aggregates in stable enum order and exposes viewer reaction', () => {
    expect(summarizeReactions([{ type: 'LOVE', userId: 'a' }, { type: 'LIKE', userId: 'b' }, { type: 'LOVE', userId: 'c' }], 'a')).toEqual({ reactions: [{ type: 'LIKE', count: 1 }, { type: 'LOVE', count: 2 }], myReaction: 'LOVE' });
  });
  it('returns null when viewer has no reaction', () => { expect(summarizeReactions([{ type: 'FIRE', userId: 'b' }], 'a').myReaction).toBeNull(); });
  it('supports one viewer reaction after replacement', () => { expect(summarizeReactions([{ type: 'LAUGH', userId: 'a' }], 'a').reactions).toEqual([{ type: 'LAUGH', count: 1 }]); });
  it('returns empty aggregate for no rows', () => { expect(summarizeReactions([], 'a')).toEqual({ reactions: [], myReaction: null }); });
});
