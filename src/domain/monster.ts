import { MONSTER_BY_ID } from '../data/monsters';
import { SKILLS } from '../data/skills';
import type { MonsterInstance } from '../infrastructure/save';
import type { Rng } from './rng';
import { STAT_KEYS, type Gender, type MonsterSpecies, type Personality, type Rank, type StatKey, type Stats } from './types';

export const RANK_EXP_FACTOR: Record<Rank, number> = { E: 0.7, D: 0.85, C: 1.0, B: 1.15, A: 1.3, S: 1.5 };
export const MAX_SKILLS = 8;
export const MAX_CANDIDATES = 16;
const STAT_CAP = 999;
/** 成長点を HP/MP に換算する倍率(本作暫定) */
const STAT_SCALE: Record<StatKey, number> = { hp: 2.2, mp: 1, atk: 1, def: 1, agi: 1, int: 1 };

const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));
export const getSkill = (id: string) => {
  const s = SKILL_BY_ID.get(id);
  if (!s) throw new Error(`unknown skill ${id}`);
  return s;
};
export const getSpecies = (id: string): MonsterSpecies => {
  const s = MONSTER_BY_ID.get(id);
  if (!s) throw new Error(`unknown species ${id}`);
  return s;
};

export const zeroStats = (): Stats => ({ hp: 0, mp: 0, atk: 0, def: 0, agi: 0, int: 0 });

/** 設計書 §5.3(本作暫定式) */
export function expToNext(level: number, rank: Rank): number {
  return Math.round(10 * Math.pow(level, 1.65) * RANK_EXP_FACTOR[rank]);
}

export function levelCap(plus: number): number {
  return Math.min(99, 50 + plus);
}

/** Lv と加算値から最大能力値を計算。 */
export function computeStats(species: MonsterSpecies, level: number, bonus: Stats): Stats {
  const w = species.growthWeights;
  const sum = STAT_KEYS.reduce((a, k) => a + w[k], 0);
  const out = zeroStats();
  for (const k of STAT_KEYS) {
    const growth = Math.floor(((species.growthPoints * w[k]) / sum) * STAT_SCALE[k] * (level - 1));
    const v = species.baseStats[k] + growth + bonus[k];
    out[k] = Math.max(k === 'hp' ? 1 : 0, Math.min(STAT_CAP, v));
  }
  return out;
}

export function newUuid(rng: Rng, taken?: (id: string) => boolean): string {
  for (;;) {
    const id = Array.from({ length: 4 }, () => rng.int(0, 0xffff).toString(16).padStart(4, '0')).join('');
    if (!taken || !taken(id)) return id;
  }
}

export function meetsRequirements(stats: Stats, req: Partial<Stats>): boolean {
  return (Object.keys(req) as StatKey[]).every((k) => stats[k] >= (req[k] ?? 0));
}

export interface CreateMonsterOptions {
  uuid: string;
  speciesId: string;
  level: number;
  gender: Gender;
  personality?: Personality;
  plus?: number;
  bonusStats?: Stats;
  inheritedSkillCandidates?: string[];
}

export function createMonster(rng: Rng, o: CreateMonsterOptions): MonsterInstance {
  const sp = getSpecies(o.speciesId);
  const bonus = o.bonusStats ?? zeroStats();
  const stats = computeStats(sp, o.level, bonus);
  const m: MonsterInstance = {
    uuid: o.uuid,
    speciesId: o.speciesId,
    gender: o.gender,
    level: o.level,
    exp: 0,
    plus: o.plus ?? 0,
    bonusStats: bonus,
    stats,
    currentHp: stats.hp,
    currentMp: stats.mp,
    knownSkillIds: [],
    inheritedSkillCandidates: [...(o.inheritedSkillCandidates ?? [])].filter((s) => !sp.nativeSkillIds.includes(s)).slice(0, MAX_CANDIDATES),
    status: [],
    personality: o.personality ?? rng.pick(['brave', 'careful', 'gentle', 'wild'] as const),
  };
  learnNewSkills(m);
  return m;
}

/** 条件を満たした固有技・継承候補を習得(上限 8)、続けて合成習得。新規習得した技 ID を返す。 */
export function learnNewSkills(m: MonsterInstance): string[] {
  const sp = getSpecies(m.speciesId);
  const learned: string[] = [];
  const pool = [...sp.nativeSkillIds, ...m.inheritedSkillCandidates];
  for (const id of pool) {
    if (m.knownSkillIds.includes(id) || m.knownSkillIds.length >= MAX_SKILLS) continue;
    const sk = getSkill(id);
    if (m.level >= sk.learnLevel && meetsRequirements(m.stats, sk.requires)) {
      m.knownSkillIds.push(id);
      learned.push(id);
    }
  }
  return learned;
}

/** 合成習得(§8.1)。入力技をすべて習得済みで、出力技の条件も満たすとひらめく。 */
export function tryFusionLearn(
  m: MonsterInstance,
  fusions: { inputs: string[]; output: string }[],
): string[] {
  const learned: string[] = [];
  for (const f of fusions) {
    if (m.knownSkillIds.includes(f.output) || m.knownSkillIds.length >= MAX_SKILLS) continue;
    if (!f.inputs.every((i) => m.knownSkillIds.includes(i))) continue;
    const sk = getSkill(f.output);
    if (m.level >= sk.learnLevel && meetsRequirements(m.stats, sk.requires)) {
      m.knownSkillIds.push(f.output);
      learned.push(f.output);
    }
  }
  return learned;
}

export interface LevelUpResult {
  levelsGained: number;
  learned: string[];
}

export function recomputeStats(m: MonsterInstance): void {
  const sp = getSpecies(m.speciesId);
  const old = m.stats;
  const next = computeStats(sp, m.level, m.bonusStats);
  m.stats = next;
  m.currentHp = Math.min(next.hp, m.currentHp + Math.max(0, next.hp - old.hp));
  m.currentMp = Math.min(next.mp, m.currentMp + Math.max(0, next.mp - old.mp));
}

export function gainExp(m: MonsterInstance, amount: number, fusions: { inputs: string[]; output: string }[]): LevelUpResult {
  const sp = getSpecies(m.speciesId);
  const cap = levelCap(m.plus);
  const res: LevelUpResult = { levelsGained: 0, learned: [] };
  if (m.level >= cap) return res;
  m.exp += amount;
  while (m.level < cap && m.exp >= expToNext(m.level, sp.rank)) {
    m.exp -= expToNext(m.level, sp.rank);
    m.level += 1;
    res.levelsGained += 1;
  }
  if (m.level >= cap) m.exp = 0;
  if (res.levelsGained > 0) {
    recomputeStats(m);
    res.learned.push(...learnNewSkills(m), ...tryFusionLearn(m, fusions));
  }
  return res;
}

export function healFully(m: MonsterInstance): void {
  m.currentHp = m.stats.hp;
  m.currentMp = m.stats.mp;
  m.status = [];
}

export function monsterName(m: MonsterInstance): string {
  return m.nickname ?? getSpecies(m.speciesId).name;
}
