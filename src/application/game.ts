import { ITEMS } from '../data/items';
import { MONSTER_BY_ID, MONSTERS } from '../data/monsters';
import { SKILL_FUSIONS } from '../data/skills';
import { GATES, TOURNAMENTS } from '../data/world';
import { resolveBreeding } from '../domain/breeding';
import { Battle, combatantFromMonster, type Strategy } from '../domain/battle';
import { bossFloor, floorSeed, generateFloor, isWalkable, tileAt, T, type FloorMap } from '../domain/dungeon';
import {
  computeRewards,
  generateBossParty,
  generateWildEncounter,
  getGate,
  rollRecruit,
  tournamentOpponents,
} from '../domain/encounter';
import {
  MAX_CANDIDATES,
  createMonster,
  gainExp,
  getSpecies,
  healFully,
  newUuid,
  recomputeStats,
  zeroStats,
} from '../domain/monster';
import { Rng } from '../domain/rng';
import { STAT_KEYS, type GateDef, type Stats, type TournamentDef } from '../domain/types';
import {
  CURRENT_SCHEMA_VERSION,
  createNewSave,
  type MonsterInstance,
  type SaveData,
  type SaveStore,
} from '../infrastructure/save';

export const MAX_MONSTERS = 30;
export const MAX_EGGS = 20;
export const HATCH_THRESHOLD = 100;
export const BREED_MIN_LEVEL = 10;

const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const getItem = (id: string) => {
  const i = ITEM_BY_ID.get(id);
  if (!i) throw new Error(`unknown item ${id}`);
  return i;
};

export interface LevelUpInfo {
  name: string;
  from: number;
  to: number;
  learned: string[];
}

export interface BattleSummary {
  result: 'victory' | 'defeat' | 'escape';
  exp: number;
  gold: number;
  levelUps: LevelUpInfo[];
  /** 仲間になった幻獣(牧舎が満杯なら placed=false で入替を待つ) */
  recruited?: { monster: MonsterInstance; placed: boolean };
  hatched: string[];
}

export type MoveEvent =
  | { kind: 'blocked' }
  | { kind: 'step' }
  | { kind: 'encounter' }
  | { kind: 'floor'; floor: number }
  | { kind: 'chest'; text: string }
  | { kind: 'boss' }
  | { kind: 'exit' };

export interface BreedPreview {
  ok: boolean;
  reason?: string;
  childSpeciesId?: string;
  bonusStats?: Stats;
  plus?: number;
  inheritedSkillCandidates?: string[];
}

export type FlagValue = boolean | number;

export class Game {
  save: SaveData;
  rng: Rng;
  strategy: Strategy = 'bacchiri';
  lastSaveError: string | null = null;
  private floorCache: { key: string; map: FloorMap } | null = null;

  constructor(
    save: SaveData,
    readonly store: SaveStore | null,
    readonly slot = 0,
  ) {
    this.save = save;
    this.rng = new Rng(save.rngState);
  }

  static create(store: SaveStore | null, slot: number, seed: number, now = new Date().toISOString()): Game {
    return new Game(createNewSave(`save-${seed}`, seed, now), store, slot);
  }

  // ---------- 永続化 ----------

  /** 状態を複製して変更し、保存に成功したら反映する(失敗時は何も変えない)。 */
  async mutate<T>(fn: (s: SaveData) => T): Promise<T> {
    const draft = structuredClone(this.save);
    const rngBefore = this.rng.getState();
    let out: T;
    try {
      out = fn(draft);
      draft.rngState = this.rng.getState();
      draft.lastSavedAt = new Date().toISOString();
      if (this.store) await this.store.write(this.slot, draft);
    } catch (e) {
      this.rng.setState(rngBefore);
      this.lastSaveError = (e as Error).message;
      throw e;
    }
    this.lastSaveError = null;
    this.save = draft;
    return out;
  }

  /** 保存のみ(進行状態は既に反映済みのとき)。失敗しても遊び続けられるようエラーは保持だけする。 */
  async persist(): Promise<void> {
    this.save.rngState = this.rng.getState();
    this.save.lastSavedAt = new Date().toISOString();
    if (!this.store) return;
    try {
      await this.store.write(this.slot, this.save);
      this.lastSaveError = null;
    } catch (e) {
      this.lastSaveError = (e as Error).message;
    }
  }

  // ---------- 参照 ----------

  flag(k: string): FlagValue {
    return this.save.storyFlags[k] ?? false;
  }
  setFlag(k: string, v: FlagValue): void {
    this.save.storyFlags[k] = v;
  }
  get tournamentRank(): number {
    return Number(this.flag('tournamentRank'));
  }

  monster(uuid: string): MonsterInstance {
    const m = this.save.monsters[uuid];
    if (!m) throw new Error(`no monster ${uuid}`);
    return m;
  }
  get party(): MonsterInstance[] {
    return this.save.partyUuids.map((u) => this.monster(u));
  }
  get barn(): MonsterInstance[] {
    return this.save.barnUuids.map((u) => this.monster(u));
  }
  get allMonsters(): MonsterInstance[] {
    return [...this.party, ...this.barn];
  }
  get monsterCount(): number {
    return this.save.partyUuids.length + this.save.barnUuids.length;
  }
  count(itemId: string): number {
    return this.save.inventory[itemId] ?? 0;
  }
  get inDungeon(): boolean {
    return this.save.dungeonRun !== undefined;
  }

  // ---------- 幻獣の管理 ----------

  private newId(): string {
    return newUuid(this.rng, (id) => id in this.save.monsters || this.save.eggs.some((e) => e.uuid === id));
  }

  addMonster(m: MonsterInstance): 'party' | 'barn' | 'full' {
    if (this.monsterCount >= MAX_MONSTERS) return 'full';
    this.save.monsters[m.uuid] = m;
    this.markOwned(m.speciesId);
    if (this.save.partyUuids.length < 3) {
      this.save.partyUuids.push(m.uuid);
      return 'party';
    }
    this.save.barnUuids.push(m.uuid);
    return 'barn';
  }

  private markOwned(speciesId: string): void {
    if (!this.save.recruitedSpeciesIds.includes(speciesId)) this.save.recruitedSpeciesIds.push(speciesId);
    if (!this.save.discoveredSpeciesIds.includes(speciesId)) this.save.discoveredSpeciesIds.push(speciesId);
  }

  releaseMonster(uuid: string): void {
    if (this.save.partyUuids.length + this.save.barnUuids.length <= 1) throw new Error('最後の1体は手放せません');
    delete this.save.monsters[uuid];
    this.save.partyUuids = this.save.partyUuids.filter((u) => u !== uuid);
    this.save.barnUuids = this.save.barnUuids.filter((u) => u !== uuid);
    this.fillParty();
  }

  /** パーティが空きなら牧舎から補充 */
  fillParty(): void {
    while (this.save.partyUuids.length < 3 && this.save.barnUuids.length) {
      this.save.partyUuids.push(this.save.barnUuids.shift()!);
    }
  }

  /** パーティ(最大3体)を設定。残りは牧舎へ。 */
  setParty(uuids: string[]): void {
    const uniq = [...new Set(uuids)].slice(0, 3);
    if (uniq.length === 0) throw new Error('パーティが空です');
    for (const u of uniq) this.monster(u);
    const all = this.allMonsters.map((m) => m.uuid);
    this.save.partyUuids = uniq;
    this.save.barnUuids = all.filter((u) => !uniq.includes(u));
  }

  healAll(): void {
    for (const m of Object.values(this.save.monsters)) healFully(m);
  }

  /** 救済: 幻獣が 1 体もいなければ無料で Lv1 の幻獣を渡す(詰み防止)。 */
  ensureMonster(): MonsterInstance | null {
    if (this.monsterCount > 0 || this.save.eggs.length > 0) return null;
    const m = createMonster(this.rng, { uuid: this.newId(), speciesId: 'M001', level: 1, gender: this.rng.pick(['M', 'F'] as const) });
    this.addMonster(m);
    return m;
  }

  // ---------- 序章 ----------

  chooseStarter(speciesId: string): void {
    const sp = MONSTER_BY_ID.get(speciesId);
    if (!sp || sp.rank !== 'E') throw new Error('invalid starter');
    const male = createMonster(this.rng, { uuid: this.newId(), speciesId, level: 3, gender: 'M' });
    this.addMonster(male);
    const female = createMonster(this.rng, { uuid: this.newId(), speciesId, level: 3, gender: 'F' });
    this.addMonster(female);
    this.save.inventory['IT01'] = 3;
    this.save.inventory['IT07'] = 2;
    this.setFlag('introDone', true);
  }

  // ---------- 門・ダンジョン ----------

  isGateUnlocked(g: GateDef): boolean {
    if (g.unlock === 'initial') return true;
    const m = /^tournament:(\d+)$/.exec(g.unlock);
    return m ? this.tournamentRank >= Number(m[1]) : false;
  }

  canEnterGate(g: GateDef): string | null {
    if (!this.isGateUnlocked(g)) return 'まだ開いていない門です。';
    if (this.party.every((m) => m.currentHp <= 0)) return 'パーティが全員戦闘不能です。休ませてください。';
    return null;
  }

  startRun(gateId: string): void {
    const g = getGate(gateId);
    const err = this.canEnterGate(g);
    if (err) throw new Error(err);
    const seed = this.rng.int(1, 0x7fffffff);
    const map = this.floorMapFor({ gateId, floor: 1, seed });
    this.save.dungeonRun = { gateId, floor: 1, seed, x: map.start.x, y: map.start.y, steps: 0, openedChests: [] };
  }

  floorMapFor(run: { gateId: string; floor: number; seed: number }): FloorMap {
    const key = `${run.gateId}:${run.floor}:${run.seed}`;
    if (this.floorCache?.key === key) return this.floorCache.map;
    const gate = getGate(run.gateId);
    const map = run.floor >= gate.floors ? bossFloor() : generateFloor(floorSeed(run.seed, run.gateId, run.floor));
    this.floorCache = { key, map };
    return map;
  }

  get run() {
    return this.save.dungeonRun;
  }

  currentMap(): FloorMap {
    if (!this.run) throw new Error('not in dungeon');
    return this.floorMapFor(this.run);
  }

  move(dx: number, dy: number): MoveEvent {
    const run = this.run;
    if (!run) throw new Error('not in dungeon');
    const map = this.currentMap();
    const nx = run.x + dx;
    const ny = run.y + dy;
    if (!isWalkable(map, nx, ny)) return { kind: 'blocked' };
    run.x = nx;
    run.y = ny;
    const tile = tileAt(map, nx, ny);
    const gate = getGate(run.gateId);

    if (tile === T.DOWN) {
      run.floor += 1;
      const next = this.currentMap();
      run.x = next.start.x;
      run.y = next.start.y;
      run.steps = 0;
      return { kind: 'floor', floor: run.floor };
    }
    if (tile === T.UP) {
      run.steps = 0;
      if (run.floor === 1) return { kind: 'exit' };
      return { kind: 'step' };
    }
    if (tile === T.BOSS) return { kind: 'boss' };
    if (tile === T.CHEST) {
      const chest = map.chests.find((c) => c.x === nx && c.y === ny);
      if (chest && !run.openedChests.includes(chest.id)) {
        run.openedChests.push(chest.id);
        return { kind: 'chest', text: this.openChest(gate, run.floor) };
      }
    }
    run.steps += 1;
    // 平均 12〜20 歩で遭遇(階段直後は発生しない)
    const p = Math.min(1, Math.max(0, (run.steps - 6) * 0.06));
    if (this.rng.chance(p)) {
      run.steps = 0;
      return { kind: 'encounter' };
    }
    return { kind: 'step' };
  }

  private openChest(gate: GateDef, floor: number): string {
    const r = this.rng.next();
    if (r < 0.45) {
      const g = Math.round((gate.recommendedLevel[1] + floor) * this.rng.int(6, 12));
      this.save.gold = Math.min(999999, this.save.gold + g);
      return `${g}G を手に入れた!`;
    }
    const table: [string, number][] = [
      ['IT01', 30], ['IT02', 12], ['IT03', 10], ['IT04', 8], ['IT05', 8], ['IT07', 14], ['IT08', 5], ['IT06', 6],
      ['IT14', 1.5], ['IT15', 1.5], ['IT10', 1.2], ['IT11', 1.2], ['IT12', 1.2], ['IT13', 1.2], ['IT09', 0.4],
    ];
    const total = table.reduce((a, [, w]) => a + w, 0);
    let x = this.rng.next() * total;
    let id = 'IT01';
    for (const [i, w] of table) {
      x -= w;
      if (x <= 0) {
        id = i;
        break;
      }
    }
    const it = getItem(id);
    const have = this.count(id);
    if (have >= it.maxStack) return `${it.name}を見つけたが、これ以上持てない…`;
    this.save.inventory[id] = have + 1;
    return `${it.name}を手に入れた!`;
  }

  /** 街へ戻る(帰還・敗北・ギブアップ共通) */
  leaveDungeon(): void {
    delete this.save.dungeonRun;
    this.floorCache = null;
  }

  useReturnStone(): boolean {
    if (this.count('IT06') <= 0 || !this.run) return false;
    this.save.inventory['IT06'] = this.count('IT06') - 1;
    this.leaveDungeon();
    return true;
  }

  // ---------- 戦闘 ----------

  private buildAllies() {
    return this.party.map((m, i) => combatantFromMonster(m, `a${i}`, this.strategy));
  }

  private noteSeen(b: Battle): void {
    for (const e of b.enemies) if (!this.save.discoveredSpeciesIds.includes(e.speciesId)) this.save.discoveredSpeciesIds.push(e.speciesId);
  }

  startWildBattle(): Battle {
    const run = this.run;
    if (!run) throw new Error('not in dungeon');
    const gate = getGate(run.gateId);
    const b = new Battle({
      allies: this.buildAllies(),
      enemies: generateWildEncounter(this.rng, gate, run.floor),
      rng: this.rng,
      inventory: this.save.inventory,
      canFlee: true,
      allowItems: true,
    });
    this.noteSeen(b);
    return b;
  }

  startBossBattle(): Battle {
    const run = this.run;
    if (!run) throw new Error('not in dungeon');
    const b = new Battle({
      allies: this.buildAllies(),
      enemies: generateBossParty(this.rng, getGate(run.gateId)),
      rng: this.rng,
      inventory: this.save.inventory,
      canFlee: false,
      allowItems: true,
    });
    this.noteSeen(b);
    return b;
  }

  startTournamentBattle(t: TournamentDef, match: number): Battle {
    const b = new Battle({
      allies: this.buildAllies(),
      enemies: tournamentOpponents(t, match),
      rng: this.rng,
      inventory: this.save.inventory,
      canFlee: false,
      allowItems: false,
    });
    this.noteSeen(b);
    return b;
  }

  /** 戦闘結果を状態へ反映する。kind: wild は加入判定あり。 */
  finishBattle(b: Battle, kind: 'wild' | 'boss' | 'tournament'): BattleSummary {
    // HP/MP 反映
    b.allies.forEach((c, i) => {
      const m = this.monster(this.save.partyUuids[i]!);
      m.currentHp = c.hp;
      m.currentMp = c.mp;
      m.status = [];
    });
    const summary: BattleSummary = { result: 'escape', exp: 0, gold: 0, levelUps: [], hatched: [] };
    if (b.phase === 'defeat') {
      summary.result = 'defeat';
      return summary;
    }
    if (b.phase !== 'victory') return summary;
    summary.result = 'victory';
    const r = computeRewards(b);
    summary.exp = r.expPerAlly;
    summary.gold = r.gold;
    this.save.gold = Math.min(999999, this.save.gold + r.gold);
    b.allies.forEach((c, i) => {
      if (c.hp <= 0) return;
      const m = this.monster(this.save.partyUuids[i]!);
      const from = m.level;
      const lr = gainExp(m, r.expPerAlly, SKILL_FUSIONS);
      if (lr.levelsGained > 0) summary.levelUps.push({ name: c.name, from, to: m.level, learned: lr.learned });
    });
    for (const egg of this.save.eggs) egg.hatchProgress += r.hatchPoints;
    for (const egg of this.save.eggs) if (egg.hatchProgress >= HATCH_THRESHOLD) summary.hatched.push(egg.uuid);

    if (kind === 'wild') {
      const e = rollRecruit(this.rng, b);
      if (e) {
        const m = createMonster(this.rng, {
          uuid: this.newId(),
          speciesId: e.speciesId,
          level: e.level,
          gender: this.rng.pick(['M', 'F'] as const),
        });
        const placed = this.addMonster(m) !== 'full';
        summary.recruited = { monster: m, placed };
      }
    }
    return summary;
  }

  /** 牧舎が満杯のときの加入処理。releaseUuid を手放して入れ替える、null なら見送る。 */
  resolveRecruit(m: MonsterInstance, releaseUuid: string | null): void {
    if (!releaseUuid) return;
    if (releaseUuid === m.uuid) return;
    this.releaseMonster(releaseUuid);
    this.addMonster(m);
  }

  /** ダンジョン中の敗北・ボス撃破後の処理 */
  defeatReturn(): void {
    this.leaveDungeon();
    this.healAll();
  }

  clearGate(gateId: string): void {
    this.setFlag(`${gateId}Clear`, true);
    if (gateId === 'gate08') this.setFlag('gateAnomalyResolved', true);
    this.leaveDungeon();
    this.healAll();
  }

  // ---------- 大会 ----------

  tournamentFee(t: TournamentDef): number {
    return [0, 0, 100, 300, 600, 0][t.rank] ?? 0;
  }
  tournamentPrize(t: TournamentDef): number {
    return [0, 200, 500, 1000, 2000, 5000][t.rank] ?? 0;
  }

  tournamentStatus(t: TournamentDef): { state: 'cleared' | 'available' | 'locked'; reason?: string } {
    if (this.tournamentRank >= t.rank) return { state: 'cleared' };
    if (this.tournamentRank < t.rank - 1) return { state: 'locked', reason: '前のランクを勝ち抜いてください。' };
    if (!this.flag(t.requires)) return { state: 'locked', reason: '条件: ' + describeRequirement(t.requires) };
    return { state: 'available' };
  }

  canEnterTournament(t: TournamentDef): string | null {
    const st = this.tournamentStatus(t);
    if (st.state !== 'available') return st.reason ?? 'すでに優勝済みです。';
    if (this.save.gold < this.tournamentFee(t)) return '参加費が足りません。';
    if (this.party.every((m) => m.currentHp <= 0)) return 'パーティが全員戦闘不能です。';
    return null;
  }

  /** 試合間の小休憩: HP/MP を最大の 40% 回復(全快はしない) */
  tournamentBreak(): void {
    for (const m of this.party) {
      if (m.currentHp <= 0) continue;
      m.currentHp = Math.min(m.stats.hp, m.currentHp + Math.ceil(m.stats.hp * 0.4));
      m.currentMp = Math.min(m.stats.mp, m.currentMp + Math.ceil(m.stats.mp * 0.4));
    }
  }

  /** 優勝時の処理 */
  winTournament(t: TournamentDef): void {
    this.setFlag('tournamentRank', t.rank);
    this.save.gold = Math.min(999999, this.save.gold + this.tournamentPrize(t));
    if (t.rank >= 2) this.setFlag('breedingUnlocked', true);
    if (t.rank === 5) this.setFlag('endingSeen', true);
    this.healAll();
  }

  // ---------- 道具 ----------

  buy(itemId: string, n: number): string | null {
    const it = getItem(itemId);
    if (it.price === null) return '買えません。';
    if (!Number.isInteger(n) || n <= 0) return '個数が不正です。';
    if (this.count(itemId) + n > it.maxStack) return `持ちきれません(上限${it.maxStack})。`;
    if (this.save.gold < it.price * n) return 'ゴールドが足りません。';
    this.save.gold -= it.price * n;
    this.save.inventory[itemId] = this.count(itemId) + n;
    return null;
  }

  sell(itemId: string, n: number): string | null {
    const it = getItem(itemId);
    if (it.price === null) return '売れません。';
    if (!Number.isInteger(n) || n <= 0 || this.count(itemId) < n) return '個数が不正です。';
    this.save.gold = Math.min(999999, this.save.gold + Math.floor(it.price / 2) * n);
    this.save.inventory[itemId] = this.count(itemId) - n;
    return null;
  }

  /** 戦闘外でのアイテム使用。成功なら null、失敗は理由。 */
  useItemOn(itemId: string, uuid: string): string | null {
    const it = getItem(itemId);
    if (this.count(itemId) <= 0) return '持っていません。';
    const m = this.monster(uuid);
    const [kind, val] = it.effect.split(/[+:]/);
    if (it.permStat) {
      m.bonusStats[it.permStat.stat] += it.permStat.amount;
      recomputeStats(m);
      m.currentHp = Math.min(m.stats.hp, m.currentHp + (it.permStat.stat === 'hp' ? it.permStat.amount : 0));
    } else if (kind === 'hp') {
      if (m.currentHp <= 0 || m.currentHp >= m.stats.hp) return '効果がありません。';
      m.currentHp = Math.min(m.stats.hp, m.currentHp + Number(val));
    } else if (kind === 'mp') {
      if (m.currentHp <= 0 || m.currentMp >= m.stats.mp) return '効果がありません。';
      m.currentMp = Math.min(m.stats.mp, m.currentMp + Number(val));
    } else return 'ここでは使えません。';
    this.save.inventory[itemId] = this.count(itemId) - 1;
    return null;
  }

  // ---------- 配合・孵化 ----------

  previewBreeding(bloodlineUuid: string, partnerUuid: string): BreedPreview {
    if (!this.flag('breedingUnlocked')) return { ok: false, reason: '青銅ランク優勝後に解放されます。' };
    if (this.inDungeon) return { ok: false, reason: 'ダンジョン中は配合できません。' };
    if (bloodlineUuid === partnerUuid) return { ok: false, reason: '同じ個体は選べません。' };
    const a = this.save.monsters[bloodlineUuid];
    const b = this.save.monsters[partnerUuid];
    if (!a || !b) return { ok: false, reason: '幻獣が見つかりません。' };
    if (a.gender === b.gender) return { ok: false, reason: '♂と♀を選んでください。' };
    if (a.level < BREED_MIN_LEVEL || b.level < BREED_MIN_LEVEL) return { ok: false, reason: `両方Lv${BREED_MIN_LEVEL}以上が必要です。` };
    if (this.save.eggs.length >= MAX_EGGS) return { ok: false, reason: '卵がいっぱいです。' };
    const childSpeciesId = resolveBreeding(a.speciesId, b.speciesId);
    const child = getSpecies(childSpeciesId);
    const bonus = zeroStats();
    for (const k of STAT_KEYS) bonus[k] = Math.min(999, Math.floor((a.stats[k] + b.stats[k]) / 20));
    const plus = Math.min(99, Math.floor((a.plus + b.plus) / 2) + 1);
    const cand: string[] = [];
    for (const id of [...a.knownSkillIds, ...b.knownSkillIds, ...a.inheritedSkillCandidates, ...b.inheritedSkillCandidates]) {
      if (!child.nativeSkillIds.includes(id) && !cand.includes(id)) cand.push(id);
    }
    return { ok: true, childSpeciesId, bonusStats: bonus, plus, inheritedSkillCandidates: cand.slice(0, MAX_CANDIDATES) };
  }

  /** 配合を確定する。親は消え、卵ができる。呼び出し側は mutate() で包んで保存すること。 */
  breed(bloodlineUuid: string, partnerUuid: string): string {
    const p = this.previewBreeding(bloodlineUuid, partnerUuid);
    if (!p.ok) throw new Error(p.reason);
    const eggId = this.newId();
    this.save.eggs.push({
      uuid: eggId,
      speciesId: p.childSpeciesId!,
      gender: this.rng.pick(['M', 'F'] as const),
      plus: p.plus!,
      bonusStats: p.bonusStats!,
      inheritedSkillCandidates: p.inheritedSkillCandidates!,
      hatchProgress: 0,
    });
    this.removeMonsterRaw(bloodlineUuid);
    this.removeMonsterRaw(partnerUuid);
    this.fillParty();
    return eggId;
  }

  private removeMonsterRaw(uuid: string): void {
    delete this.save.monsters[uuid];
    this.save.partyUuids = this.save.partyUuids.filter((u) => u !== uuid);
    this.save.barnUuids = this.save.barnUuids.filter((u) => u !== uuid);
  }

  hatchEgg(eggUuid: string): MonsterInstance {
    const egg = this.save.eggs.find((e) => e.uuid === eggUuid);
    if (!egg) throw new Error('卵が見つかりません。');
    if (egg.hatchProgress < HATCH_THRESHOLD) throw new Error('まだ孵化できません。');
    if (this.monsterCount >= MAX_MONSTERS) throw new Error('牧舎がいっぱいです。');
    const m = createMonster(this.rng, {
      uuid: this.newId(),
      speciesId: egg.speciesId,
      level: 1,
      gender: egg.gender,
      plus: egg.plus,
      bonusStats: egg.bonusStats,
      inheritedSkillCandidates: egg.inheritedSkillCandidates,
    });
    this.save.eggs = this.save.eggs.filter((e) => e.uuid !== eggUuid);
    this.addMonster(m);
    return m;
  }
}

export function describeRequirement(flag: string): string {
  const g = /^gate0(\d)Clear$/.exec(flag);
  if (g) return `${getGate('gate0' + g[1]).name}をクリア`;
  if (flag === 'introDone') return '最初の幻獣を受け取る';
  return flag;
}

export { GATES, TOURNAMENTS, MONSTERS, CURRENT_SCHEMA_VERSION };
