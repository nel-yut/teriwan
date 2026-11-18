import type { SkillDef } from '../domain/types';

type Row = [
  id: string,
  name: string,
  category: SkillDef['category'],
  element: SkillDef['element'],
  target: SkillDef['target'],
  mp: number,
  power: number,
  intScale: number,
  learnLevel: number,
  requires: SkillDef['requires'],
  effect?: string,
];

// 設計書 §8。威力は本作暫定値。
const rows: Row[] = [
  ['SK01', 'かみつき', 'physical', 'physical', 'enemy1', 0, 1.1, 0, 1, { atk: 5 }],
  ['SK02', 'とびかかり', 'physical', 'physical', 'enemy1', 2, 1.4, 0, 8, { atk: 20 }],
  ['SK03', '乱れひっかき', 'physical', 'physical', 'enemyRandom2', 6, 0.8, 0, 18, { atk: 55 }],
  ['SK04', '盾くだき', 'physical', 'physical', 'enemy1', 4, 0.8, 0, 12, { atk: 30 }, 'def-down'],
  ['SK05', 'ひのこ弾', 'spell', 'fire', 'enemy1', 3, 18, 0.25, 4, { int: 12 }],
  ['SK06', '火炎の渦', 'spell', 'fire', 'enemyAll', 9, 35, 0.3, 18, { int: 55 }],
  ['SK07', '霊火', 'spell', 'fire', 'enemy1', 16, 75, 0.4, 32, { int: 110 }],
  ['SK08', '氷つぶて', 'spell', 'ice', 'enemy1', 3, 18, 0.25, 4, { int: 12 }],
  ['SK09', '霜風', 'spell', 'ice', 'enemyAll', 9, 35, 0.3, 18, { int: 55 }],
  ['SK10', '白夜の息', 'breath', 'ice', 'enemyAll', 16, 68, 0, 32, { hp: 140 }],
  ['SK11', 'そよ風刃', 'spell', 'wind', 'enemy1', 3, 18, 0.25, 4, { int: 12 }],
  ['SK12', '大嵐', 'spell', 'wind', 'enemyAll', 12, 51, 0.3, 24, { int: 85 }],
  ['SK13', '水弾', 'spell', 'water', 'enemy1', 3, 18, 0.25, 4, { int: 12 }],
  ['SK14', '大潮', 'spell', 'water', 'enemyAll', 12, 51, 0.3, 24, { int: 85 }],
  ['SK15', '光の粒', 'spell', 'light', 'enemy1', 4, 22, 0.25, 8, { int: 20 }],
  ['SK16', '星落とし', 'spell', 'light', 'enemyAll', 16, 68, 0.4, 35, { int: 120 }],
  ['SK17', '影矢', 'spell', 'shadow', 'enemy1', 4, 22, 0.25, 8, { int: 20 }],
  ['SK18', '朧の帳', 'support', 'shadow', 'enemyAll', 8, 0, 0, 20, { int: 70 }, 'accuracy-down:3'],
  ['SK19', '小さな癒し', 'heal', 'none', 'ally1', 3, 25, 0.25, 5, { int: 12 }],
  ['SK20', '癒しの光', 'heal', 'none', 'ally1', 8, 70, 0.35, 18, { int: 50 }],
  ['SK21', 'みんなの癒し', 'heal', 'none', 'allyAll', 16, 60, 0.3, 28, { int: 90 }],
  ['SK22', '目覚めの声', 'heal', 'none', 'ally1', 4, 0, 0, 8, { int: 18 }, 'cure:sleep'],
  ['SK23', '清めの雫', 'heal', 'none', 'ally1', 5, 0, 0, 10, { int: 25 }, 'cure:poison,paralysis'],
  ['SK24', 'よみがえり', 'heal', 'none', 'ally1', 18, 0, 0, 35, { int: 100 }, 'revive:0.3'],
  ['SK25', '守りの歌', 'support', 'none', 'allyAll', 7, 0, 0, 13, { int: 30 }, 'def-up:0.25:3'],
  ['SK26', '力の歌', 'support', 'none', 'allyAll', 7, 0, 0, 13, { int: 30 }, 'atk-up:0.25:3'],
  ['SK27', 'ねむり粉', 'status', 'none', 'enemy1', 5, 0, 0, 10, { int: 25 }, 'inflict:sleep'],
  ['SK28', 'しびれ糸', 'status', 'none', 'enemy1', 6, 0, 0, 14, { int: 35 }, 'inflict:paralysis'],
  ['SK29', '毒のしずく', 'status', 'none', 'enemy1', 4, 0, 0, 8, { int: 20 }, 'inflict:poison'],
  ['SK30', '星脈共鳴', 'special', 'light', 'enemyAll', 24, 90, 0.5, 42, { int: 160 }],
];

export const SKILLS: SkillDef[] = rows.map(
  ([id, name, category, element, target, mp, power, intScale, learnLevel, requires, effect]) => ({
    id,
    name,
    category,
    element,
    target,
    mp,
    power,
    intScale,
    learnLevel,
    requires,
    ...(effect ? { effect } : {}),
  }),
);

/** 合成習得(設計書 §8.1)。入力技をすべて習得済みで条件を満たすと output をひらめく。 */
export const SKILL_FUSIONS: { inputs: string[]; output: string }[] = [
  { inputs: ['SK05', 'SK08', 'SK11'], output: 'SK16' },
  { inputs: ['SK19', 'SK20'], output: 'SK21' },
];
