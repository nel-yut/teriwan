import { MONSTERS } from '../data/monsters';
import { GATES } from '../data/world';
import { Battle, combatantFromMonster, type Combatant } from './battle';
import { createMonster, expToNext, getSpecies } from './monster';
import { Rng } from './rng';
import type { GateDef, Rank, TournamentDef } from './types';

export const GOLD_PER_LEVEL: Record<Rank, number> = { E: 3, D: 5, C: 8, B: 13, A: 20, S: 30 };
/** 敵 1 体あたりの経験値 = その敵Lvで次のLvに必要な経験値 × 係数 + 固定6(本作暫定) */
/** レベルが高いほど 1 レベルに必要な戦闘回数が増える(Lv3≒4戦、Lv20≒7戦、Lv40≒11戦が目安) */
const expRatio = (level: number) => 0.12 / (1 + level / 15);

export function getGate(id: string): GateDef {
  const g = GATES.find((x) => x.id === id);
  if (!g) throw new Error(`unknown gate ${id}`);
  return g;
}

/** 階ごとの敵Lv範囲。最終階はボス階。 */
export function floorLevelRange(gate: GateDef, floor: number): [number, number] {
  const [lo, hi] = gate.recommendedLevel;
  const t = gate.floors <= 1 ? 1 : (floor - 1) / (gate.floors - 1);
  const mid = lo + (hi - lo) * t;
  return [Math.max(1, Math.round(mid - 1)), Math.max(1, Math.round(mid + 1))];
}

export function wildPool(gate: GateDef, floor: number): { speciesId: string; weight: number }[] {
  const [, hi] = floorLevelRange(gate, floor);
  const nearBottom = floor >= gate.floors - 1;
  const out: { speciesId: string; weight: number }[] = [];
  for (const m of MONSTERS) {
    if (m.wildGateId !== gate.id || !m.wildLevelRange) continue;
    const [min] = m.wildLevelRange;
    if (m.rank === 'B') {
      if (nearBottom) out.push({ speciesId: m.id, weight: 0.5 });
    } else if (min <= hi + 1) out.push({ speciesId: m.id, weight: m.rank === 'E' ? 3 : m.rank === 'D' ? 2.5 : 1.5 });
  }
  return out;
}

export function weightedPick<T extends { weight: number }>(rng: Rng, items: T[]): T {
  const total = items.reduce((a, i) => a + i.weight, 0);
  let r = rng.next() * total;
  for (const i of items) {
    r -= i.weight;
    if (r <= 0) return i;
  }
  return items[items.length - 1]!;
}

export function makeEnemy(rng: Rng, id: string, speciesId: string, level: number, opts: { boss?: boolean } = {}): Combatant {
  const m = createMonster(rng, { uuid: id, speciesId, level, gender: 'M' });
  // 敵は習得可能な固有技をすべて使える
  const sp = getSpecies(speciesId);
  m.knownSkillIds = [...new Set([...m.knownSkillIds, ...sp.nativeSkillIds.filter((s) => level >= 1)])];
  const c = combatantFromMonster(m, id, 'bacchiri');
  c.side = 'enemy';
  delete c.uuid;
  c.isBoss = !!opts.boss;
  if (opts.boss) {
    c.maxHp = Math.floor(c.maxHp * 2.2);
    c.hp = c.maxHp;
    c.atk = Math.floor(c.atk * 1.1);
    c.strategy = 'gungan';
  }
  // 技の MP が不足しないよう敵は少し多めに持つ
  c.maxMp = Math.floor(c.maxMp * 1.3);
  c.mp = c.maxMp;
  return c;
}

export function generateWildEncounter(rng: Rng, gate: GateDef, floor: number): Combatant[] {
  const pool = wildPool(gate, floor);
  const [lo, hi] = floorLevelRange(gate, floor);
  const n = floor <= 2 ? rng.pick([1, 1, 2]) : rng.pick([1, 2, 2, 3, 3]);
  const out: Combatant[] = [];
  for (let i = 0; i < n; i++) {
    const p = weightedPick(rng, pool);
    const sp = getSpecies(p.speciesId);
    const bump = sp.rank === 'B' ? 2 : 0;
    out.push(makeEnemy(rng, `e${i}`, p.speciesId, rng.int(lo, hi) + bump));
  }
  return out;
}

export function generateBossParty(rng: Rng, gate: GateDef): Combatant[] {
  const boss = getSpecies(gate.bossSpeciesId);
  const lvl = gate.recommendedLevel[1] + 2;
  const minions = MONSTERS.filter((m) => m.family === boss.family && m.wildGateId !== null && m.rank !== 'B' && m.rank !== 'A' && m.rank !== 'S');
  const out = [makeEnemy(rng, 'e0', boss.id, lvl, { boss: true })];
  if (minions.length) {
    for (let i = 1; i <= 2; i++) out.push(makeEnemy(rng, `e${i}`, rng.pick(minions).id, Math.max(1, lvl - 3)));
  }
  return out;
}

// ---- 大会 ----

const TOURNAMENT_POOL_RANK: Record<number, Rank[]> = {
  1: ['E', 'D'],
  2: ['D', 'C'],
  3: ['C', 'B'],
  4: ['B', 'A'],
  5: ['A', 'S'],
};

export const TRAINER_NAMES: Record<string, string[]> = {
  trn1: ['見習いの少年', '旅の少女'],
  trn2: ['育成所の弟子', '旅商人セル', 'ライバル リナ'],
  trn3: ['調律師見習い', '門番ダン', 'ライバル リナ'],
  trn4: ['黄金の紳士', '双子の幻獣使い', 'ライバル リナ'],
  trn5: ['古参の調教師', '調律師ノクティス', 'ライバル リナ', '前王者 エラ'],
};

/** 固定シードの対戦相手(再挑戦しても同じ編成) */
export function tournamentOpponents(t: TournamentDef, match: number): Combatant[] {
  const rng = new Rng(`${t.id}:${match}`);
  const baseLevel = Array.isArray(t.recommendedLevel) ? t.recommendedLevel[0] : t.recommendedLevel;
  const level = t.rank >= 5 ? baseLevel + match * 2 : Math.max(1, baseLevel - 3 + match);
  const ranks = TOURNAMENT_POOL_RANK[t.rank] ?? ['E'];
  const last = match === t.matches - 1;
  // 序盤の試合は下位ランクのみ、最終戦で上位ランクが混ざる
  const allowed = last ? ranks : ranks.slice(0, 1);
  const pool = MONSTERS.filter((m) => allowed.includes(m.rank));
  const out: Combatant[] = [];
  for (let i = 0; i < 3; i++) {
    const sp = rng.pick(pool);
    const c = makeEnemy(rng, `e${i}`, sp.id, level + (last && i === 0 ? 1 : 0), { boss: false });
    c.strategy = last ? 'gungan' : 'bacchiri';
    out.push(c);
  }
  return out;
}

// ---- 報酬 ----

export interface BattleRewards {
  expPerAlly: number;
  gold: number;
  /** 孵化進行に使う合計経験値 */
  hatchPoints: number;
}

export function computeRewards(battle: Battle): BattleRewards {
  let exp = 0;
  let gold = 0;
  let avgEnemyLevel = 0;
  for (const e of battle.enemies) {
    const sp = getSpecies(e.speciesId);
    exp += Math.round(expToNext(e.level, sp.rank) * expRatio(e.level)) + 6;
    gold += e.level * GOLD_PER_LEVEL[sp.rank];
    avgEnemyLevel += e.level;
  }
  avgEnemyLevel /= Math.max(1, battle.enemies.length);
  const avgAlly = battle.allies.reduce((a, c) => a + c.level, 0) / Math.max(1, battle.allies.length);
  const factor = Math.min(2, Math.max(0.5, 1 + (avgEnemyLevel - avgAlly) * 0.08));
  return { expPerAlly: Math.max(1, Math.round(exp * factor)), gold: Math.round(gold), hatchPoints: 8 + Math.round(exp * factor * 0.25) };
}

/** 加入判定(§6.4)。最大 1 体。成功したら敵 Combatant を返す。 */
export function rollRecruit(rng: Rng, battle: Battle): Combatant | null {
  const cands = battle.enemies.filter((e) => !e.isBoss);
  const order = [...cands].sort(() => rng.next() - 0.5);
  for (const e of order) {
    const p = Math.min(0.8, getSpecies(e.speciesId).recruitBase * battle.recruitMultiplier);
    if (rng.chance(p)) return e;
  }
  return null;
}
