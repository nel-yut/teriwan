export const STAT_KEYS = ['hp', 'mp', 'atk', 'def', 'agi', 'int'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

export type Gender = 'M' | 'F';
export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type Personality = 'brave' | 'careful' | 'gentle' | 'wild';

/**
 * ドット絵の体型テンプレート(見た目の内部名)。ゲームのルール(配合・耐性・特技)には使わない。
 * ルール上は 100 種がそれぞれ独立した種族(1 種族 = 1 系統)。
 */
export const ART_SHAPES = ['sprout', 'beast', 'wing', 'scale', 'metal', 'shade', 'flame', 'frost', 'astral', 'dragon'] as const;
export type ArtShape = (typeof ART_SHAPES)[number];

export type Element = 'physical' | 'fire' | 'ice' | 'wind' | 'water' | 'light' | 'shadow';
export type ResistMult = 0 | 0.5 | 1 | 1.5;

export interface MonsterSpecies {
  id: string; // M001..M100
  /** 図鑑番号 1..100 */
  no: number;
  art: { shape: ArtShape; variant: number };
  /** 配合の相性ベクトル(各 0..1)。子は両親の相性に近い種族になる */
  traits: [number, number, number, number];
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
