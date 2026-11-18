import { HATCH_THRESHOLD, MAX_EGGS, MAX_MONSTERS, getItem, describeRequirement } from '../../application/game';
import { ITEMS } from '../../data/items';
import { MONSTERS } from '../../data/monsters';
import { TOURNAMENTS, GATES } from '../../data/world';
import { TRAINER_NAMES, tournamentOpponents } from '../../domain/encounter';
import { computeStats, getSkill, getSpecies, monsterName, zeroStats } from '../../domain/monster';
import { FAMILY_IDS, STAT_KEYS, type FamilyId, type StatKey } from '../../domain/types';
import type { MonsterInstance } from '../../infrastructure/save';
import type { App } from '../app';
import { FAMILY_NAMES, monsterSvg } from '../art';
import { bar, h } from '../dom';
import { eggPixelUrl } from '../pixel';
import { sfx } from '../sfx';
import { runBattle } from './battle';

const STAT_LABEL: Record<StatKey, string> = { hp: 'HP', mp: 'MP', atk: 'こうげき', def: 'しゅび', agi: 'すばやさ', int: 'かしこさ' };
const gender = (m: { gender: 'M' | 'F' }) => (m.gender === 'M' ? '♂' : '♀');
const PERSONALITY = { brave: '勇敢', careful: '慎重', gentle: 'おだやか', wild: 'あばれん坊' } as const;

const backRow = (app: App, to: Parameters<App['go']>[0] = 'base') => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => app.go(to) }, 'もどる'));

// ============ 牧舎 ============

export function partyScreen(app: App): void {
  const g = app.g;
  let sort: 'party' | 'level' | 'rank' | 'species' = 'party';

  const draw = () => {
    const partyIds = new Set(g.save.partyUuids);
    const all = [...g.allMonsters];
    const rankVal = (m: MonsterInstance) => 'EDCBAS'.indexOf(getSpecies(m.speciesId).rank);
    if (sort === 'level') all.sort((a, b) => b.level - a.level);
    else if (sort === 'rank') all.sort((a, b) => rankVal(b) - rankVal(a) || b.level - a.level);
    else if (sort === 'species') all.sort((a, b) => a.speciesId.localeCompare(b.speciesId));
    const row = (m: MonsterInstance) => {
      const sp = getSpecies(m.speciesId);
      return h(
        'button',
        { class: `mon-row${partyIds.has(m.uuid) ? ' in-party' : ''}${m.currentHp <= 0 ? ' dead' : ''}`, onclick: () => void detail(m) },
        h('div', { class: 'thumb', html: monsterSvg(m.speciesId, 52) }),
        h('div', { class: 'info' }, h('strong', null, `${monsterName(m)} ${gender(m)}`), h('small', null, `Lv${m.level} ${FAMILY_NAMES[sp.family]}/${sp.rank}${m.plus ? ` +${m.plus}` : ''}`), bar(m.currentHp, m.stats.hp)),
        partyIds.has(m.uuid) ? h('em', { class: 'badge' }, 'パーティ') : null,
      );
    };
    app.mount(
      h(
        'main',
        { class: 'screen' },
        h('h2', null, '幻獣牧舎', h('small', null, ` ${g.monsterCount}/${MAX_MONSTERS}`)),
        h('p', { class: 'fine' }, 'タップで詳細。パーティは最大3体。連れて行く幻獣を選びましょう。'),
        h(
          'div',
          { class: 'row wrap' },
          ...(['party', 'level', 'rank', 'species'] as const).map((k) => h('button', { class: `chip${sort === k ? ' on' : ''}`, onclick: () => ((sort = k), draw()) }, { party: '編成順', level: 'Lv順', rank: 'ランク順', species: '図鑑順' }[k])),
        ),
        h('div', { class: 'list' }, all.map(row)),
        backRow(app),
      ),
    );
  };

  const detail = async (m: MonsterInstance) => {
    const sp = getSpecies(m.speciesId);
    const inParty = g.save.partyUuids.includes(m.uuid);
    const stats = h('div', { class: 'stats' }, ...STAT_KEYS.map((k) => h('div', null, h('span', null, STAT_LABEL[k]), h('b', null, `${m.stats[k]}`), m.bonusStats[k] ? h('small', null, `(+${m.bonusStats[k]})`) : null)));
    const known = m.knownSkillIds.map((id) => getSkill(id));
    const cands = [...sp.nativeSkillIds, ...m.inheritedSkillCandidates].filter((id) => !m.knownSkillIds.includes(id)).map((id) => getSkill(id));
    const body: (Node | null)[] = [
      h('div', { class: 'center', html: monsterSvg(m.speciesId, 120) }),
      h('p', { class: 'center' }, `${sp.name} ${gender(m)} / ${FAMILY_NAMES[sp.family]} ${sp.rank}ランク / ${PERSONALITY[m.personality]}`),
      h('p', { class: 'center' }, `Lv${m.level}  EXP ${m.exp}  配合値 +${m.plus}`),
      stats,
      h('h4', null, `とくぎ(${known.length}/8)`),
      h('p', null, known.length ? known.map((s) => `${s.name}(MP${s.mp})`).join('、') : 'なし'),
      cands.length ? h('h4', null, '習得待ち') : null,
      cands.length ? h('p', { class: 'fine' }, cands.map((s) => `${s.name}(Lv${s.learnLevel}・${Object.entries(s.requires).map(([k, v]) => `${STAT_LABEL[k as StatKey]}${v}`).join(',')})`).join('、')) : null,
      m.genealogy ? h('p', { class: 'fine' }, `親: ${getSpecies(m.genealogy.bloodlineSpeciesId).name} × ${getSpecies(m.genealogy.partnerSpeciesId).name}`) : null,
    ];
    const act = await app.choose<string>(
      `${monsterName(m)}`,
      [
        { label: inParty ? 'パーティから外す' : 'パーティに入れる', value: 'party', disabled: inParty && g.save.partyUuids.length <= 1 },
        { label: 'どうぐを使う', value: 'item' },
        { label: 'なまえをつける', value: 'rename' },
        { label: 'お別れする', value: 'release', disabled: g.monsterCount <= 1 },
      ],
      'とじる',
      body.filter((n): n is Node => n !== null),
    );
    if (act === 'party') {
      if (inParty) g.setParty(g.save.partyUuids.filter((u) => u !== m.uuid));
      else if (g.save.partyUuids.length < 3) g.setParty([...g.save.partyUuids, m.uuid]);
      else {
        const out = await app.choose('だれと入れ替える?', g.party.map((p) => ({ label: `${monsterName(p)} Lv${p.level}`, value: p.uuid })));
        if (!out) return draw();
        g.setParty(g.save.partyUuids.map((u) => (u === out ? m.uuid : u)));
      }
      await app.autosave();
    } else if (act === 'rename') {
      const name = window.prompt('新しい名前(10文字まで・空で元に戻す)', m.nickname ?? '');
      if (name !== null) {
        m.nickname = name.trim().slice(0, 10) || undefined;
        await app.autosave();
      }
    } else if (act === 'release') {
      if (await app.confirm(`${monsterName(m)}とお別れします。元には戻せません。`, 'お別れする')) {
        g.releaseMonster(m.uuid);
        await app.autosave();
      }
    } else if (act === 'item') {
      const ids = ['IT01', 'IT02', 'IT03', 'IT10', 'IT11', 'IT12', 'IT13', 'IT14', 'IT15'].filter((id) => g.count(id) > 0);
      if (ids.length === 0) app.toast('使えるどうぐがありません。');
      else {
        const id = await app.choose('どうぐ', ids.map((i) => ({ label: getItem(i).name, value: i, sub: `×${g.count(i)}` })));
        if (id) {
          const err = g.useItemOn(id, m.uuid);
          if (err) app.toast(err);
          else {
            sfx.heal();
            await app.autosave();
          }
        }
      }
    }
    draw();
  };
  draw();
}

// ============ 配合堂 ============

export function breedingScreen(app: App): void {
  const g = app.g;
  if (!g.flag('breedingUnlocked')) {
    app.mount(h('main', { class: 'screen' }, h('h2', null, '配合堂'), h('p', null, 'ここは「青銅」ランクの大会に優勝すると使えるようになります。'), backRow(app)));
    return;
  }
  let a: string | null = null;
  let b: string | null = null;

  const pick = async (label: string, other: string | null): Promise<string | null> => {
    const list = g.allMonsters.filter((m) => m.uuid !== other);
    return app.choose(
      label,
      list.map((m) => {
        const needs = m.level < 10 ? ' (Lv10未満)' : '';
        return { label: `${monsterName(m)} ${gender(m)} Lv${m.level}`, value: m.uuid, sub: `${getSpecies(m.speciesId).name}${needs}`, disabled: m.level < 10 };
      }),
    );
  };

  const draw = () => {
    const ma = a ? g.save.monsters[a] : undefined;
    const mb = b ? g.save.monsters[b] : undefined;
    const slot = (title: string, m: MonsterInstance | undefined, onPick: () => void) =>
      h('button', { class: 'card pick', onclick: onPick }, h('small', null, title), m ? h('div', { html: monsterSvg(m.speciesId, 72) }) : h('div', { class: 'empty' }, '＋'), h('strong', null, m ? `${monsterName(m)} ${gender(m)}` : 'えらぶ'), m ? h('small', null, `Lv${m.level}`) : null);
    const preview = h('div', { class: 'preview' });
    if (ma && mb) {
      const pv = g.previewBreeding(ma.uuid, mb.uuid);
      if (!pv.ok) preview.append(h('p', { class: 'warn' }, pv.reason ?? ''));
      else {
        const child = getSpecies(pv.childSpeciesId!);
        const st = computeStats(child, 1, pv.bonusStats!);
        const rs = pv.inheritedSkillCandidates!.map((id) => getSkill(id).name);
        preview.append(
          h('h3', null, '生まれる幻獣(予想)'),
          h('div', { class: 'center', html: monsterSvg(child.id, 96) }),
          h('p', { class: 'center' }, `${child.name}(${FAMILY_NAMES[child.family]} / ${child.rank}ランク)`),
          h('div', { class: 'stats' }, ...STAT_KEYS.map((k) => h('div', null, h('span', null, STAT_LABEL[k]), h('b', null, `${st[k]}`), pv.bonusStats![k] ? h('small', null, `(+${pv.bonusStats![k]})`) : null))),
          h('p', null, `配合値 +${pv.plus}  /  Lv上限 ${Math.min(99, 50 + pv.plus!)}`),
          h('p', { class: 'fine' }, rs.length ? `引き継ぐ技の候補: ${rs.join('、')}(Lv・能力が足りるまで使えません)` : '引き継ぐ技の候補: なし'),
          h('p', { class: 'warn' }, '親の2体は消え、卵になります。元には戻せません。'),
          h('button', { class: 'btn primary big', onclick: () => void doBreed(ma, mb) }, '配合する'),
        );
      }
    } else preview.append(h('p', { class: 'fine' }, '♂と♀、どちらもLv10以上の幻獣を選んでください。「血統」側の系統を子が受け継ぎます。'));
    app.mount(
      h(
        'main',
        { class: 'screen' },
        h('h2', null, '配合堂'),
        h('p', { class: 'fine' }, `卵 ${g.save.eggs.length}/${MAX_EGGS}`),
        h('div', { class: 'pair' }, slot('血統', ma, async () => ((a = (await pick('血統(ベース)を選ぶ', b)) ?? a), draw())), h('button', { class: 'btn swap', 'aria-label': '入れ替え', onclick: () => ([a, b] = [b, a], draw()) }, '⇄'), slot('相手', mb, async () => ((b = (await pick('相手を選ぶ', a)) ?? b), draw()))),
        preview,
        backRow(app),
      ),
    );
  };

  const doBreed = async (ma: MonsterInstance, mb: MonsterInstance) => {
    const inParty = g.save.partyUuids.includes(ma.uuid) || g.save.partyUuids.includes(mb.uuid);
    const msg = `${monsterName(ma)}と${monsterName(mb)}を配合します。2体は戻ってきません。${inParty ? '(パーティから外れます)' : ''}`;
    if (!(await app.confirm(msg, '配合する'))) return;
    try {
      await g.mutate(() => g.breed(ma.uuid, mb.uuid));
    } catch (e) {
      await app.modal('配合できませんでした', [h('p', null, (e as Error).message), h('p', { class: 'fine' }, '幻獣と卵は変わっていません。')]);
      return;
    }
    sfx.levelUp();
    await app.dialog([{ text: '光が二つの影を包み込み、ひとつの卵が生まれた…!' }, { text: '卵は戦いの経験を重ねると孵化します。孵化所で確認しましょう。' }]);
    a = null;
    b = null;
    draw();
  };
  draw();
}

// ============ 孵化所 ============

export function hatcheryScreen(app: App): void {
  const g = app.g;
  const draw = () => {
    const rows = g.save.eggs.map((e) => {
      const sp = getSpecies(e.speciesId);
      const ready = e.hatchProgress >= HATCH_THRESHOLD;
      return h(
        'div',
        { class: 'mon-row' },
        h('div', { class: 'thumb', html: `<img class="pixel" src="${eggPixelUrl()}" width="52" height="52" alt="卵">` }),
        h('div', { class: 'info' }, h('strong', null, `${sp.name}の卵 ${gender(e)}`), h('small', null, `配合値 +${e.plus}  進行 ${Math.min(100, Math.floor(e.hatchProgress))}/${HATCH_THRESHOLD}`), bar(Math.min(e.hatchProgress, HATCH_THRESHOLD), HATCH_THRESHOLD, 'exp')),
        h('button', { class: 'btn primary', disabled: !ready, onclick: () => void hatch(e.uuid) }, ready ? '孵化' : 'まだ'),
      );
    });
    app.mount(h('main', { class: 'screen' }, h('h2', null, '孵化所'), h('p', { class: 'fine' }, '冒険で戦闘に勝つと、卵が育ちます(時間では進みません)。'), rows.length ? h('div', { class: 'list' }, rows) : h('p', null, '卵はありません。'), backRow(app)));
  };
  const hatch = async (id: string) => {
    try {
      const m = await g.mutate(() => g.hatchEgg(id));
      sfx.levelUp();
      await app.modal('孵化!', [h('div', { class: 'center', html: monsterSvg(m.speciesId, 110) }), h('p', { class: 'center' }, `${getSpecies(m.speciesId).name} ${gender(m)} が生まれた!`)], 'やった!');
    } catch (e) {
      app.toast((e as Error).message, 3000);
    }
    draw();
  };
  draw();
}

// ============ 道具屋 ============

export function shopScreen(app: App): void {
  const g = app.g;
  let tab: 'buy' | 'sell' = 'buy';
  const draw = () => {
    const items = ITEMS.filter((i) => (tab === 'buy' ? i.price !== null : g.count(i.id) > 0 && i.price !== null));
    const rows = items.map((it) =>
      h(
        'div',
        { class: 'shop-row' },
        h('div', { class: 'info' }, h('strong', null, it.name), h('small', null, itemDesc(it.id)), h('small', null, `所持 ${g.count(it.id)}/${it.maxStack}`)),
        h('div', { class: 'price' }, tab === 'buy' ? `${it.price}G` : `${Math.floor((it.price ?? 0) / 2)}G`),
        h(
          'button',
          { class: 'btn', onclick: async () => {
              const n = await app.choose<number>(`${it.name}を${tab === 'buy' ? '買う' : '売る'}`, [1, 5, 10].map((q) => ({ label: `${q}個`, value: q })));
              if (!n) return;
              const err = tab === 'buy' ? g.buy(it.id, n) : g.sell(it.id, n);
              if (err) app.toast(err);
              else {
                sfx.chest();
                await app.autosave();
                draw();
              }
            } },
          tab === 'buy' ? '買う' : '売る',
        ),
      ),
    );
    app.mount(
      h(
        'main',
        { class: 'screen' },
        h('h2', null, '道具屋'),
        h('p', null, `所持金 ${g.save.gold}G`),
        h('div', { class: 'row' }, h('button', { class: `chip${tab === 'buy' ? ' on' : ''}`, onclick: () => ((tab = 'buy'), draw()) }, '買う'), h('button', { class: `chip${tab === 'sell' ? ' on' : ''}`, onclick: () => ((tab = 'sell'), draw()) }, '売る')),
        h('div', { class: 'list' }, rows.length ? rows : h('p', null, '売れるものがありません。')),
        backRow(app),
      ),
    );
  };
  draw();
}

function itemDesc(id: string): string {
  const it = getItem(id);
  const e = it.effect;
  if (it.recruitBonus) return `戦闘中に投げると仲間になる確率が上がる(+${Math.round(it.recruitBonus * 100)}%相当)`;
  if (it.permStat) return `${STAT_LABEL[it.permStat.stat]}が永久に+${it.permStat.amount}`;
  if (e.startsWith('hp+')) return `HPを${e.slice(3)}回復`;
  if (e.startsWith('mp+')) return `MPを${e.slice(3)}回復`;
  if (e.startsWith('cure')) return '状態異常を治す(戦闘中)';
  if (e === 'return-to-town') return 'ダンジョンから街へ帰還';
  return '';
}

// ============ 競技場 ============

export function arenaScreen(app: App): void {
  const g = app.g;
  const rows = TOURNAMENTS.map((t) => {
    const st = g.tournamentStatus(t);
    const fee = g.tournamentFee(t);
    const rec = Array.isArray(t.recommendedLevel) ? `${t.recommendedLevel[0]}〜${t.recommendedLevel[1]}` : String(t.recommendedLevel);
    return h(
      'div',
      { class: `gate-row${st.state === 'locked' ? ' locked' : ''}` },
      h('div', { class: 'gate-info' }, h('strong', null, `${t.name}大会${st.state === 'cleared' ? ' ✅' : ''}`), h('small', null, `${t.matches}連戦 / 推奨Lv ${rec} / 参加費 ${fee}G / 賞金 ${g.tournamentPrize(t)}G`), st.reason ? h('small', { class: 'warn' }, st.reason) : null),
      h('button', { class: 'btn primary', disabled: st.state !== 'available', onclick: () => void enter(t) }, st.state === 'cleared' ? '優勝済み' : '挑戦'),
    );
  });
  const enter = async (t: (typeof TOURNAMENTS)[number]) => {
    const err = g.canEnterTournament(t);
    if (err) return app.toast(err);
    const fee = g.tournamentFee(t);
    if (!(await app.confirm(`${t.name}大会に挑戦します。${t.matches}連戦で、道具は使えず、逃げることもできません。試合の合間に少しだけ回復できます。${fee ? `参加費${fee}Gが必要です。` : ''}`, '挑戦する'))) return;
    g.save.gold -= fee;
    g.healAll();
    const names = TRAINER_NAMES[t.id] ?? [];
    let won = true;
    for (let i = 0; i < t.matches; i++) {
      const b = g.startTournamentBattle(t, i);
      const foe = names[i] ?? '対戦相手';
      const s = await runBattle(app, b, 'tournament', `第${i + 1}戦 ${foe}が勝負を挑んできた!`);
      if (s.result !== 'victory') {
        won = false;
        break;
      }
      if (i < t.matches - 1) {
        g.tournamentBreak();
        app.toast('控え室で少し休んだ。', 1800);
      }
    }
    if (won) {
      g.winTournament(t);
      sfx.win();
      await app.dialog([{ who: 'オルス', text: `${t.name}大会の優勝者は、${g.save.playerName}!` }, { text: `賞金${g.tournamentPrize(t)}Gを獲得した!` }]);
    } else {
      g.healAll();
      await app.dialog([{ who: 'オルス', text: '残念だが、ここまでだ。鍛え直して再び挑め。' }]);
    }
    await app.autosave();
    app.go(won && t.rank === 5 ? 'base' : 'arena');
  };
  const preview = g.party.length ? h('p', { class: 'fine' }, `パーティ: ${g.party.map((m) => `${monsterName(m)}Lv${m.level}`).join(' / ')}`) : null;
  app.mount(h('main', { class: 'screen' }, h('h2', null, '星冠競技場'), preview, h('div', { class: 'stack' }, rows), backRow(app)));
  void tournamentOpponents;
  void describeRequirement;
  void GATES;
}

// ============ 図鑑 ============

export function bestiaryScreen(app: App): void {
  const g = app.g;
  let fam: FamilyId | 'all' = 'all';
  const seen = new Set(g.save.discoveredSpeciesIds);
  const owned = new Set(g.save.recruitedSpeciesIds);
  const draw = () => {
    const list = MONSTERS.filter((m) => fam === 'all' || m.family === fam);
    const cells = list.map((m) => {
      const state = owned.has(m.id) ? 'owned' : seen.has(m.id) ? 'seen' : 'unknown';
      return h(
        'button',
        { class: `dex ${state}`, onclick: () => void info(m.id, state) },
        h('div', { html: state === 'unknown' ? '<span class="q">？</span>' : monsterSvg(m.id, 56) }),
        h('small', null, state === 'unknown' ? m.id : m.name),
      );
    });
    app.mount(
      h(
        'main',
        { class: 'screen' },
        h('h2', null, '幻獣図鑑'),
        h('p', null, `遭遇 ${seen.size}/100  /  仲間にした ${owned.size}/100`),
        h('div', { class: 'row wrap' }, h('button', { class: `chip${fam === 'all' ? ' on' : ''}`, onclick: () => ((fam = 'all'), draw()) }, 'すべて'), ...FAMILY_IDS.map((f) => h('button', { class: `chip${fam === f ? ' on' : ''}`, onclick: () => ((fam = f), draw()) }, FAMILY_NAMES[f]))),
        h('div', { class: 'dex-grid' }, cells),
        backRow(app),
      ),
    );
  };
  const info = async (id: string, state: string) => {
    if (state === 'unknown') return app.toast('まだ出会っていません。');
    const sp = getSpecies(id);
    const gate = GATES.find((x) => x.id === sp.wildGateId);
    const base = computeStats(sp, 1, zeroStats());
    await app.modal(`${sp.id} ${sp.name}`, [
      h('div', { class: 'center', html: monsterSvg(id, 110) }),
      h('p', { class: 'center' }, `${FAMILY_NAMES[sp.family]} / ${sp.rank}ランク`),
      h('div', { class: 'stats' }, ...STAT_KEYS.map((k) => h('div', null, h('span', null, STAT_LABEL[k]), h('b', null, `${base[k]}`)))),
      h('p', null, `固有の技: ${sp.nativeSkillIds.map((s) => getSkill(s).name).join('、')}`),
      h('p', { class: 'fine' }, gate ? `生息: ${gate.name}(Lv${sp.wildLevelRange![0]}〜)` : '野生では見つからない。配合で生まれる。'),
    ]);
  };
  draw();
}
