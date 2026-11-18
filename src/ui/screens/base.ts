import { ENDING, CREDITS, GATE_CLEAR, hintFor } from '../../data/story';
import { STRATEGY_LABEL, type Strategy } from '../../domain/battle';
import { SLOT_COUNT, parseSave, serializeSave } from '../../infrastructure/save';
import type { App } from '../app';
import { monsterSvg } from '../art';
import { h } from '../dom';
import { sfx } from '../sfx';

const RANK_NAMES = ['なし', '見習い', '青銅', '白銀', '黄金', '星冠'];

export async function baseScreen(app: App): Promise<void> {
  const g = app.g;
  const rescued = g.ensureMonster();
  g.healAll();
  void app.autosave();
  const rank = g.tournamentRank;
  const hint = hintFor((k) => g.flag(k), rank);
  const tile = (icon: string, label: string, sub: string, to: () => void, badge?: string) =>
    h('button', { class: 'facility', onclick: () => (sfx.click(), to()) }, h('span', { class: 'ico' }, icon), h('strong', null, label), h('small', null, sub), badge ? h('em', { class: 'badge' }, badge) : null);
  const readyEggs = g.save.eggs.filter((e) => e.hatchProgress >= 100).length;

  app.mount(
    h(
      'main',
      { class: 'screen base' },
      h(
        'header',
        { class: 'status' },
        h('span', null, `🧑 ${g.save.playerName}`),
        h('span', null, `💰 ${g.save.gold}G`),
        h('span', null, `🏆 ${RANK_NAMES[rank]}`),
      ),
      h('div', { class: 'town-art', html: g.party.map((m) => `<span class="float">${monsterSvg(m.speciesId, 64)}</span>`).join('') }),
      h('section', { class: 'npc' }, h('strong', null, 'イリス'), h('p', null, hint)),
      h(
        'div',
        { class: 'facility-grid' },
        tile('🚪', '門の間', '8つの門へ出発', () => app.go('gates')),
        tile('🐾', '幻獣牧舎', 'パーティ編成・預かり', () => app.go('party')),
        tile('🧬', '配合堂', g.flag('breedingUnlocked') ? '2体から新しい幻獣を' : '青銅ランク優勝で解放', () => app.go('breeding')),
        tile('🥚', '孵化所', `卵 ${g.save.eggs.length}個`, () => app.go('hatchery'), readyEggs ? `${readyEggs}` : undefined),
        tile('🛒', '道具屋', '回復・肉・種', () => app.go('shop')),
        tile('🏟️', '星冠競技場', 'ランク別トーナメント', () => app.go('arena')),
        tile('📖', '記録庫', '幻獣図鑑', () => app.go('bestiary')),
        tile('⚙️', '設定・セーブ', 'バックアップ書き出し', () => app.go('settings')),
      ),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => app.go('title') }, 'タイトルへ')),
    ),
  );
  if (rescued) await app.dialog([{ who: 'ガルド', text: '幻獣が1体もいないじゃないか。これを連れていけ。困ったときはいつでも言え。' }]);
  if (g.flag('endingSeen') && !g.flag('endingPlayed')) {
    g.setFlag('endingPlayed', true);
    await playEnding(app);
  }
  void GATE_CLEAR;
}

export async function playEnding(app: App): Promise<void> {
  await app.dialog(ENDING);
  const lines = CREDITS.map((t) => h('p', null, t || ' '));
  await app.modal('スタッフロール', lines, 'ルーメルへ戻る');
  await app.dialog([{ text: 'これで物語は一区切り。この先も、収集・育成・配合を自由に楽しめます。' }]);
  await app.autosave();
}

export function settingsScreen(app: App): void {
  const s = app.settings;
  const speed = h(
    'select',
    { class: 'select', 'aria-label': 'テキスト速度', onchange: (e: Event) => ((s.textSpeed = (e.target as HTMLSelectElement).value as typeof s.textSpeed), app.saveSettings()) },
    ...(['slow', 'normal', 'fast'] as const).map((v) => h('option', { value: v, selected: s.textSpeed === v }, { slow: 'ゆっくり', normal: 'ふつう', fast: 'はやい' }[v])),
  );
  const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.1', value: String(s.volume), 'aria-label': '音量', onchange: (e: Event) => ((s.volume = Number((e.target as HTMLInputElement).value)), app.saveSettings(), sfx.click()) });
  const strat = h(
    'select',
    { class: 'select', 'aria-label': 'デフォルトの作戦', onchange: (e: Event) => ((s.strategy = (e.target as HTMLSelectElement).value as Strategy), app.saveSettings()) },
    ...(Object.keys(STRATEGY_LABEL) as Strategy[]).map((v) => h('option', { value: v, selected: s.strategy === v }, STRATEGY_LABEL[v])),
  );

  const back = () => (app.game ? app.go('base') : app.go('title'));
  const slotRows: HTMLElement[] = [];
  if (app.game) {
    slotRows.push(
      h('button', { class: 'btn', onclick: () => void exportSave(app) }, 'セーブを書き出す(JSON)'),
      h('button', { class: 'btn', onclick: () => void app.autosave().then(() => app.toast('セーブしました。')) }, '今すぐセーブ'),
    );
  }
  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', onchange: () => void importSave(app, file) });
  app.mount(
    h(
      'main',
      { class: 'screen' },
      h('h2', null, '設定'),
      h('label', { class: 'field' }, 'テキスト速度', speed),
      h('label', { class: 'field' }, '音量', vol),
      h('label', { class: 'field' }, '基本の作戦', strat),
      h('h3', null, 'セーブデータ'),
      h('div', { class: 'stack' }, ...slotRows, h('button', { class: 'btn', onclick: () => file.click() }, 'セーブを読み込む(JSON)'), file),
      h('p', { class: 'fine' }, '読み込み時は形式・バージョンを検証し、既存のセーブは1世代バックアップされます。ブラウザのデータを消去するとセーブも消えるため、定期的な書き出しをおすすめします。'),
      h('p', { class: 'fine' }, 'このゲームは初回読み込み後、オフラインでも遊べます。'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: back }, 'もどる')),
    ),
  );
}

async function exportSave(app: App): Promise<void> {
  const text = serializeSave(app.g.save);
  const blob = new Blob([text], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `genju-save-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
}

async function importSave(app: App, input: HTMLInputElement): Promise<void> {
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  const r = parseSave(await f.text());
  if (!r.ok) {
    app.toast('読み込めません: ' + r.reason, 4000);
    return;
  }
  const picks = await app.choose(
    '読み込み先のスロット',
    Array.from({ length: SLOT_COUNT }, (_, i) => ({ label: `スロット${i + 1}`, value: i, sub: '既存のデータは1世代バックアップされます' })),
  );
  if (picks === null) return;
  try {
    await app.store.write(picks, r.save);
    app.toast(`スロット${picks + 1}に読み込みました。`);
  } catch (e) {
    app.toast('保存に失敗しました: ' + (e as Error).message, 4000);
  }
}
