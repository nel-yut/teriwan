import type { BattleSummary } from '../../application/game';
import { getItem } from '../../application/game';
import { ITEMS } from '../../data/items';
import { STATUS_LABEL, STRATEGY_LABEL, combatantStatusList, type Battle, type BattleEvent, type Combatant, type Command, type Strategy } from '../../domain/battle';
import { getSkill, getSpecies, monsterName } from '../../domain/monster';
import type { App } from '../app';
import { monsterSvg } from '../art';
import { bar, h, sleep } from '../dom';
import { sfx } from '../sfx';

const BATTLE_ITEMS = ['IT01', 'IT02', 'IT03', 'IT04', 'IT05'];
const MEAT_ITEMS = ['IT07', 'IT08', 'IT09'];

export type BattleKind = 'wild' | 'boss' | 'tournament';

/** 戦闘 UI。終了後に結果を game へ反映し、BattleSummary を返す。 */
export async function runBattle(app: App, battle: Battle, kind: BattleKind, intro: string): Promise<BattleSummary> {
  const g = app.g;
  const logLines: string[] = [intro];
  let snap: BattleEvent['snap'] | null = null;
  let skip = false;
  const flashed = new Set<string>();

  const logBox = h('div', { class: 'log', 'aria-live': 'polite' });
  const field = h('div', { class: 'field-view' });
  const cmdBox = h('div', { class: 'cmds' });
  const root = h('div', { class: 'overlay solid battle' }, field, logBox, cmdBox);
  document.body.append(root);
  logBox.addEventListener('click', () => (skip = true));

  const hpOf = (c: Combatant) => snap?.[c.id]?.hp ?? c.hp;
  const mpOf = (c: Combatant) => snap?.[c.id]?.mp ?? c.mp;

  const renderEnemy = (c: Combatant) => {
    const hp = hpOf(c);
    return h(
      'div',
      { class: `unit enemy${hp <= 0 ? ' dead' : ''}${flashed.has(c.id) ? ' hit' : ''}` },
      h('div', { class: 'sprite', html: monsterSvg(c.speciesId, c.isBoss ? 120 : 84) }),
      h('div', { class: 'nm' }, c.name, c.isBoss ? ' 👑' : ''),
      bar(hp, c.maxHp),
      h('div', { class: 'st' }, combatantStatusList(c).map((s) => STATUS_LABEL[s]).join(' ')),
    );
  };
  const renderAlly = (c: Combatant) => {
    const hp = hpOf(c);
    return h(
      'div',
      { class: `unit ally${hp <= 0 ? ' dead' : ''}${flashed.has(c.id) ? ' hit' : ''}` },
      h('div', { class: 'sprite', html: monsterSvg(c.speciesId, 64) }),
      h('div', { class: 'nm' }, `${c.name} Lv${c.level}`),
      bar(hp, c.maxHp),
      h('div', { class: 'num' }, `HP ${hp}/${c.maxHp}`),
      bar(mpOf(c), c.maxMp, 'mp'),
      h('div', { class: 'num' }, `MP ${mpOf(c)}/${c.maxMp}`),
      h('div', { class: 'st' }, combatantStatusList(c).map((s) => STATUS_LABEL[s]).join(' ')),
    );
  };
  const renderField = () => {
    field.replaceChildren(h('div', { class: 'row-enemies' }, battle.enemies.map(renderEnemy)), h('div', { class: 'row-allies' }, battle.allies.map(renderAlly)));
  };
  const renderLog = () => {
    logBox.replaceChildren(...logLines.slice(-4).map((t) => h('p', null, t)));
  };
  const say = (t: string) => {
    logLines.push(t);
    renderLog();
  };

  const playEvents = async (events: BattleEvent[]) => {
    skip = false;
    let prev: Record<string, number> = Object.fromEntries(battle.all.map((c) => [c.id, c.hp]));
    // 最初の snap より前の HP は戦闘前の値のはず
    snap = null;
    for (const ev of events) {
      say(ev.text);
      flashed.clear();
      for (const [id, v] of Object.entries(ev.snap)) {
        if (prev[id] !== undefined && v.hp < prev[id]!) flashed.add(id);
        prev[id] = v.hp;
      }
      if (flashed.size) sfx.hit();
      else if (/回復|息を吹き返した/.test(ev.text)) sfx.heal();
      snap = ev.snap;
      renderField();
      await sleep(skip ? 40 : app.textDelay);
    }
    flashed.clear();
    snap = null;
    renderField();
  };

  // ---------- コマンド入力 ----------

  const restore: { fn: (() => void) | null } = { fn: null };

  const aliveAllies = () => battle.allies.filter((a) => a.hp > 0);

  const pickTarget = async (side: 'enemy' | 'ally', includeDead = false): Promise<string | null | undefined> => {
    const pool = (side === 'enemy' ? battle.enemies : battle.allies).filter((c) => (includeDead ? c.hp <= 0 : c.hp > 0));
    if (pool.length === 0) return undefined;
    if (pool.length === 1 && side === 'enemy') return pool[0]!.id;
    return app.choose(
      side === 'enemy' ? 'だれを?' : 'だれに?',
      pool.map((c) => ({ label: c.name, value: c.id, sub: `HP ${c.hp}/${c.maxHp}` })),
    );
  };

  const chooseCommand = async (a: Combatant): Promise<Command | 'back'> => {
    for (;;) {
      const act = await app.choose<string>(`${a.name}はどうする?`, [
        { label: 'たたかう', value: 'attack' },
        { label: 'とくぎ', value: 'skill', disabled: a.skills.length === 0 },
        { label: 'どうぐ', value: 'item', disabled: !battle.allowItems },
        { label: 'ぼうぎょ', value: 'defend' },
        { label: 'にげる', value: 'flee', disabled: !battle.canFlee },
      ], 'もどる');
      if (act === null) return 'back';
      if (act === 'attack') {
        const t = await pickTarget('enemy');
        if (t === null) continue;
        return { kind: 'attack', targetId: t };
      }
      if (act === 'defend') return { kind: 'defend' };
      if (act === 'flee') return { kind: 'flee' };
      if (act === 'skill') {
        const sid = await app.choose(
          'とくぎ',
          a.skills.map((id) => {
            const s = getSkill(id);
            const cost = s.mp > 0 ? `MP${s.mp}` : 'MP0';
            return { label: s.name, value: id, sub: cost, disabled: a.mp < s.mp || (a.status.silence !== undefined && s.category !== 'physical') };
          }),
        );
        if (!sid) continue;
        const sk = getSkill(sid);
        if (sk.target === 'enemy1') {
          const t = await pickTarget('enemy');
          if (t === null) continue;
          return { kind: 'skill', skillId: sid, targetId: t };
        }
        if (sk.target === 'ally1') {
          const t = await pickTarget('ally', sk.effect?.startsWith('revive'));
          if (t === null) continue;
          return { kind: 'skill', skillId: sid, targetId: t };
        }
        return { kind: 'skill', skillId: sid };
      }
      if (act === 'item') {
        const items = [...BATTLE_ITEMS, ...MEAT_ITEMS].filter((id) => (battle.inventory[id] ?? 0) > 0);
        if (items.length === 0) {
          app.toast('使えるどうぐがありません。');
          continue;
        }
        const iid = await app.choose(
          'どうぐ',
          items.map((id) => ({ label: getItem(id).name, value: id, sub: `×${battle.inventory[id]}` })),
        );
        if (!iid) continue;
        if (MEAT_ITEMS.includes(iid)) return { kind: 'item', itemId: iid };
        const t = await pickTarget('ally');
        if (t === null) continue;
        return { kind: 'item', itemId: iid, targetId: t };
      }
    }
  };

  const setStrategy = async () => {
    const s = await app.choose<Strategy>(
      '作戦',
      (Object.keys(STRATEGY_LABEL) as Strategy[]).map((v) => ({ label: STRATEGY_LABEL[v], value: v, sub: v === g.strategy ? '現在の作戦' : undefined })),
    );
    if (!s) return;
    g.strategy = s;
    app.settings.strategy = s;
    app.saveSettings();
    for (const a of battle.allies) a.strategy = s;
  };

  const askTurn = (): Promise<Record<string, Command | undefined>> =>
    new Promise((resolve) => {
      const go = async () => {
        const cmds: Record<string, Command | undefined> = {};
        if (g.strategy === 'meirei') {
          for (const a of aliveAllies()) {
            const c = await chooseCommand(a);
            if (c === 'back') return render();
            cmds[a.id] = c;
          }
        }
        cmdBox.replaceChildren();
        resolve(cmds);
      };
      const render = () => {
        cmdBox.replaceChildren(
          h('div', { class: 'strategy' }, `作戦: ${STRATEGY_LABEL[g.strategy]}`),
          h('div', { class: 'cmd-row' },
            h('button', { class: 'btn primary', onclick: () => void go() }, g.strategy === 'meirei' ? 'めいれいする' : 'たたかう'),
            h('button', { class: 'btn', onclick: () => void setStrategy().then(render) }, '作戦'),
            g.strategy !== 'meirei' ? h('button', { class: 'btn', disabled: !battle.allowItems, onclick: () => void useItemFree() }, 'どうぐ') : null,
            h('button', { class: 'btn', disabled: !battle.canFlee, onclick: () => void flee() }, 'にげる'),
          ),
        );
      };
      const flee = async () => {
        // 逃走は 1 体目の「めいれい」として扱う
        const a = aliveAllies()[0]!;
        const prev = a.strategy;
        a.strategy = 'meirei';
        cmdBox.replaceChildren();
        restore.fn = () => (a.strategy = prev);
        resolve({ [a.id]: { kind: 'flee' } });
      };
      const useItemFree = async () => {
        const a = aliveAllies()[0]!;
        const c = await chooseCommandItemOnly(a);
        if (!c) return;
        const prev = a.strategy;
        a.strategy = 'meirei';
        restore.fn = () => (a.strategy = prev);
        cmdBox.replaceChildren();
        resolve({ [a.id]: c });
      };
      render();
    });


  const chooseCommandItemOnly = async (a: Combatant): Promise<Command | null> => {
    const items = [...BATTLE_ITEMS, ...MEAT_ITEMS].filter((id) => (battle.inventory[id] ?? 0) > 0);
    if (items.length === 0) {
      app.toast('使えるどうぐがありません。');
      return null;
    }
    const iid = await app.choose('どうぐ(使った幻獣のターンを消費します)', items.map((id) => ({ label: getItem(id).name, value: id, sub: `×${battle.inventory[id]}` })));
    if (!iid) return null;
    if (MEAT_ITEMS.includes(iid)) return { kind: 'item', itemId: iid };
    const t = await pickTarget('ally');
    if (t === null) return null;
    void a;
    return { kind: 'item', itemId: iid, targetId: t };
  };

  // ---------- 戦闘ループ ----------
  for (const a of battle.allies) a.strategy = g.strategy;
  renderField();
  renderLog();
  sfx.encounter();
  await sleep(500);

  while (battle.phase === 'command') {
    const cmds = await askTurn();
    const events = battle.playTurn(cmds);
    restore.fn?.();
    restore.fn = null;
    for (const a of battle.allies) a.strategy = g.strategy;
    await playEvents(events);
  }

  // ---------- 結果 ----------
  const summary = g.finishBattle(battle, kind);
  renderField();
  if (summary.result === 'victory') {
    sfx.win();
    say('戦いに勝った!');
    const lines: string[] = [`経験値 ${summary.exp}  /  ${summary.gold}G を手に入れた!`];
    for (const lu of summary.levelUps) {
      lines.push(`${lu.name} は Lv${lu.from} → Lv${lu.to} に上がった!`);
      for (const s of lu.learned) lines.push(`　${getSkill(s).name} を覚えた!`);
    }
    if (summary.hatched.length) lines.push('🥚 孵化できる卵がある! 孵化所へ行こう。');
    if (summary.levelUps.length) sfx.levelUp();
    await app.modal('勝利!', lines.map((t) => h('p', null, t)), 'つぎへ');
    if (summary.recruited) await handleRecruit(app, summary.recruited);
  } else if (summary.result === 'defeat') {
    sfx.lose();
    await app.modal('全滅…', [h('p', null, '目の前が真っ暗になった…。ルーメルに運ばれ、手当てを受けた。ゴールドは失っていない。')], 'とじる');
  } else {
    await app.modal('逃走', [h('p', null, 'うまく逃げ切れた。')], 'とじる');
  }
  root.remove();
  void ITEMS;
  void getSpecies;
  void monsterName;
  return summary;
}

async function handleRecruit(app: App, rec: { monster: import('../../infrastructure/save').MonsterInstance; placed: boolean }): Promise<void> {
  const sp = getSpecies(rec.monster.speciesId);
  const g = app.g;
  if (rec.placed) {
    sfx.levelUp();
    await app.modal('仲間になった!', [h('div', { html: monsterSvg(sp.id, 96), class: 'center' }), h('p', { class: 'center' }, `${sp.name}(Lv${rec.monster.level} ${rec.monster.gender === 'M' ? '♂' : '♀'}) が仲間に加わった!`)], 'やった!');
    return;
  }
  const options = g.allMonsters.map((m) => ({ label: `${monsterName(m)} Lv${m.level}`, value: m.uuid, sub: `${getSpecies(m.speciesId).rank}ランク ${m.gender === 'M' ? '♂' : '♀'}` }));
  const pick = await app.choose(`${sp.name}が仲間になりたがっている! 牧舎がいっぱいです。誰かと入れ替えますか?`, options, '見送る');
  if (pick) {
    if (await app.confirm('選んだ幻獣とお別れしますか?(元には戻せません)', '入れ替える')) {
      g.resolveRecruit(rec.monster, pick);
      app.toast(`${sp.name}が仲間になった!`);
    }
  } else app.toast(`${sp.name}は去っていった…`);
}
