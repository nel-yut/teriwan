import { ITEMS } from '../data/items';
import { SKILLS } from '../data/skills';
import type { MonsterInstance } from '../infrastructure/save';
import { getSkill, getSpecies } from './monster';
import type { Rng } from './rng';
import type { Element, Personality, ResistMult, SkillDef } from './types';

export type Strategy = 'gungan' | 'bacchiri' | 'inochi' | 'meirei';
export const STRATEGY_LABEL: Record<Strategy, string> = {
  gungan: 'ガンガンいこうぜ',
  bacchiri: 'バッチリがんばれ',
  inochi: 'いのちだいじに',
  meirei: 'めいれいさせろ',
};

export type StatusId = 'sleep' | 'paralysis' | 'poison' | 'confusion' | 'silence' | 'blind';
export const STATUS_LABEL: Record<StatusId, string> = {
  sleep: '眠り',
  paralysis: '麻痺',
  poison: '毒',
  confusion: '混乱',
  silence: '沈黙',
  blind: '暗闇',
};

export interface Combatant {
  id: string;
  side: 'ally' | 'enemy';
  uuid?: string;
  speciesId: string;
  name: string;
  level: number;
  hp: number;
  mp: number;
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
  agi: number;
  int: number;
  skills: string[];
  resist: Partial<Record<Element, ResistMult>>;
  /** 残りターン数。0 は戦闘中ずっと(毒) */
  status: Partial<Record<StatusId, number>>;
  buffs: { atk: { mult: number; turns: number } | null; def: { mult: number; turns: number } | null };
  defending: boolean;
  strategy: Strategy;
  personality: Personality;
  isBoss: boolean;
}

export type Command =
  | { kind: 'attack'; targetId?: string }
  | { kind: 'skill'; skillId: string; targetId?: string }
  | { kind: 'item'; itemId: string; targetId?: string }
  | { kind: 'defend' }
  | { kind: 'flee' };

export interface BattleEvent {
  text: string;
  /** この時点の HP/MP スナップショット */
  snap: Record<string, { hp: number; mp: number }>;
}

export type BattlePhase = 'command' | 'victory' | 'defeat' | 'escape';

export function combatantFromMonster(m: MonsterInstance, id: string, strategy: Strategy = 'bacchiri'): Combatant {
  const sp = getSpecies(m.speciesId);
  return {
    id,
    side: 'ally',
    uuid: m.uuid,
    speciesId: m.speciesId,
    name: m.nickname ?? sp.name,
    level: m.level,
    hp: m.currentHp,
    mp: m.currentMp,
    maxHp: m.stats.hp,
    maxMp: m.stats.mp,
    atk: m.stats.atk,
    def: m.stats.def,
    agi: m.stats.agi,
    int: m.stats.int,
    skills: [...m.knownSkillIds],
    resist: sp.resistances,
    status: {},
    buffs: { atk: null, def: null },
    defending: false,
    strategy,
    personality: m.personality,
    isBoss: false,
  };
}

export interface BattleOptions {
  allies: Combatant[];
  enemies: Combatant[];
  rng: Rng;
  inventory: Record<string, number>;
  canFlee: boolean;
  allowItems: boolean;
}

const MEAT_MULT = 6;

/** 物理ダメージの基礎値。設計書の ATK/2 - DEF/4 では序盤が 1 ダメージ固定になるため係数を調整(調整値) */
/** 呪文・ブレスの与ダメージ係数(HP テンプレートに対し設計書の威力が高いため調整値として抑える) */
export const SPELL_SCALE = 0.6;

export function physBase(atk: number, def: number): number {
  return Math.floor(atk * 0.8 - def * 0.25);
}
const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export class Battle {
  readonly allies: Combatant[];
  readonly enemies: Combatant[];
  readonly rng: Rng;
  readonly inventory: Record<string, number>;
  readonly canFlee: boolean;
  readonly allowItems: boolean;
  phase: BattlePhase = 'command';
  turn = 0;
  /** この戦闘で使った肉の加入ボーナス合計 */
  meatBonus = 0;
  private fleeTries = 0;

  constructor(o: BattleOptions) {
    this.allies = o.allies;
    this.enemies = o.enemies;
    this.rng = o.rng;
    this.inventory = o.inventory;
    this.canFlee = o.canFlee;
    this.allowItems = o.allowItems;
  }

  get all(): Combatant[] {
    return [...this.allies, ...this.enemies];
  }
  alive(side: 'ally' | 'enemy'): Combatant[] {
    return (side === 'ally' ? this.allies : this.enemies).filter((c) => c.hp > 0);
  }
  /** 加入判定に使う倍率 */
  get recruitMultiplier(): number {
    return 1 + this.meatBonus * MEAT_MULT;
  }

  private snap(): BattleEvent['snap'] {
    const s: BattleEvent['snap'] = {};
    for (const c of this.all) s[c.id] = { hp: c.hp, mp: c.mp };
    return s;
  }

  /**
   * 1 ターンを解決する。cmds は味方 id → コマンド。strategy が meirei 以外の味方は AI が選ぶ。
   */
  playTurn(cmds: Record<string, Command | undefined>): BattleEvent[] {
    if (this.phase !== 'command') return [];
    const events: BattleEvent[] = [];
    const say = (text: string) => events.push({ text, snap: this.snap() });
    this.turn += 1;

    for (const c of this.all) c.defending = false;

    // 行動順
    const order = this.all
      .filter((c) => c.hp > 0)
      .map((c, i) => ({ c, i, v: c.agi + this.rng.int(0, Math.floor(c.agi * 0.2)) }))
      .sort((a, b) => b.v - a.v || a.i - b.i);

    // 逃走(最初に判定)
    const fleeBy = this.allies.find((a) => a.hp > 0 && a.strategy === 'meirei' && cmds[a.id]?.kind === 'flee');
    let fleeFailedBy: string | null = null;
    if (fleeBy) {
      if (!this.canFlee) {
        say('ここからは逃げられない!');
        fleeFailedBy = fleeBy.id;
      } else if (this.tryFlee()) {
        say('うまく逃げ切れた!');
        this.phase = 'escape';
        return events;
      } else {
        say('しかし回り込まれてしまった!');
        fleeFailedBy = fleeBy.id;
      }
    }

    for (const { c } of order) {
      if (this.phase !== 'command') break;
      if (c.hp <= 0) continue;
      if (c.id === fleeFailedBy) continue;
      if (!this.canAct(c, say)) continue;

      let cmd: Command | undefined;
      if (c.side === 'ally' && c.strategy === 'meirei') cmd = cmds[c.id];
      if (!cmd || cmd.kind === 'flee') cmd = c.side === 'ally' && c.strategy === 'meirei' ? { kind: 'attack' } : this.chooseAi(c);
      if (c.status.confusion !== undefined && cmd.kind !== 'defend') {
        cmd = { kind: 'attack', targetId: this.rng.pick(this.all.filter((x) => x.hp > 0)).id };
        say(`${c.name}は混乱している!`);
      }
      this.execute(c, cmd, say);
      this.checkEnd();
    }

    if (this.phase === 'command') this.endTurn(say);
    this.checkEnd();
    return events;
  }

  /** 肉を使う(ターンを消費しない簡易版。テストやUIの補助用) */
  feedMeat(itemId: string): boolean {
    const item = ITEM_BY_ID.get(itemId);
    if (!item?.recruitBonus || (this.inventory[itemId] ?? 0) <= 0) return false;
    this.inventory[itemId]! -= 1;
    this.meatBonus = Math.min(this.meatBonus + item.recruitBonus, 1);
    return true;
  }

  private tryFlee(): boolean {
    const avg = (xs: Combatant[]) => xs.reduce((a, c) => a + c.agi, 0) / Math.max(1, xs.length);
    const ratio = avg(this.alive('ally')) / Math.max(1, avg(this.alive('enemy')));
    const p = Math.min(0.95, Math.max(0.1, 0.4 * ratio + 0.15 * this.fleeTries));
    this.fleeTries += 1;
    return this.rng.chance(p);
  }

  private canAct(c: Combatant, say: (t: string) => void): boolean {
    if (c.status.sleep !== undefined) {
      say(`${c.name}は眠っている。`);
      return false;
    }
    if (c.status.paralysis !== undefined && this.rng.chance(0.5)) {
      say(`${c.name}は体がしびれて動けない!`);
      return false;
    }
    return true;
  }

  private checkEnd(): void {
    if (this.phase !== 'command') return;
    if (this.alive('enemy').length === 0) this.phase = 'victory';
    else if (this.alive('ally').length === 0) this.phase = 'defeat';
  }

  private endTurn(say: (t: string) => void): void {
    for (const c of this.all) {
      if (c.hp <= 0) continue;
      if (c.status.poison !== undefined) {
        const d = Math.max(1, Math.floor(c.maxHp / 10));
        c.hp = Math.max(0, c.hp - d);
        say(`${c.name}は毒で${d}のダメージ!`);
        if (c.hp <= 0) this.kill(c, say);
      }
      for (const st of Object.keys(c.status) as StatusId[]) {
        const t = c.status[st];
        if (t === undefined || t === 0) continue;
        if (t <= 1) {
          delete c.status[st];
          say(`${c.name}の${STATUS_LABEL[st]}が治った。`);
        } else c.status[st] = t - 1;
      }
      for (const k of ['atk', 'def'] as const) {
        const b = c.buffs[k];
        if (b) {
          b.turns -= 1;
          if (b.turns <= 0) c.buffs[k] = null;
        }
      }
    }
  }

  private kill(c: Combatant, say: (t: string) => void): void {
    c.hp = 0;
    c.status = {};
    c.buffs = { atk: null, def: null };
    say(`${c.name}は倒れた!`);
  }

  // ---- 行動実行 ----

  private pickTarget(actor: Combatant, want: 'enemy' | 'ally', id?: string, allowDead = false): Combatant | null {
    const side = want === 'enemy' ? (actor.side === 'ally' ? 'enemy' : 'ally') : actor.side;
    const pool = (side === 'ally' ? this.allies : this.enemies).filter((c) => (allowDead ? c.hp <= 0 : c.hp > 0));
    if (pool.length === 0) return null;
    return pool.find((c) => c.id === id) ?? this.rng.pick(pool);
  }

  private execute(actor: Combatant, cmd: Command, say: (t: string) => void): void {
    switch (cmd.kind) {
      case 'defend':
        actor.defending = true;
        say(`${actor.name}は身を守っている。`);
        return;
      case 'attack': {
        const t = this.pickTarget(actor, 'enemy', cmd.targetId);
        if (!t) return;
        say(`${actor.name}のこうげき!`);
        this.hitPhysical(actor, t, 1, say);
        return;
      }
      case 'skill': {
        const sk = getSkill(cmd.skillId);
        if (!actor.skills.includes(sk.id)) return this.execute(actor, { kind: 'attack' }, say);
        if (actor.mp < sk.mp || (actor.status.silence !== undefined && sk.category !== 'physical')) {
          say(actor.status.silence !== undefined ? `${actor.name}は声が出せない!` : `${actor.name}はMPが足りない!`);
          return;
        }
        actor.mp -= sk.mp;
        say(`${actor.name}の${sk.name}!`);
        this.useSkill(actor, sk, cmd.targetId, say);
        return;
      }
      case 'item': {
        if (!this.allowItems) return;
        this.useItem(actor, cmd.itemId, cmd.targetId, say);
        return;
      }
      case 'flee':
        return;
    }
  }

  private variance(base: number): number {
    return Math.round(base * (this.rng.next() * 0.2 - 0.1));
  }

  private atkOf(c: Combatant): number {
    return Math.floor(c.atk * (c.buffs.atk?.mult ?? 1));
  }
  private defOf(c: Combatant): number {
    return Math.floor(c.def * (c.buffs.def?.mult ?? 1));
  }

  private damage(target: Combatant, amount: number, say: (t: string) => void): void {
    const d = Math.max(0, Math.min(999, Math.floor(amount)));
    const dealt = Math.min(d, target.hp);
    target.hp -= dealt;
    say(`${target.name}に${d}のダメージ!`);
    if (target.hp <= 0) this.kill(target, say);
    else if (target.status.sleep !== undefined && this.rng.chance(0.5)) {
      delete target.status.sleep;
      say(`${target.name}は目を覚ました。`);
    }
  }

  private hitPhysical(a: Combatant, t: Combatant, mult: number, say: (x: string) => void): void {
    if (a.status.blind !== undefined && this.rng.chance(0.5)) {
      say('しかし攻撃は外れた!');
      return;
    }
    let base = physBase(this.atkOf(a), this.defOf(t));
    base = Math.max(1, base + this.variance(base));
    base = Math.floor(base * mult);
    if (this.rng.chance(1 / 32)) {
      base = Math.floor(base * 1.5);
      say('会心の一撃!');
    }
    if (t.defending) base = Math.floor(base / 2);
    base = Math.floor(base * (t.resist.physical ?? 1));
    this.damage(t, Math.max(1, base), say);
  }

  private useSkill(a: Combatant, sk: SkillDef, targetId: string | undefined, say: (t: string) => void): void {
    const enemySide = sk.target === 'enemy1' || sk.target === 'enemyAll' || sk.target === 'enemyRandom2';
    let targets: Combatant[] = [];
    if (sk.target === 'enemyAll') targets = this.alive(a.side === 'ally' ? 'enemy' : 'ally');
    else if (sk.target === 'allyAll') targets = this.alive(a.side);
    else if (sk.target === 'enemyRandom2') {
      const pool = this.alive(a.side === 'ally' ? 'enemy' : 'ally');
      if (pool.length) targets = [this.rng.pick(pool), this.rng.pick(pool)];
    } else {
      const revive = sk.effect?.startsWith('revive');
      const t = this.pickTarget(a, enemySide ? 'enemy' : 'ally', targetId, !!revive);
      if (t) targets = [t];
    }
    if (targets.length === 0) {
      say('しかし効果がなかった。');
      return;
    }
    for (const t of targets) {
      if (sk.category === 'physical') {
        if (t.hp > 0) this.hitPhysical(a, t, sk.power, say);
        if (t.hp > 0 && sk.effect === 'def-down') this.setBuff(t, 'def', 0.75, 3, say);
      } else if (sk.category === 'spell' || sk.category === 'breath' || sk.category === 'special') {
        const raw = sk.power + Math.floor(a.int * sk.intScale);
        const res = sk.element === 'none' ? 1 : (t.resist[sk.element] ?? 1);
        const v = Math.floor((raw + this.variance(raw)) * res * SPELL_SCALE);
        this.damage(t, Math.max(1, v), say);
      } else if (sk.category === 'heal') {
        this.applyHealSkill(a, sk, t, say);
      } else if (sk.category === 'support') {
        this.applySupport(sk, t, say);
      } else if (sk.category === 'status') {
        const st = sk.effect?.split(':')[1] as StatusId | undefined;
        if (st) this.inflict(t, st, 3, say, 0.65);
      }
    }
  }

  private applyHealSkill(a: Combatant, sk: SkillDef, t: Combatant, say: (x: string) => void): void {
    const eff = sk.effect ?? '';
    if (eff.startsWith('revive')) {
      if (t.hp > 0) return say('しかし効果がなかった。');
      const frac = Number(eff.split(':')[1] ?? 0.3);
      t.hp = Math.max(1, Math.floor(t.maxHp * frac));
      say(`${t.name}は息を吹き返した!`);
    } else if (eff.startsWith('cure')) {
      if (t.hp <= 0) return;
      for (const s of eff.split(':')[1]!.split(',') as StatusId[]) delete t.status[s];
      say(`${t.name}の状態異常が治った。`);
    } else {
      if (t.hp <= 0) return;
      const amt = sk.power + Math.floor(a.int * sk.intScale);
      const got = Math.min(amt, t.maxHp - t.hp);
      t.hp += got;
      say(`${t.name}のHPが${got}回復した。`);
    }
  }

  private applySupport(sk: SkillDef, t: Combatant, say: (x: string) => void): void {
    const eff = (sk.effect ?? '').split(':');
    if (eff[0] === 'def-up') this.setBuff(t, 'def', 1 + Number(eff[1]), Number(eff[2]), say);
    else if (eff[0] === 'atk-up') this.setBuff(t, 'atk', 1 + Number(eff[1]), Number(eff[2]), say);
    else if (eff[0] === 'accuracy-down') this.inflict(t, 'blind', Number(eff[1] ?? 3), say, 0.75);
  }

  private setBuff(t: Combatant, k: 'atk' | 'def', mult: number, turns: number, say: (x: string) => void): void {
    t.buffs[k] = { mult, turns };
    say(`${t.name}の${k === 'atk' ? '攻撃' : '守備'}が${mult >= 1 ? '上がった' : '下がった'}!`);
  }

  private inflict(t: Combatant, st: StatusId, turns: number, say: (x: string) => void, p: number): void {
    const chance = t.isBoss ? p * 0.4 : p;
    if (t.hp <= 0) return;
    if (t.status[st] !== undefined || !this.rng.chance(chance)) return say(`${t.name}には効かなかった。`);
    t.status[st] = st === 'poison' ? 0 : turns;
    say(`${t.name}は${STATUS_LABEL[st]}になった!`);
  }

  private useItem(a: Combatant, itemId: string, targetId: string | undefined, say: (t: string) => void): void {
    const item = ITEM_BY_ID.get(itemId);
    if (!item || (this.inventory[itemId] ?? 0) <= 0 || a.side !== 'ally') return;
    if (item.recruitBonus !== undefined) {
      this.inventory[itemId]! -= 1;
      this.meatBonus = Math.min(this.meatBonus + item.recruitBonus, 1);
      say(`${a.name}は${item.name}を投げた! 敵が興味を示している…`);
      return;
    }
    const t = this.pickTarget(a, 'ally', targetId);
    if (!t) return;
    const [kind, val] = item.effect.split(/[+:]/);
    if (kind === 'hp') {
      const got = Math.min(Number(val), t.maxHp - t.hp);
      t.hp += got;
      say(`${a.name}は${item.name}を使った。${t.name}のHPが${got}回復!`);
    } else if (kind === 'mp') {
      const got = Math.min(Number(val), t.maxMp - t.mp);
      t.mp += got;
      say(`${a.name}は${item.name}を使った。${t.name}のMPが${got}回復!`);
    } else if (kind === 'cure') {
      for (const s of (val ?? '').split(',') as StatusId[]) delete t.status[s];
      say(`${a.name}は${item.name}を使った。${t.name}の状態異常が治った。`);
    } else return;
    this.inventory[itemId]! -= 1;
  }

  // ---- 作戦 AI ----

  /** 期待ダメージ(耐性・防御込み、乱数なし) */
  private expected(a: Combatant, sk: SkillDef | null, t: Combatant): number {
    if (!sk) return Math.max(1, physBase(this.atkOf(a), this.defOf(t))) * (t.resist.physical ?? 1);
    if (sk.category === 'physical') {
      return Math.max(1, physBase(this.atkOf(a), this.defOf(t))) * sk.power * (t.resist.physical ?? 1);
    }
    const raw = sk.power + Math.floor(a.int * sk.intScale);
    return raw * SPELL_SCALE * (sk.element === 'none' ? 1 : (t.resist[sk.element] ?? 1));
  }

  chooseAi(a: Combatant): Command {
    const strat: Strategy = a.strategy === 'meirei' ? 'bacchiri' : a.strategy;
    const foes = this.alive(a.side === 'ally' ? 'enemy' : 'ally');
    const friends = this.alive(a.side);
    const silenced = a.status.silence !== undefined;
    const usable = a.skills
      .map(getSkill)
      .filter((s) => a.mp >= s.mp && (!silenced || s.category === 'physical'));
    const weakest = [...friends].sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
    const frac = weakest ? weakest.hp / weakest.maxHp : 1;
    const dead = (a.side === 'ally' ? this.allies : this.enemies).filter((c) => c.hp <= 0);

    const heals = usable.filter((s) => s.category === 'heal' && !s.effect);
    const revive = usable.find((s) => s.effect?.startsWith('revive'));
    const cures = usable.filter((s) => s.effect?.startsWith('cure'));

    const healThreshold = strat === 'inochi' ? 0.65 : strat === 'bacchiri' ? 0.4 : -1;
    if (revive && dead.length && strat !== 'gungan' && this.rng.chance(0.7)) {
      return { kind: 'skill', skillId: revive.id, targetId: dead[0]!.id };
    }
    if (heals.length && weakest && frac < healThreshold) {
      const best = heals.find((s) => s.target === 'allyAll' && friends.filter((f) => f.hp / f.maxHp < 0.6).length >= 2) ?? heals[0]!;
      return { kind: 'skill', skillId: best.id, targetId: weakest.id };
    }
    if (strat === 'inochi') {
      const sick = friends.find((f) => f.status.poison !== undefined || f.status.paralysis !== undefined || f.status.sleep !== undefined);
      if (sick && cures.length) return { kind: 'skill', skillId: cures[0]!.id, targetId: sick.id };
      if (a.hp / a.maxHp < 0.3 && this.rng.chance(0.5)) return { kind: 'defend' };
    }
    if (strat === 'bacchiri' && this.turn <= 2 && this.rng.chance(0.5)) {
      const buff = usable.find((s) => s.category === 'support' && s.effect !== undefined && !s.effect.startsWith('accuracy'));
      if (buff && friends.some((f) => !f.buffs.atk && !f.buffs.def)) return { kind: 'skill', skillId: buff.id };
      const st = usable.find((s) => s.category === 'status');
      if (st && foes.length) {
        const t = foes.find((f) => Object.keys(f.status).length === 0);
        if (t && this.rng.chance(0.6)) return { kind: 'skill', skillId: st.id, targetId: t.id };
      }
    }
    if (foes.length === 0) return { kind: 'defend' };

    // 攻撃系を評価
    const attackSkills = usable.filter((s) => ['physical', 'spell', 'breath', 'special'].includes(s.category));
    const options: { cmd: Command; score: number }[] = [];
    const weakestFoe = [...foes].sort((x, y) => x.hp - y.hp)[0]!;
    const baseTarget = (): Combatant => (this.rng.chance(0.5) ? weakestFoe : this.rng.pick(foes));
    const t0 = baseTarget();
    options.push({ cmd: { kind: 'attack', targetId: t0.id }, score: this.expected(a, null, t0) });
    for (const s of attackSkills) {
      const multi = s.target === 'enemyAll' || s.target === 'enemyRandom2';
      const t = baseTarget();
      let score = multi ? foes.reduce((x, f) => x + this.expected(a, s, f), 0) * (s.target === 'enemyRandom2' ? 0.7 : 1) : this.expected(a, s, t);
      if (s.category === 'physical' && s.power > 1.2) score *= 1.0;
      const mpPenalty = strat === 'gungan' ? 0 : strat === 'bacchiri' ? s.mp * 0.8 : s.mp * 2;
      // MP が残り少ない時は温存(いのちだいじに)
      score -= mpPenalty;
      options.push({ cmd: { kind: 'skill', skillId: s.id, targetId: t.id }, score });
    }
    options.sort((x, y) => y.score - x.score);
    const noise = a.personality === 'wild' ? 0.35 : a.personality === 'careful' ? 0.05 : 0.15;
    if (options.length > 1 && this.rng.chance(noise)) return this.rng.pick(options.slice(0, 2)).cmd;
    return options[0]!.cmd;
  }
}

export function combatantStatusList(c: Combatant): StatusId[] {
  return Object.keys(c.status) as StatusId[];
}

/** 全技を ID から引ける(UI 用) */
export const ALL_SKILLS = SKILLS;
