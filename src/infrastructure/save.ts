import { openDB, type IDBPDatabase } from 'idb';
import { z } from 'zod';
import { STAT_KEYS } from '../domain/types';

export const CURRENT_SCHEMA_VERSION = 1;
export const SLOT_COUNT = 3;

const stats = z.object(Object.fromEntries(STAT_KEYS.map((k) => [k, z.number()])) as Record<(typeof STAT_KEYS)[number], z.ZodNumber>);

export const monsterInstanceSchema = z.object({
  uuid: z.string().min(1),
  speciesId: z.string().regex(/^M\d{3}$/),
  nickname: z.string().optional(),
  gender: z.enum(['M', 'F']),
  level: z.number().int().min(1).max(99),
  exp: z.number().min(0),
  plus: z.number().int().min(0).max(99),
  bonusStats: stats,
  stats,
  currentHp: z.number().min(0),
  currentMp: z.number().min(0),
  knownSkillIds: z.array(z.string()).max(8),
  inheritedSkillCandidates: z.array(z.string()).max(16),
  status: z.array(z.string()),
  personality: z.enum(['brave', 'careful', 'gentle', 'wild']),
  genealogy: z.object({ bloodlineSpeciesId: z.string(), partnerSpeciesId: z.string() }).optional(),
});

export const eggSchema = z.object({
  uuid: z.string().min(1),
  speciesId: z.string(),
  gender: z.enum(['M', 'F']),
  plus: z.number().int().min(0).max(99),
  bonusStats: stats,
  inheritedSkillCandidates: z.array(z.string()).max(16),
  hatchProgress: z.number().min(0),
});

export const dungeonRunSchema = z.object({
  gateId: z.string(),
  floor: z.number().int().min(1),
  seed: z.number().int(),
  x: z.number().int(),
  y: z.number().int(),
  steps: z.number().int().min(0),
  openedChests: z.array(z.number().int()),
});
export type DungeonRun = z.infer<typeof dungeonRunSchema>;

export const saveDataSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  saveId: z.string().min(1),
  playerName: z.string().max(12).default('旅人'),
  playSeconds: z.number().min(0),
  rngState: z.number().int().min(0),
  gold: z.number().int().min(0).max(999999),
  inventory: z.record(z.string(), z.number().int().min(0)),
  partyUuids: z.array(z.string()).max(3),
  barnUuids: z.array(z.string()),
  monsters: z.record(z.string(), monsterInstanceSchema),
  eggs: z.array(eggSchema).max(20),
  storyFlags: z.record(z.string(), z.union([z.boolean(), z.number()])),
  discoveredSpeciesIds: z.array(z.string()),
  recruitedSpeciesIds: z.array(z.string()),
  dungeonRun: dungeonRunSchema.optional(),
  lastSavedAt: z.string(),
});
export type SaveData = z.infer<typeof saveDataSchema>;
export type MonsterInstance = z.infer<typeof monsterInstanceSchema>;

export function createNewSave(saveId: string, seed: number, now: string): SaveData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    saveId,
    playerName: '旅人',
    playSeconds: 0,
    rngState: seed >>> 0,
    gold: 100,
    inventory: {},
    partyUuids: [],
    barnUuids: [],
    monsters: {},
    eggs: [],
    storyFlags: { tournamentRank: 0 },
    discoveredSpeciesIds: [],
    recruitedSpeciesIds: [],
    lastSavedAt: now,
  };
}

/** 参照整合性(パーティ/牧舎の uuid が実在、重複なし)を確認。問題点の一覧を返す。 */
export function checkSaveIntegrity(s: SaveData): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const u of [...s.partyUuids, ...s.barnUuids]) {
    if (!s.monsters[u]) errs.push(`unknown monster ${u}`);
    if (seen.has(u)) errs.push(`monster ${u} listed twice`);
    seen.add(u);
  }
  for (const [u, m] of Object.entries(s.monsters)) {
    if (u !== m.uuid) errs.push(`monster key mismatch ${u}`);
    if (!seen.has(u)) errs.push(`monster ${u} is in neither party nor barn`);
  }
  return errs;
}

// ---- シリアライズ(ハッシュで破損検知) ----

function fnv1a(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

interface Envelope {
  hash: string;
  body: string;
}

export function serializeSave(save: SaveData): string {
  const body = JSON.stringify(save);
  const env: Envelope = { hash: fnv1a(body), body };
  return JSON.stringify(env);
}

export type ParseResult = { ok: true; save: SaveData } | { ok: false; reason: string };

/** マイグレーション。旧版は順に CURRENT_SCHEMA_VERSION へ引き上げる。 */
export function migrate(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  let v = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 0;
  if (v > CURRENT_SCHEMA_VERSION) throw new Error(`save is newer (v${v}) than this app (v${CURRENT_SCHEMA_VERSION})`);
  // 例: if (v === 1) { ...; v = 2; }
  obj.schemaVersion = v;
  return obj;
}

export function parseSave(text: string): ParseResult {
  let env: Envelope;
  try {
    env = JSON.parse(text) as Envelope;
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }
  if (typeof env?.body !== 'string' || typeof env.hash !== 'string') return { ok: false, reason: 'bad envelope' };
  if (fnv1a(env.body) !== env.hash) return { ok: false, reason: 'hash mismatch (corrupted)' };
  let data: unknown;
  try {
    data = migrate(JSON.parse(env.body));
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  const r = saveDataSchema.safeParse(data);
  if (!r.success) return { ok: false, reason: `schema: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message}` };
  const integrity = checkSaveIntegrity(r.data);
  if (integrity.length) return { ok: false, reason: `integrity: ${integrity[0]}` };
  return { ok: true, save: r.data };
}

// ---- ストア ----

export interface SaveStore {
  /** 現在のスロットを 1 世代バックアップしてから書く。失敗時は何も変えない。 */
  write(slot: number, save: SaveData): Promise<void>;
  /** 本体が壊れていればバックアップから復旧を試みる。 */
  read(slot: number): Promise<{ result: ParseResult; usedBackup: boolean } | null>;
  delete(slot: number): Promise<void>;
}

function assertSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) throw new Error(`invalid slot ${slot}`);
}

abstract class BaseStore implements SaveStore {
  protected abstract get(key: string): Promise<string | undefined>;
  /** keys → values を単一トランザクションで反映(undefined は削除)。 */
  protected abstract commit(entries: Record<string, string | undefined>): Promise<void>;

  async write(slot: number, save: SaveData): Promise<void> {
    assertSlot(slot);
    const text = serializeSave(save);
    // 書く前に自己検証(壊れたデータで正常な保存を上書きしない)
    const check = parseSave(text);
    if (!check.ok) throw new Error(`refusing to write invalid save: ${check.reason}`);
    const prev = await this.get(`slot${slot}`);
    const entries: Record<string, string | undefined> = { [`slot${slot}`]: text };
    if (prev !== undefined && parseSave(prev).ok) entries[`slot${slot}.bak`] = prev;
    await this.commit(entries);
  }

  async read(slot: number) {
    assertSlot(slot);
    const main = await this.get(`slot${slot}`);
    if (main === undefined) return null;
    const r = parseSave(main);
    if (r.ok) return { result: r, usedBackup: false };
    const bak = await this.get(`slot${slot}.bak`);
    if (bak !== undefined) {
      const rb = parseSave(bak);
      if (rb.ok) return { result: rb, usedBackup: true };
    }
    return { result: r, usedBackup: false };
  }

  async delete(slot: number): Promise<void> {
    assertSlot(slot);
    await this.commit({ [`slot${slot}`]: undefined, [`slot${slot}.bak`]: undefined });
  }
}

export class MemorySaveStore extends BaseStore {
  readonly data = new Map<string, string>();
  protected async get(key: string) {
    return this.data.get(key);
  }
  protected async commit(entries: Record<string, string | undefined>) {
    for (const [k, v] of Object.entries(entries)) {
      if (v === undefined) this.data.delete(k);
      else this.data.set(k, v);
    }
  }
}

export class IdbSaveStore extends BaseStore {
  private dbp: Promise<IDBPDatabase>;
  constructor(name = 'teriwan-saves') {
    super();
    this.dbp = openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore('saves');
      },
    });
  }
  protected async get(key: string) {
    return (await (await this.dbp).get('saves', key)) as string | undefined;
  }
  protected async commit(entries: Record<string, string | undefined>) {
    const db = await this.dbp;
    const tx = db.transaction('saves', 'readwrite');
    for (const [k, v] of Object.entries(entries)) {
      if (v === undefined) tx.store.delete(k);
      else tx.store.put(v, k);
    }
    await tx.done;
  }
}
