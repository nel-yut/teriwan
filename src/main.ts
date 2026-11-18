import { assertGameData } from './data/validate';
import { App } from './ui/app';
import { baseScreen, settingsScreen } from './ui/screens/base';
import { arenaScreen, bestiaryScreen, breedingScreen, hatcheryScreen, partyScreen, shopScreen } from './ui/screens/facilities';
import { exploreScreen, gatesScreen } from './ui/screens/explore';
import { titleScreen } from './ui/screens/title';
import { monsterSvg } from './ui/art';
import { loadAssetManifest } from './ui/assets';
import { buildTileset } from './ui/tiles';
import './styles.css';

const root = document.getElementById('app')!;

try {
  assertGameData();
} catch (e) {
  root.textContent = (e as Error).message;
  throw e;
}

const app = new App(root);
app.screens = {
  title: titleScreen,
  base: baseScreen,
  gates: gatesScreen,
  explore: exploreScreen,
  party: partyScreen,
  breeding: breedingScreen,
  hatchery: hatcheryScreen,
  shop: shopScreen,
  arena: arenaScreen,
  bestiary: bestiaryScreen,
  settings: settingsScreen,
};
void loadAssetManifest().finally(() => app.go('title'));

// ページを閉じる前に最後の状態を保存(失敗しても遊びには影響しない)
window.addEventListener('pagehide', () => void app.game?.persist());

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* オフライン対応が無効になるだけ */
    });
  });
}

// デバッグ用
(window as unknown as { __app: App; __art: unknown }).__app = app;
(window as unknown as { __art: unknown }).__art = { monsterSvg, buildTileset };
