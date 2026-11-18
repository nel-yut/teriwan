import { FAMILY_IDS, type Element, type FamilyId, type MonsterSpecies, type Rank, type ResistMult, type Stats } from '../domain/types';

/** 設計書 §5.2。各系統 10 種、配列順 = 系統内 index。 */
const NAMES: Record<FamilyId, string[]> = {
  sprout: ['コケマル', 'タネピィ', 'ツルリン', 'ハナモコ', 'ネムリバナ', 'イバラコ', 'キノコロ', 'モリノコ', 'サクラニア', '樹冠王ユグラ'],
  beast: ['コロガル', 'ホシネコ', 'ツノウサ', 'ハネイヌ', 'ヤマネコダ', 'ハイエナイト', 'ガルヴォル', 'シシオウ', '雷牙レオル', '白銀獣ヴァルガ'],
  wing: ['ピヨル', 'カゼスズ', 'アカハネ', 'フクロウル', 'カササギア', 'ワタリドリ', 'カラスミラ', 'クジャラン', '嵐翼ガルダ', '天翔鳥セレス'],
  scale: ['ミズコ', 'カメロ', 'ウロコン', 'トカゲラン', 'サンゴヘビ', 'カイリュム', 'ヌマトカゲ', 'コウラドン', '海鱗ネプタ', '碧甲竜オルム'],
  metal: ['イシコロ', 'カネタマ', 'ハグルン', 'ドウグマ', 'スズノコ', 'ゴロゴレム', 'ギアワーム', 'クロガネオ', '機神バルク', '星鋼巨兵アスト'],
  shade: ['ヒトダマル', 'カゲフワ', 'ユメクイ', 'ヨルカサ', 'オバケラ', 'クモリビト', 'ヌエカゲ', 'ヤミモリ', '冥灯ルクス', '影王ノクス'],
  flame: ['ヒノコ', 'トモシビ', 'ホムラコ', 'カマドン', 'ボウエン', 'カエンジカ', 'セキエン', 'バクエンオ', '炎帝ラグナ', '太陽霊ソル'],
  frost: ['シモマル', 'ユキンコ', 'コオリネ', 'ツラララ', 'ヒョウガメ', 'ミゾレッタ', 'フブキオ', 'クリスタルン', '氷妃ネーヴェ', '白夜霊ルーナ'],
  astral: ['キラリ', 'ホシクズ', 'ユラボシ', 'ツキノコ', 'トビホシ', 'セイレイカ', 'ネブラル', 'コメティア', '星詠ミラ', '宙姫アリア'],
  dragon: ['チビドラ', 'トカゲリュ', 'ハネリュ', 'ヤマリュ', 'スナドラ', 'レイリュ', 'ウミドラ', 'ガンドラ', '古竜ゼルガ', '始原竜エルド'],
};

/** 各系統の野生出現門(§4)。 */
const FAMILY_GATE: Record<FamilyId, string> = {
  sprout: 'gate01',
  beast: 'gate02',
  wing: 'gate02',
  scale: 'gate03',
  metal: 'gate04',
  shade: 'gate07',
  flame: 'gate05',
  frost: 'gate06',
  astral: 'gate08',
  dragon: 'gate08',
};

/** 系統傾向 (HP,MP,ATK,DEF,AGI,INT) (§5.3) */
const TENDENCY: Record<FamilyId, [number, number, number, number, number, number]> = {
  sprout: [2, 2, 1, 2, 1, 2],
  beast: [2, 1, 3, 1, 3, 0],
  wing: [1, 1, 2, 1, 3, 2],
  scale: [3, 1, 2, 3, 0, 1],
  metal: [3, 0, 2, 4, 0, 1],
  shade: [1, 3, 1, 1, 2, 2],
  flame: [2, 2, 3, 1, 1, 1],
  frost: [2, 2, 1, 3, 1, 1],
  astral: [1, 3, 1, 1, 2, 2],
  dragon: [3, 1, 3, 2, 0, 1],
};

/** 本作暫定の属性耐性。 */
const RESIST: Record<FamilyId, Partial<Record<Element, ResistMult>>> = {
  sprout: { fire: 1.5, water: 0.5 },
  beast: {},
  wing: { wind: 0.5, ice: 1.5 },
  scale: { water: 0.5, wind: 1.5 },
  metal: { physical: 0.5, fire: 1.5 },
  shade: { shadow: 0.5, light: 1.5 },
  flame: { fire: 0.5, ice: 1.5, water: 1.5 },
  frost: { ice: 0.5, fire: 1.5 },
  astral: { light: 0.5, shadow: 1.5 },
  dragon: { fire: 0.5, ice: 0.5 },
};

/** §8.1 系統別の初期習得技。 */
const FAMILY_SKILLS: Record<FamilyId, [string, string, string]> = {
  sprout: ['SK19', 'SK23', 'SK27'],
  beast: ['SK01', 'SK02', 'SK26'],
  wing: ['SK11', 'SK12', 'SK22'],
  scale: ['SK13', 'SK14', 'SK25'],
  metal: ['SK04', 'SK25', 'SK01'],
  shade: ['SK17', 'SK18', 'SK29'],
  flame: ['SK05', 'SK06', 'SK07'],
  frost: ['SK08', 'SK09', 'SK10'],
  astral: ['SK15', 'SK16', 'SK21'],
  dragon: ['SK02', 'SK10', 'SK30'],
};

interface RankTemplate {
  hp: number;
  mp: number;
  atk: number;
  def: number;
  agi: number;
  int: number;
  growthPoints: number;
  recruitBase: number;
  /** null = 野生出現なし(配合専用) */
  wildLevel: [number, number] | null;
}

// §5.3。A ランクは「配合専用」と決定したため wildLevel / recruitBase を外した。
const RANK_TEMPLATE: Record<Rank, RankTemplate> = {
  E: { hp: 10, mp: 4, atk: 5, def: 5, agi: 5, int: 5, growthPoints: 12, recruitBase: 0.18, wildLevel: [1, 12] },
  D: { hp: 15, mp: 7, atk: 9, def: 8, agi: 8, int: 8, growthPoints: 16, recruitBase: 0.12, wildLevel: [5, 20] },
  C: { hp: 22, mp: 11, atk: 13, def: 12, agi: 12, int: 12, growthPoints: 21, recruitBase: 0.07, wildLevel: [12, 29] },
  B: { hp: 30, mp: 17, atk: 19, def: 17, agi: 17, int: 17, growthPoints: 27, recruitBase: 0.035, wildLevel: [21, 38] },
  A: { hp: 40, mp: 25, atk: 26, def: 24, agi: 24, int: 24, growthPoints: 33, recruitBase: 0, wildLevel: null },
  S: { hp: 50, mp: 34, atk: 33, def: 31, agi: 31, int: 31, growthPoints: 40, recruitBase: 0, wildLevel: null },
};

export function rankOfIndex(index: number): Rank {
  if (index <= 2) return 'E';
  if (index <= 4) return 'D';
  if (index <= 6) return 'C';
  if (index === 7) return 'B';
  if (index === 8) return 'A';
  return 'S';
}

function skillsForIndex(family: FamilyId, index: number): string[] {
  const s = FAMILY_SKILLS[family];
  if (index <= 2) return [s[0]];
  if (index <= 6) return [s[0], s[1]];
  return [...s];
}

function build(): MonsterSpecies[] {
  const out: MonsterSpecies[] = [];
  FAMILY_IDS.forEach((family, f) => {
    NAMES[family].forEach((name, index) => {
      const rank = rankOfIndex(index);
      const t = RANK_TEMPLATE[rank];
      const w = TENDENCY[family].map((x) => Math.max(x, 0.5));
      const growthWeights: Stats = { hp: w[0]!, mp: w[1]!, atk: w[2]!, def: w[3]!, agi: w[4]!, int: w[5]! };
      out.push({
        id: `M${String(f * 10 + index + 1).padStart(3, '0')}`,
        family,
        index,
        name,
        rank,
        baseStats: { hp: t.hp, mp: t.mp, atk: t.atk, def: t.def, agi: t.agi, int: t.int },
        growthWeights,
        growthPoints: t.growthPoints,
        resistances: RESIST[family],
        nativeSkillIds: skillsForIndex(family, index),
        recruitBase: t.recruitBase,
        wildLevelRange: t.wildLevel,
        wildGateId: t.wildLevel ? FAMILY_GATE[family] : null,
        assetKey: `monster/${family}_${index}`,
      });
    });
  });
  return out;
}

export const MONSTERS: MonsterSpecies[] = build();
export const MONSTER_BY_ID: ReadonlyMap<string, MonsterSpecies> = new Map(MONSTERS.map((m) => [m.id, m]));

export function monsterAt(family: FamilyId, index: number): MonsterSpecies {
  const id = `M${String(FAMILY_IDS.indexOf(family) * 10 + index + 1).padStart(3, '0')}`;
  const m = MONSTER_BY_ID.get(id);
  if (!m) throw new Error(`no monster ${family}[${index}]`);
  return m;
}
