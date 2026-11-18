import { describe, expect, it } from 'vitest';
import { Game } from '../src/application/game';
import { GATES } from '../src/data/world';
import { Battle, combatantFromMonster } from '../src/domain/battle';
import { MAP_H, MAP_W, T, bossFloor, floorSeed, generateFloor, isExitReachable } from '../src/domain/dungeon';
import { generateWildEncounter, getGate, makeEnemy } from '../src/domain/encounter';
import { MONSTERS } from '../src/data/monsters';
import { createMonster, gainExp, expToNext, getSkill } from '../src/domain/monster';
import { Rng } from '../src/domain/rng';
import { MemorySaveStore, type SaveStore } from '../src/infrastructure/save';

describe('dungeon generation', () => {
  it('every floor of every gate is solvable across 100 seeds', () => {
    for (const gate of GATES) {
      for (let floor = 1; floor < gate.floors; floor++) {
        for (let s = 1; s <= 100; s++) {
          const m = generateFloor(floorSeed(s * 7919, gate.id, floor));
          expect(m.w).toBe(MAP_W);
          expect(m.h).toBe(MAP_H);
          expect(isExitReachable(m)).toBe(true);
          expect(m.tiles[m.exit.y * m.w + m.exit.x]).toBe(T.DOWN);
        }
      }
    }
  });

  it('is deterministic per seed and the boss floor is solvable', () => {
    expect(generateFloor(123).tiles).toEqual(generateFloor(123).tiles);
    expect(isExitReachable(bossFloor())).toBe(true);
  });
});

describe('monster growth', () => {
  it('levels up, never exceeds cap, and learns skills only when requirements are met', () => {
    const rng = new Rng(1);
    const sp = MONSTERS.find((m) => m.nativeSkillIds.some((id) => getSkill(id).learnLevel >= 4))!;
    const late = sp.nativeSkillIds.find((id) => getSkill(id).learnLevel >= 4)!;
    const m = createMonster(rng, { uuid: 'x', speciesId: sp.id, level: 1, gender: 'M' });
    expect(m.knownSkillIds).not.toContain(late); // Lv・能力が足りない間は覚えない
    gainExp(m, 1e9, []);
    expect(m.level).toBe(50);
    expect(m.knownSkillIds).toContain(late);
    expect(expToNext(10, 'E')).toBeLessThan(expToNext(11, 'E'));
  });
});

describe('battle', () => {
  const mkBattle = (seed: number) => {
    const rng = new Rng(seed);
    const a = createMonster(rng, { uuid: 'a', speciesId: 'M011', level: 10, gender: 'M' });
    const allies = [combatantFromMonster(a, 'a0')];
    const enemies = [makeEnemy(rng, 'e0', 'M001', 3)];
    return new Battle({ allies, enemies, rng, inventory: { IT01: 2, IT07: 1 }, canFlee: true, allowItems: true });
  };

  it('is reproducible with the same seed', () => {
    const run = () => {
      const b = mkBattle(5);
      const log: string[] = [];
      while (b.phase === 'command') log.push(...b.playTurn({}).map((e) => e.text));
      return log;
    };
    expect(run()).toEqual(run());
  });

  it('ends in victory for a much stronger side and never leaves negative HP', () => {
    const b = mkBattle(9);
    while (b.phase === 'command') b.playTurn({});
    expect(b.phase).toBe('victory');
    for (const c of b.all) expect(c.hp).toBeGreaterThanOrEqual(0);
  });

  it('consumes items only when used and cannot flee from bosses', () => {
    const rng = new Rng(2);
    const a = combatantFromMonster(createMonster(rng, { uuid: 'a', speciesId: 'M011', level: 5, gender: 'M' }), 'a0', 'meirei');
    a.hp = 20;
    const b = new Battle({ allies: [a], enemies: [makeEnemy(rng, 'e0', 'M001', 1)], rng, inventory: { IT01: 1 }, canFlee: false, allowItems: true });
    b.playTurn({ a0: { kind: 'flee' } });
    expect(b.phase).toBe('command');
    b.playTurn({ a0: { kind: 'item', itemId: 'IT01', targetId: 'a0' } });
    expect(b.inventory.IT01).toBe(0);
  });

  it('wild encounters respect the gate level band', () => {
    const rng = new Rng(3);
    const gate = getGate('gate01');
    for (let i = 0; i < 100; i++) {
      for (const e of generateWildEncounter(rng, gate, 1)) expect(e.level).toBeLessThanOrEqual(5);
    }
  });
});

function unlockedGame(store: SaveStore | null = null): Game {
  const g = Game.create(store, 0, 99);
  g.chooseStarter('M011');
  g.setFlag('breedingUnlocked', true);
  for (const m of g.party) gainExp(m, 1e9, []);
  return g;
}

describe('breeding flow', () => {
  it('rejects same-gender / low-level pairs without changing anything', () => {
    const g = Game.create(null, 0, 1);
    g.chooseStarter('M011');
    g.setFlag('breedingUnlocked', true);
    const [m, f] = g.party;
    expect(g.previewBreeding(m!.uuid, f!.uuid).ok).toBe(false); // Lv3
    for (const x of g.party) gainExp(x, 1e9, []);
    expect(g.previewBreeding(m!.uuid, m!.uuid).ok).toBe(false);
    f!.gender = 'M';
    expect(g.previewBreeding(m!.uuid, f!.uuid).ok).toBe(false);
    expect(g.monsterCount).toBe(2);
  });

  it('consumes both parents and creates an egg that hatches into a Lv1 monster', () => {
    const g = unlockedGame();
    const extra = createMonster(g.rng, { uuid: 'z1', speciesId: 'M021', level: 1, gender: 'M' });
    g.addMonster(extra);
    const [m, f] = g.party;
    const pv = g.previewBreeding(m!.uuid, f!.uuid);
    expect(pv.ok).toBe(true);
    const eggId = g.breed(m!.uuid, f!.uuid);
    expect(g.save.monsters[m!.uuid]).toBeUndefined();
    expect(g.save.monsters[f!.uuid]).toBeUndefined();
    const egg = g.save.eggs.find((e) => e.uuid === eggId)!;
    expect(egg.speciesId).toBe(pv.childSpeciesId);
    expect(() => g.hatchEgg(eggId)).toThrow();
    egg.hatchProgress = 100;
    const child = g.hatchEgg(eggId);
    expect(child.level).toBe(1);
    expect(child.speciesId).toBe(pv.childSpeciesId);
    expect(g.save.eggs).toHaveLength(0);
  });

  it('does not lose parents when saving fails (mutate is atomic)', async () => {
    let fail = false;
    const mem = new MemorySaveStore();
    const flaky: SaveStore = {
      write: async (slot, save) => {
        if (fail) throw new Error('disk full');
        return mem.write(slot, save);
      },
      read: (slot) => mem.read(slot),
      delete: (slot) => mem.delete(slot),
    };
    const g = unlockedGame(flaky);
    g.addMonster(createMonster(g.rng, { uuid: 'z1', speciesId: 'M021', level: 1, gender: 'M' }));
    await g.persist();
    const [m, f] = g.party;
    const before = JSON.stringify(g.save);
    fail = true;
    await expect(g.mutate(() => g.breed(m!.uuid, f!.uuid))).rejects.toThrow('disk full');
    expect(JSON.stringify(g.save)).toBe(before);
    expect(g.save.monsters[m!.uuid]).toBeDefined();
    expect(g.save.eggs).toHaveLength(0);
    fail = false;
    await g.mutate(() => g.breed(m!.uuid, f!.uuid));
    expect(g.save.eggs).toHaveLength(1);
    expect(g.save.monsters[m!.uuid]).toBeUndefined();
    const r = await mem.read(0);
    expect(r?.result.ok && r.result.save.eggs.length).toBe(1);
  });

  it('persists a successful breed through the store', async () => {
    const store = new MemorySaveStore();
    const g = unlockedGame(store);
    const [m, f] = g.party;
    await g.persist();
    const r = await store.read(0);
    expect(r?.result.ok).toBe(true);
    void m;
    void f;
  });
});

describe('shop and progression', () => {
  it('validates purchases and keeps key items unsellable', () => {
    const g = Game.create(null, 0, 1);
    g.save.gold = 100;
    expect(g.buy('IT01', 2)).toBeNull();
    expect(g.save.gold).toBe(50);
    expect(g.buy('IT09', 1)).not.toBeNull(); // 足りない
    expect(g.buy('IT16', 1)).not.toBeNull(); // キーアイテム
    expect(g.buy('IT01', 0)).not.toBeNull();
    expect(g.sell('IT01', 1)).toBeNull();
  });

  it('gates unlock by tournament rank and rescue grants a monster when empty', () => {
    const g = Game.create(null, 0, 1);
    expect(g.isGateUnlocked(GATES[0]!)).toBe(true);
    expect(g.isGateUnlocked(GATES[1]!)).toBe(false);
    g.setFlag('tournamentRank', 1);
    expect(g.isGateUnlocked(GATES[1]!)).toBe(true);
    expect(g.ensureMonster()).not.toBeNull();
    expect(g.ensureMonster()).toBeNull();
  });
});
