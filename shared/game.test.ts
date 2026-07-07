import { describe, expect, it } from 'vitest';
import { calculateAccuracy, isGameplayPhaseOpen } from './game';

describe('calculateAccuracy', () => {
  it('returns 0 when there are no accusations yet', () => {
    expect(calculateAccuracy(0, 0)).toBe(0);
  });

  it('returns a rounded percentage when attempts exist', () => {
    expect(calculateAccuracy(3, 1)).toBe(75);
    expect(calculateAccuracy(2, 3)).toBe(40);
  });
});

describe('isGameplayPhaseOpen', () => {
  it('returns true only for the investigation phase', () => {
    expect(isGameplayPhaseOpen('investigation_open')).toBe(true);
    expect(isGameplayPhaseOpen('scene_intro')).toBe(false);
    expect(isGameplayPhaseOpen('timeout_reveal')).toBe(false);
  });
});
