import { MONSTERS, MONSTER_BY_ID } from '../data/monsters';
import { SPECIAL_RECIPES } from '../data/world';
import type { MonsterSpecies, Rank } from './types';

const RANK_VAL: Record<Rank, number> = { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 };
const RANK_BY_VAL: Rank[] = ['E', 'D', 'C', 'B', 'A', 'S'];

/** ランクごとの候補(図鑑番号順) */
const BY_RANK: Record<Rank, MonsterSpecies[]> = { E: [], D: [], C: [], B: [], A: [], S: [] };
for (const m of MONSTERS) BY_RANK[m.rank].push(m);

function pairHash(a: number, b: number): number {
  let h = (a * 73856093) ^ (b * 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** 子のランク。同格の C/B 同士は 1 つ上がり、それ以外は平均の切り上げ。S は特別配合でしか生まれない。 */
export function childRank(a: Rank, b: Rank): Rank {
  const ra = RANK_VAL[a];
  const rb = RANK_VAL[b];
  const v = ra === rb && ra >= 2 && ra <= 3 ? ra + 1 : Math.ceil((ra + rb) / 2);
  return RANK_BY_VAL[Math.min(4, v)]!;
}

/**
 * 配合結果(設計書 §7 を「1種族=1系統」向けに再設計)。純粋関数で、任意の順序対に必ず種族 ID を返す。
 * 1. 特別配合(血統指定): S 種は A×A の組、および S 同士のクロス配合から
 * 2. 通常配合: 子のランクを決め(同格の C/B は昇格)、そのランクの種族のうち
 *    相性ベクトルが「血統 65% + 相手 35%」に最も近いものを選ぶ(親そのものは除外)
 */
export function resolveBreeding(bloodlineId: string, partnerId: string): string {
  const b = MONSTER_BY_ID.get(bloodlineId);
  const p = MONSTER_BY_ID.get(partnerId);
  if (!b) throw new Error(`unknown species: ${bloodlineId}`);
  if (!p) throw new Error(`unknown species: ${partnerId}`);

  const special = SPECIAL_RECIPES.find((r) => r.bloodline === bloodlineId && r.partner === partnerId);
  if (special) return special.result;

  const rank = childRank(b.rank, p.rank);
  let cands = BY_RANK[rank].filter((m) => m.id !== b.id && m.id !== p.id);
  if (cands.length === 0) cands = BY_RANK[rank];
  const target = b.traits.map((v, k) => v * 0.65 + p.traits[k]! * 0.35);
  let best = cands[0]!;
  let bestD = Infinity;
  for (const m of cands) {
    const d = m.traits.reduce((acc, v, k) => acc + (v - target[k]!) ** 2, 0) + pairHash(b.no * 101 + m.no, p.no) * 0.02;
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best.id;
}
