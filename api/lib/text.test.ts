import { describe, expect, it } from 'vitest';
import { findFuzzyMatch, levenshteinDistance, normalizeForMatch } from './text';

describe('normalizeForMatch', () => {
  it('normalizes punctuation and casing for chat matching', () => {
    expect(normalizeForMatch('  James Ashford!  ')).toBe('james ashford');
    expect(normalizeForMatch('Crystal-Vase')).toBe('crystal vase');
  });
});

describe('levenshteinDistance', () => {
  it('calculates edit distance for close spellings', () => {
    expect(levenshteinDistance('james', 'jamez')).toBe(1);
    expect(levenshteinDistance('ashford', 'ashfrod')).toBe(2);
  });
});

describe('findFuzzyMatch', () => {
  const suspects = ['James Ashford', 'Sarah Chen', 'Marcus Webb'];

  it('supports exact and prefix matches', () => {
    expect(findFuzzyMatch('James Ashford', suspects, (value) => value)).toBe('James Ashford');
    expect(findFuzzyMatch('sar', suspects, (value) => value)).toBe('Sarah Chen');
  });

  it('supports small typo matches', () => {
    expect(findFuzzyMatch('Jamez Ashford', suspects, (value) => value)).toBe('James Ashford');
  });

  it('rejects ambiguous matches', () => {
    expect(findFuzzyMatch('ma', ['Marcus', 'Martha'], (value) => value)).toBeNull();
  });
});
