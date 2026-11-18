import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/domain/rng';
import {
  IdbSaveStore,
  MemorySaveStore,
  createNewSave,
  parseSave,
  serializeSave,
  type MonsterInstance,
  type SaveData,
} from '../src/infrastructure/save';

describe('Rng', () => {
  it('same seed gives same sequence', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()));
  });

  it('restoring state continues the same sequence', () => {
    const a = new Rng('abc');
    a.next();
    const state = a.getState();
    const expected = [a.next(), a.next(), a.next()];
    const b = new Rng(0);
    b.setState(state);
    expect([b.next(), b.next(), b.next()]).toEqual(expected);
  });

  it('int stays in range', () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});

function sampleSave(): SaveData {
  const m: MonsterInstance = {
    uuid: 'u1',
    speciesId: 'M001',
    gender: 'M',
    level: 1,
    exp: 0,
    plus: 0,
    stats: { hp: 10, mp: 4, atk: 5, def: 5, agi: 5, int: 5 },
    currentHp: 10,
    currentMp: 4,
    knownSkillIds: ['SK19'],
    inheritedSkillCandidates: [],
    status: [],
    personality: 'gentle',
  };
  const s = createNewSave('s1', 42, '2026-11-18T00:00:00Z');
  s.monsters['u1'] = m;
  s.partyUuids = ['u1'];
  return s;
}

describe('save format', () => {
  it('round-trips', () => {
    const s = sampleSave();
    const r = parseSave(serializeSave(s));
    expect(r.ok && r.save).toEqual(s);
  });

  it('detects tampering via hash', () => {
    const text = serializeSave(sampleSave()).replace('999999', '1').replace('"gold\\":100', '"gold\\":999');
    expect(parseSave(text).ok).toBe(false);
  });

  it('rejects dangling references', () => {
    const s = sampleSave();
    s.partyUuids = ['ghost'];
    expect(parseSave(serializeSave(s)).ok).toBe(false);
  });

  it('rejects saves from a newer schema', () => {
    const body = JSON.stringify({ ...sampleSave(), schemaVersion: 99 });
    const r = parseSave(JSON.stringify({ hash: 'x', body }));
    expect(r.ok).toBe(false);
  });
});

describe.each([
  ['memory', () => new MemorySaveStore()],
  ['indexeddb', () => new IdbSaveStore(`t-${Math.random()}`)],
])('%s store', (_n, make) => {
  it('writes, reads, keeps one backup, and recovers from corruption', async () => {
    const store = make();
    expect(await store.read(0)).toBeNull();
    const s1 = sampleSave();
    await store.write(0, s1);
    const s2 = { ...s1, gold: 500 };
    await store.write(0, s2);
    const cur = await store.read(0);
    expect(cur?.result.ok && cur.result.save.gold).toBe(500);
    expect(cur?.usedBackup).toBe(false);

    // 本体を壊してバックアップから復旧(Memory 版のみ直接破損させられる)
    if (!(store instanceof MemorySaveStore)) return;
    store.data.set('slot0', 'garbage');
    const rec = await store.read(0);
    expect(rec?.usedBackup).toBe(true);
    expect(rec?.result.ok && rec.result.save.gold).toBe(100);
  });

  it('refuses invalid slots and invalid data without touching existing save', async () => {
    const store = make();
    await expect(store.write(5, sampleSave())).rejects.toThrow();
    await store.write(1, sampleSave());
    const bad = sampleSave();
    bad.partyUuids = ['ghost'];
    await expect(store.write(1, bad)).rejects.toThrow();
    const r = await store.read(1);
    expect(r?.result.ok).toBe(true);
  });
});
