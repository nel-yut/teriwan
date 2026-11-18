import type { GateDef, SpecialBreedRecipe, TournamentDef } from '../domain/types';

// 設計書 §4。ボス種は §4 の表に対応する図鑑 ID。
export const GATES: GateDef[] = [
  { id: 'gate01', name: '芽吹きの門', floors: 4, recommendedLevel: [1, 5], bossSpeciesId: 'M008', unlock: 'initial' },
  { id: 'gate02', name: '風鈴の門', floors: 6, recommendedLevel: [5, 11], bossSpeciesId: 'M024', unlock: 'tournament:1' },
  { id: 'gate03', name: '潮騒の門', floors: 8, recommendedLevel: [11, 17], bossSpeciesId: 'M036', unlock: 'tournament:2' },
  { id: 'gate04', name: '鉄屑の門', floors: 9, recommendedLevel: [15, 22], bossSpeciesId: 'M046', unlock: 'tournament:2' },
  { id: 'gate05', name: '炎脈の門', floors: 11, recommendedLevel: [20, 27], bossSpeciesId: 'M067', unlock: 'tournament:3' },
  { id: 'gate06', name: '白凪の門', floors: 12, recommendedLevel: [23, 30], bossSpeciesId: 'M077', unlock: 'tournament:3' },
  { id: 'gate07', name: '朧影の門', floors: 14, recommendedLevel: [28, 36], bossSpeciesId: 'M060', unlock: 'tournament:4' },
  { id: 'gate08', name: '星環の門', floors: 16, recommendedLevel: [32, 42], bossSpeciesId: 'M100', unlock: 'tournament:4' },
];

// 設計書 §3.2。rank は storyFlags.tournamentRank の到達値。
export const TOURNAMENTS: TournamentDef[] = [
  { id: 'trn1', name: '見習い', rank: 1, matches: 2, recommendedLevel: 5, requires: 'introDone', reward: 'gate02' },
  { id: 'trn2', name: '青銅', rank: 2, matches: 3, recommendedLevel: 12, requires: 'gate02Clear', reward: 'breeding,gate03,gate04' },
  { id: 'trn3', name: '白銀', rank: 3, matches: 3, recommendedLevel: 20, requires: 'gate04Clear', reward: 'gate05,gate06' },
  { id: 'trn4', name: '黄金', rank: 4, matches: 3, recommendedLevel: 28, requires: 'gate06Clear', reward: 'gate07,gate08' },
  { id: 'trn5', name: '星冠杯', rank: 5, matches: 4, recommendedLevel: [35, 42], requires: 'gate08Clear', reward: 'ending' },
];

// 設計書 §7.4 のクロス系統特殊配合(血統指定)。同系統 A×A→S は resolveBreeding が規則として扱う。
export const SPECIAL_RECIPES: SpecialBreedRecipe[] = [
  { bloodline: 'M010', partner: 'M090', result: 'M100' },
  { bloodline: 'M020', partner: 'M080', result: 'M090' },
  { bloodline: 'M030', partner: 'M070', result: 'M080' },
  { bloodline: 'M040', partner: 'M060', result: 'M070' },
  { bloodline: 'M050', partner: 'M030', result: 'M060' },
];

/** storyFlags の既知キー(§2.4) */
export const STORY_FLAG_KEYS = [
  'introDone',
  'gate01Clear',
  'gate02Clear',
  'gate03Clear',
  'gate04Clear',
  'gate05Clear',
  'gate06Clear',
  'gate07Clear',
  'gate08Clear',
  'tournamentRank',
  'breedingUnlocked',
  'endingSeen',
  'gateAnomalyResolved',
] as const;
