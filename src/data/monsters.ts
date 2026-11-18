import { ART_SHAPES, type ArtShape, type Element, type MonsterSpecies, type Rank, type ResistMult, type Stats } from '../domain/types';
import { SKILLS } from './skills';

/** 図鑑の並び(見た目の体型テンプレートごとに10種)。ルール上の系統は存在しない。 */
const NAMES: Record<ArtShape, string[]> = {
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

/** 体型テンプレートごとの野生出現門(§4)。 */
const FAMILY_GATE: Record<ArtShape, string> = {
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

/** 成長の傾向 (HP,MP,ATK,DEF,AGI,INT)。種族ごとに ±30% ゆらす(§5.3) */
const TENDENCY: Record<ArtShape, [number, number, number, number, number, number]> = {
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
const RESIST: Record<ArtShape, Partial<Record<Element, ResistMult>>> = {
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

/** 体型テンプレートごとの得意技(種族ごとにこれと別の技を混ぜて、技の組み合わせを重ならなくする) */
const FAMILY_SKILLS: Record<ArtShape, [string, string, string]> = {
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

function hash(n: number): number {
  n = (n ^ 61) ^ (n >>> 16);
  n = Math.imul(n + (n << 3), 0x27d4eb2d);
  n ^= n >>> 15;
  n = Math.imul(n, 0x2c1b3c6d);
  return ((n ^ (n >>> 12)) >>> 0) / 4294967296;
}

/** ランクごとに最初から使える技の習得Lv上限(強すぎる技が序盤の種族に付かないように) */
const SKILL_LEVEL_LIMIT: Record<Rank, number> = { E: 8, D: 14, C: 24, B: 32, A: 40, S: 99 };
const SKILL_COUNT: Record<Rank, number> = { E: 2, D: 2, C: 2, B: 3, A: 3, S: 3 };

/** 種族ごとに別の技の組み合わせを割り当てる(同じ組み合わせは作らない) */
function assignSkills(no: number, rank: Rank, shape: ArtShape, taken: Set<string>): string[] {
  const own = FAMILY_SKILLS[shape];
  const limit = SKILL_LEVEL_LIMIT[rank];
  const n = SKILL_COUNT[rank];
  for (let attempt = 0; attempt < 200; attempt++) {
    const salt = no * 131 + attempt * 17;
    const wild = Array.from({ length: 6 }, (_, i) => SKILLS[Math.floor(hash(salt + i * 7) * SKILLS.length)]!.id);
    const pool = [...new Set([...own, ...wild])]
      .filter((id) => SKILLS.find((k) => k.id === id)!.learnLevel <= limit)
      .sort((a, b) => hash(salt + a.charCodeAt(3) * 13 + a.charCodeAt(2)) - hash(salt + b.charCodeAt(3) * 13 + b.charCodeAt(2)));
    // 体型テンプレートの得意技を優先して 1 つは入れる
    const firstOwn = own.find((id) => pool.includes(id));
    const pick = [...new Set([...(firstOwn ? [firstOwn] : []), ...pool])].slice(0, n);
    if (pick.length === 0) continue;
    pick.sort((a, b) => SKILLS.find((k) => k.id === a)!.learnLevel - SKILLS.find((k) => k.id === b)!.learnLevel || a.localeCompare(b));
    const key = pick.join(',');
    if (!taken.has(key)) {
      taken.add(key);
      return pick;
    }
  }
  throw new Error(`could not assign unique skills for M${no}`);
}

const ELEMENTS: Element[] = ['fire', 'ice', 'wind', 'water', 'light', 'shadow', 'physical'];

function tweakResist(no: number, base: Partial<Record<Element, ResistMult>>): Partial<Record<Element, ResistMult>> {
  const out = { ...base };
  // 種族ごとに 1 つだけ弱点か耐性を足す/入れ替える
  const el = ELEMENTS[Math.floor(hash(no * 53) * ELEMENTS.length)]!;
  const roll = hash(no * 59);
  if (out[el] === undefined) out[el] = roll < 0.5 ? 0.5 : 1.5;
  else if (roll < 0.3) delete out[el];
  return out;
}

function build(): MonsterSpecies[] {
  const out: MonsterSpecies[] = [];
  const takenSkills = new Set<string>();
  ART_SHAPES.forEach((shape, f) => {
    NAMES[shape].forEach((name, variant) => {
      const no = f * 10 + variant + 1;
      const rank = rankOfIndex(variant);
      const t = RANK_TEMPLATE[rank];
      const j = (k: number, spread: number) => 1 + (hash(no * 101 + k * 13) - 0.5) * spread;
      const w = TENDENCY[shape].map((x, k) => Math.max(x, 0.5) * j(k + 20, 0.6));
      const growthWeights: Stats = { hp: w[0]!, mp: w[1]!, atk: w[2]!, def: w[3]!, agi: w[4]!, int: w[5]! };
      const baseStats: Stats = {
        hp: Math.round(t.hp * j(1, 0.16)),
        mp: Math.round(t.mp * j(2, 0.16)),
        atk: Math.round(t.atk * j(3, 0.16)),
        def: Math.round(t.def * j(4, 0.16)),
        agi: Math.round(t.agi * j(5, 0.16)),
        int: Math.round(t.int * j(6, 0.16)),
      };
      const anchor = (k: number) => hash((f + 1) * 977 + k * 31);
      const traits = [0, 1, 2, 3].map((k) => Math.min(1, Math.max(0, anchor(k) * 0.6 + hash(no * 211 + k * 19) * 0.4))) as MonsterSpecies['traits'];
      out.push({
        id: `M${String(no).padStart(3, '0')}`,
        no,
        art: { shape, variant },
        traits,
        name,
        rank,
        baseStats,
        growthWeights,
        growthPoints: t.growthPoints,
        resistances: tweakResist(no, RESIST[shape]),
        nativeSkillIds: assignSkills(no, rank, shape, takenSkills),
        recruitBase: t.recruitBase,
        wildLevelRange: t.wildLevel,
        wildGateId: t.wildLevel ? FAMILY_GATE[shape] : null,
        assetKey: `monster/M${String(no).padStart(3, '0')}`,
      });
    });
  });
  return out;
}

export const MONSTERS: MonsterSpecies[] = build();
export const MONSTER_BY_ID: ReadonlyMap<string, MonsterSpecies> = new Map(MONSTERS.map((m) => [m.id, m]));
