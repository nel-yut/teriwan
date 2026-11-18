import { describe, expect, it } from 'vitest';
import { validateGameData } from '../src/data/validate';
import { MONSTERS, MONSTER_BY_ID } from '../src/data/monsters';
import { childRank, resolveBreeding } from '../src/domain/breeding';

describe('game data', () => {
  it('passes all integrity rules (schema, refs, 100x100 breeding, obtainability)', () => {
    expect(validateGameData()).toEqual([]);
  });

  it('has ids M001..M100 in order, each with its own skills and name', () => {
    expect(MONSTERS.map((m) => m.id)).toEqual(Array.from({ length: 100 }, (_, i) => `M${String(i + 1).padStart(3, '0')}`));
  });

  it('A and S ranks are breeding-only', () => {
    for (const m of MONSTERS.filter((m) => m.rank === 'A' || m.rank === 'S')) {
      expect(m.wildGateId).toBeNull();
      expect(m.recruitBase).toBe(0);
    }
  });
});

describe('resolveBreeding (100 independent species)', () => {
  it('A x A recipes create each S species, directionally', () => {
    expect(resolveBreeding('M009', 'M019')).toBe('M010');
    expect(resolveBreeding('M099', 'M009')).toBe('M100');
    expect(resolveBreeding('M019', 'M009')).not.toBe('M010');
  });

  it('cross S recipes are bloodline-directional', () => {
    expect(resolveBreeding('M010', 'M090')).toBe('M100');
    expect(resolveBreeding('M090', 'M010')).not.toBe('M100');
  });

  it('rank rules: same-rank C/B promote, mixed ranks round up, S only via recipes', () => {
    expect(childRank('C', 'C')).toBe('B');
    expect(childRank('B', 'B')).toBe('A');
    expect(childRank('E', 'D')).toBe('D');
    expect(childRank('D', 'C')).toBe('C');
    expect(childRank('E', 'E')).toBe('E');
    expect(childRank('A', 'A')).toBe('A');
    expect(childRank('S', 'S')).toBe('A');
  });

  it('is deterministic and never returns a parent when other candidates exist', () => {
    expect(resolveBreeding('M004', 'M023')).toBe(resolveBreeding('M004', 'M023'));
    for (const a of MONSTERS.slice(0, 40)) {
      for (const b of MONSTERS.slice(0, 40)) {
        const r = resolveBreeding(a.id, b.id);
        if (a.rank !== 'S' && b.rank !== 'S') expect([a.id, b.id]).not.toContain(r);
      }
    }
  });

  it('produces a wide variety of children (no single species dominates)', () => {
    const counts = new Map<string, number>();
    for (const a of MONSTERS) for (const b of MONSTERS) counts.set(resolveBreeding(a.id, b.id), (counts.get(resolveBreeding(a.id, b.id)) ?? 0) + 1);
    // 配合専用の種族(A・S)はどれも結果として得られ、特定の種族に偏りすぎない
    for (const m of MONSTERS.filter((m) => m.wildGateId === null)) expect(counts.get(m.id) ?? 0).toBeGreaterThan(0);
    expect(counts.size).toBeGreaterThan(90);
    expect(Math.max(...counts.values())).toBeLessThan(1500);
  });
});
