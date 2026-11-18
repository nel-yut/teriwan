import { Game } from '../../application/game';
import { AFTER_STARTER, INTRO } from '../../data/story';
import { MONSTER_BY_ID } from '../../data/monsters';
import { SLOT_COUNT, parseSave, type SaveData } from '../../infrastructure/save';
import { getSpecies } from '../../domain/monster';
import type { App } from '../app';
import { monsterSvg } from '../art';
import { h } from '../dom';
import { sfx } from '../sfx';

function fmtTime(sec: number): string {
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  return `${hh}時間${String(mm).padStart(2, '0')}分`;
}

export function titleScreen(app: App): void {
  app.game = null;
  const note = h('p', { class: 'fine' }, 'セーブはこの端末のブラウザ内にだけ保存されます。ブラウザのデータを消すとセーブも消えます(設定からバックアップを書き出せます)。');
  app.mount(
    h(
      'main',
      { class: 'screen title' },
      h('div', { class: 'title-art', html: ['M021', 'M011', 'M001'].map((id, i) => `<span class="float f${i}">${monsterSvg(id, 84)}</span>`).join('') }),
      h('h1', null, '幻獣綺譚', h('small', null, '星渡りの門')),
      h(
        'div',
        { class: 'stack' },
        h('button', { class: 'btn primary big', onclick: () => (sfx.click(), slotScreen(app, 'load')) }, 'つづきから'),
        h('button', { class: 'btn big', onclick: () => (sfx.click(), slotScreen(app, 'new')) }, 'はじめから'),
        h('button', { class: 'btn', onclick: () => app.go('settings') }, '設定'),
      ),
      app.storeWarning ? h('p', { class: 'warn' }, app.storeWarning) : null,
      note,
    ),
  );
}

interface SlotInfo {
  slot: number;
  state: 'empty' | 'ok' | 'broken';
  save?: SaveData;
  usedBackup?: boolean;
  reason?: string;
}

async function readSlots(app: App): Promise<SlotInfo[]> {
  const out: SlotInfo[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    try {
      const r = await app.store.read(i);
      if (!r) out.push({ slot: i, state: 'empty' });
      else if (r.result.ok) out.push({ slot: i, state: 'ok', save: r.result.save, usedBackup: r.usedBackup });
      else out.push({ slot: i, state: 'broken', reason: r.result.reason });
    } catch (e) {
      out.push({ slot: i, state: 'broken', reason: (e as Error).message });
    }
  }
  return out;
}

async function slotScreen(app: App, mode: 'load' | 'new'): Promise<void> {
  const list = h('div', { class: 'stack' }, h('p', null, '読み込み中…'));
  app.mount(
    h(
      'main',
      { class: 'screen' },
      h('h2', null, mode === 'load' ? 'どのセーブで遊びますか?' : 'どのスロットに新しく始めますか?'),
      list,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => app.go('title') }, 'もどる')),
    ),
  );
  const slots = await readSlots(app);
  list.replaceChildren(
    ...slots.map((s) => {
      const label =
        s.state === 'empty'
          ? '— 空き —'
          : s.state === 'broken'
            ? `⚠ 読み込めません(${s.reason})`
            : `${s.save!.playerName}  ${fmtTime(s.save!.playSeconds)}  ${s.save!.gold}G  大会ランク ${s.save!.storyFlags['tournamentRank'] ?? 0}${s.usedBackup ? '  (バックアップから復旧)' : ''}`;
      return h(
        'button',
        {
          class: 'btn slot',
          disabled: mode === 'load' && s.state !== 'ok',
          onclick: async () => {
            sfx.click();
            if (mode === 'load') loadGame(app, s);
            else {
              if (s.state !== 'empty' && !(await app.confirm(`スロット${s.slot + 1}のデータは上書きされます。よろしいですか?`, '上書きする'))) return;
              void newGame(app, s.slot);
            }
          },
        },
        h('strong', null, `スロット${s.slot + 1}`),
        h('span', null, label),
      );
    }),
  );
}

function loadGame(app: App, s: SlotInfo): void {
  if (!s.save) return;
  app.slot = s.slot;
  app.game = new Game(s.save, app.store, s.slot);
  app.game.strategy = app.settings.strategy;
  if (s.usedBackup) app.toast('セーブが破損していたため、1つ前のバックアップから復旧しました。', 4500);
  if (!app.game.flag('introDone')) void newGameIntro(app);
  else app.go(app.game.run ? 'explore' : 'base');
}

async function newGame(app: App, slot: number): Promise<void> {
  const input = h('input', { type: 'text', maxlength: '8', value: '', placeholder: 'なまえ(8文字まで)', class: 'text-input', 'aria-label': '主人公の名前' });
  const name = await new Promise<string | null>((resolve) => {
    const overlay = h(
      'div',
      { class: 'overlay' },
      h(
        'div',
        { class: 'modal' },
        h('h3', null, 'あなたの名前は?'),
        input,
        h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => (overlay.remove(), resolve(null)) }, 'もどる'), h('button', { class: 'btn primary', onclick: () => (overlay.remove(), resolve(input.value.trim() || 'ミナト')) }, 'けってい')),
      ),
    );
    document.body.append(overlay);
    input.focus();
  });
  if (name === null) return;
  const seed = (Math.random() * 0x7fffffff) | 0 || 1;
  app.slot = slot;
  app.game = Game.create(app.store, slot, seed);
  app.game.save.playerName = name;
  app.game.strategy = app.settings.strategy;
  await newGameIntro(app);
}

async function newGameIntro(app: App): Promise<void> {
  await app.dialog(INTRO);
  const id = await chooseStarter(app);
  app.g.chooseStarter(id);
  await app.dialog(AFTER_STARTER);
  await app.autosave();
  app.go('base');
}

function chooseStarter(app: App): Promise<string> {
  const options = [
    { id: 'M001', desc: '回復や状態異常が得意。じっくり戦うタイプ。' },
    { id: 'M011', desc: '素早い物理アタッカー。まっすぐ強いタイプ。' },
    { id: 'M021', desc: '風の術を操る。軽やかで器用なタイプ。' },
  ];
  return new Promise((resolve) => {
    const cards = options.map((o) => {
      const sp = getSpecies(o.id);
      return h(
        'button',
        {
          class: 'card starter',
          onclick: async () => {
            sfx.click();
            if (await app.confirm(`${sp.name}を相棒にしますか? ♂と♀の2体を預かります。`, 'この子にする')) {
              overlay.remove();
              resolve(o.id);
            }
          },
        },
        h('div', { html: monsterSvg(o.id, 96) }),
        h('strong', null, sp.name),
        h('small', null, `${sp.rank}ランク`),
        h('p', null, o.desc),
      );
    });
    const overlay = h('div', { class: 'overlay solid' }, h('div', { class: 'modal wide' }, h('h3', null, '最初の相棒を選んでください'), h('div', { class: 'grid3' }, cards)));
    document.body.append(overlay);
    void MONSTER_BY_ID;
  });
}
