export const STAT_KEYS = ['hp', 'mp', 'atk', 'def', 'agi', 'int'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

export type Gender = 'M' | 'F';
export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type Personality = 'brave' | 'careful' | 'gentle' | 'wild';

/** 系統。配列順が設計書 §7.3 の系統 index。 */
export const FAMILY_IDS = [
  'sprout',
  'beast',
  'wing',
  'scale',
  'metal',
  'shade',
  'flame',
  'frost',
  'astral',
  'dragon',
] as const;
export type FamilyId = (typeof FAMILY_IDS)[number];

export type Element = 'physical' | 'fire' | 'ice' | 'wind' | 'water' | 'light' | 'shadow';
export type ResistMult = 0 | 0.5 | 1 | 1.5;

export interface MonsterSpecies {
  id: string; // M001..M100
  family: FamilyId;
  /** 系統内 index 0..9 */
  index: number;
  name: string;
  rank: Rank;
  baseStats: Stats;
  growthWeights: Stats;
  /** 1Lvあたり成長点の総量 */
  growthPoints: number;
  resistances: Partial<Record<Element, ResistMult>>;
  nativeSkillIds: string[];
  recruitBase: number;
  /** 野生で出現する場合のLv域。配合専用種は null */
  wildLevelRange: [number, number] | null;
  /** 野生で出現する門。配合専用種は null */
  wildGateId: string | null;
  assetKey: string;
}

export type SkillCategory = 'physical' | 'spell' | 'breath' | 'support' | 'status' | 'heal' | 'special';
export type SkillTarget = 'enemy1' | 'enemyAll' | 'enemyRandom2' | 'ally1' | 'allyAll';

export interface SkillDef {
  id: string;
  name: string;
  category: SkillCategory;
  element: Element | 'none';
  target: SkillTarget;
  mp: number;
  /** 威力。物理は攻撃倍率、呪文系は基礎威力 */
  power: number;
  /** 呪文系の INT 係数 */
  intScale: number;
  effect?: string;
  learnLevel: number;
  requires: Partial<Stats>;
}

export interface ItemDef {
  id: string;
  name: string;
  price: number | null; // null = 売却/購入不可
  effect: string;
  maxStack: number;
  recruitBonus?: number;
  permStat?: { stat: StatKey; amount: number };
}

export interface GateDef {
  id: string;
  name: string;
  floors: number;
  recommendedLevel: [number, number];
  bossSpeciesId: string;
  unlock: string;
}

export interface TournamentDef {
  id: string;
  name: string;
  rank: number;
  matches: number;
  recommendedLevel: number | [number, number];
  requires: string;
  reward: string;
}

export interface SpecialBreedRecipe {
  bloodline: string;
  partner: string;
  result: string;
}
