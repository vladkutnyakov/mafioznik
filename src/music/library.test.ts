import { describe, expect, it } from 'vitest';
import { pickNextIndex } from './library';

describe('выбор следующего трека', () => {
  it('по очереди идёт по кругу', () => {
    expect(pickNextIndex(null, 3, 'sequential')).toBe(0);
    expect(pickNextIndex(0, 3, 'sequential')).toBe(1);
    expect(pickNextIndex(2, 3, 'sequential')).toBe(0);
  });

  it('без треков возвращает -1', () => {
    expect(pickNextIndex(null, 0, 'sequential')).toBe(-1);
    expect(pickNextIndex(null, 0, 'shuffle')).toBe(-1);
  });

  it('вперемешку не повторяет текущий трек подряд', () => {
    for (const r of [0, 0.3, 0.5, 0.99]) {
      const next = pickNextIndex(1, 3, 'shuffle', () => r);
      expect(next).not.toBe(1);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(3);
    }
  });

  it('вперемешку с одним треком играет его же', () => {
    expect(pickNextIndex(0, 1, 'shuffle')).toBe(0);
  });
});
