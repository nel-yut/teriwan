import { SPECIAL_RECIPES } from '../data/world';
import { MONSTER_BY_ID, monsterAt } from '../data/monsters';
import { FAMILY_IDS } from './types';

/**
 * 設計書 §7.2〜7.4。純粋関数で、任意の種族の順序対に対して必ず種族 ID を返す。
 * 優先順位: クロス特殊 > 同系統 A×A→S > 通常(血統系統を継承)。
 * 通常配合式は本作独自の暫定フォールバック(GB版の配合表ではない)。
 */
export function resolveBreeding(bloodlineId: string, partnerId: string): string {
  const b = MONSTER_BY_ID.get(bloodlineId);
  const p = MONSTER_BY_ID.get(partnerId);
  if (!b) throw new Error(`unknown species: ${bloodlineId}`);
  if (!p) throw new Error(`unknown species: ${partnerId}`);

  const special = SPECIAL_RECIPES.find((r) => r.bloodline === bloodlineId && r.partner === partnerId);
  if (special) return special.result;

  if (b.family === p.family && b.index === 8 && p.index === 8) {
    return monsterAt(b.family, 9).id;
  }

  const pFamilyIndex = FAMILY_IDS.indexOf(p.family);
  const idx = Math.min(8, Math.max(0, Math.floor((b.index + p.index) / 2) + (pFamilyIndex % 3) - 1));
  return monsterAt(b.family, idx).id;
}
