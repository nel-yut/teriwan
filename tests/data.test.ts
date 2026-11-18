import { describe, expect, it } from 'vitest';
import { validateGameData } from '../src/data/validate';
import { MONSTERS, MONSTER_BY_ID } from '../src/data/monsters';
import { resolveBreeding } from '../src/domain/breeding';

describe('game data', () => {
  it('passes all integrity rules (schema, refs, 100x100 breeding, obtainability)', () => {
    expect(validateGameData()).toEqual([]);
  });

  it('has ids M001..M100 in order with 10 per family', () => {
    expect(MONSTERS.map((m) => m.id)).toEqual(Array.from({ length: 100 }, (_, i) => `M${String(i + 1).padStart(3, '0')}`));
  });

  it('A and S ranks are breeding-only', () => {
    for (const m of MONSTERS.filter((m) => m.rank === 'A' || m.rank === 'S')) {
      expect(m.wildGateId).toBeNull();
      expect(m.recruitBase).toBe(0);
    }
  });
});

describe('resolveBreeding', () => {
  it('same-family A x A gives the S species', () => {
    expect(resolveBreeding('M009', 'M009')).toBe('M010');
    expect(resolveBreeding('M099', 'M099')).toBe('M100');
  });

  it('cross-family special recipes are bloodline-directional', () => {
    expect(resolveBreeding('M010', 'M090')).toBe('M100');
    expect(resolveBreeding('M090', 'M010')).not.toBe('M100');
  });

  it('normal breeding keeps the bloodline family and never yields S', () => {
    for (const a of MONSTERS) {
      for (const b of MONSTERS) {
        const r = MONSTER_BY_ID.get(resolveBreeding(a.id, b.id))!;
        const special = r.id !== undefined && r.index === 9;
        if (!special) expect(r.family).toBe(a.family);
      }
    }
  });

  it('is deterministic', () => {
    expect(resolveBreeding('M004', 'M023')).toBe(resolveBreeding('M004', 'M023'));
  });
});
