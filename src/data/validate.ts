import { z } from 'zod';
import { ART_SHAPES, STAT_KEYS } from '../domain/types';
import { MONSTERS } from './monsters';
import { SKILLS } from './skills';
import { ITEMS } from './items';
import { GATES, SPECIAL_RECIPES, TOURNAMENTS } from './world';
import { resolveBreeding } from '../domain/breeding';

const stats = z.object(Object.fromEntries(STAT_KEYS.map((k) => [k, z.number().min(0)])) as Record<(typeof STAT_KEYS)[number], z.ZodNumber>);

const speciesSchema = z.object({
  id: z.string().regex(/^M\d{3}$/),
  no: z.number().int().min(1).max(100),
  art: z.object({ shape: z.enum(ART_SHAPES), variant: z.number().int().min(0).max(9) }),
  traits: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]),
  name: z.string().min(1),
  rank: z.enum(['E', 'D', 'C', 'B', 'A', 'S']),
  baseStats: stats,
  growthWeights: stats,
  growthPoints: z.number().positive(),
  resistances: z.record(z.string(), z.union([z.literal(0), z.literal(0.5), z.literal(1), z.literal(1.5)])),
  nativeSkillIds: z.array(z.string()).min(1),
  recruitBase: z.number().min(0).max(1),
  wildLevelRange: z.tuple([z.number().int().min(1), z.number().int().min(1)]).nullable(),
  wildGateId: z.string().nullable(),
  assetKey: z.string().min(1),
});

/** 設計書 §13 のデータ整合ルールを検証し、違反メッセージの一覧を返す(空なら正常)。 */
export function validateGameData(): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);

  const speciesIds = new Set<string>();
  for (const m of MONSTERS) {
    const r = speciesSchema.safeParse(m);
    if (!r.success) err(`species ${m.id}: ${r.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
    if (speciesIds.has(m.id)) err(`duplicate species id ${m.id}`);
    speciesIds.add(m.id);
  }
  if (MONSTERS.length !== 100) err(`expected 100 species, got ${MONSTERS.length}`);
  if (new Set(MONSTERS.map((m) => m.name)).size !== MONSTERS.length) err('duplicate species name');
  const skillSets = new Set(MONSTERS.map((m) => m.nativeSkillIds.join(',')));
  if (skillSets.size !== MONSTERS.length) err('two species share the same native skill set');
  const rankCount = (r: string) => MONSTERS.filter((m) => m.rank === r).length;
  for (const [r, n] of [['E', 30], ['D', 20], ['C', 20], ['B', 10], ['A', 10], ['S', 10]] as const) if (rankCount(r) !== n) err(`rank ${r} should have ${n} species`);

  const skillIds = new Set(SKILLS.map((s) => s.id));
  if (skillIds.size !== SKILLS.length) err('duplicate skill id');
  const itemIds = new Set(ITEMS.map((i) => i.id));
  if (itemIds.size !== ITEMS.length) err('duplicate item id');
  const gateIds = new Set(GATES.map((g) => g.id));

  for (const m of MONSTERS) {
    for (const s of m.nativeSkillIds) if (!skillIds.has(s)) err(`${m.id}: unknown skill ${s}`);
    if (m.wildGateId && !gateIds.has(m.wildGateId)) err(`${m.id}: unknown gate ${m.wildGateId}`);
    if ((m.wildLevelRange === null) !== (m.wildGateId === null)) err(`${m.id}: wildLevelRange/wildGateId mismatch`);
    if (m.wildLevelRange && m.wildLevelRange[0] > m.wildLevelRange[1]) err(`${m.id}: bad wild level range`);
  }
  for (const g of GATES) if (!speciesIds.has(g.bossSpeciesId)) err(`${g.id}: unknown boss ${g.bossSpeciesId}`);
  for (const r of SPECIAL_RECIPES) {
    for (const id of [r.bloodline, r.partner, r.result]) if (!speciesIds.has(id)) err(`recipe: unknown species ${id}`);
  }
  if (new Set(TOURNAMENTS.map((t) => t.rank)).size !== TOURNAMENTS.length) err('duplicate tournament rank');

  // 100×100 全順序対が必ず有効な種族を返す
  for (const a of MONSTERS) {
    for (const b of MONSTERS) {
      let res: string;
      try {
        res = resolveBreeding(a.id, b.id);
      } catch (e) {
        err(`resolveBreeding(${a.id},${b.id}) threw: ${(e as Error).message}`);
        continue;
      }
      if (!speciesIds.has(res)) err(`resolveBreeding(${a.id},${b.id}) -> invalid ${res}`);
    }
  }

  // 100種すべてが 野生入手 + 配合 の閉包で入手可能
  const owned = new Set(MONSTERS.filter((m) => m.wildGateId !== null).map((m) => m.id));
  for (let changed = true; changed; ) {
    changed = false;
    for (const a of [...owned]) {
      for (const b of [...owned]) {
        const r = resolveBreeding(a, b);
        if (!owned.has(r)) {
          owned.add(r);
          changed = true;
        }
      }
    }
  }
  for (const m of MONSTERS) if (!owned.has(m.id)) err(`unobtainable species ${m.id} ${m.name}`);

  return errors;
}

/** 起動時に呼ぶ。壊れたデータで動き出さない。 */
export function assertGameData(): void {
  const errors = validateGameData();
  if (errors.length) throw new Error(`Game data invalid:\n${errors.slice(0, 20).join('\n')}`);
}
