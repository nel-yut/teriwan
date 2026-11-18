import { getSpecies } from '../domain/monster';
import { overrideUrl } from './assets';
import { monsterPixelUrl } from './pixel';

/** 門ごとのタイル配色 [床, 壁, 床の模様, 背景] */
export const GATE_THEME: Record<string, [string, string, string, string]> = {
  gate01: ['#4e7a3a', '#2b4a2a', '#5e8c47', '#14241a'],
  gate02: ['#8bb0c9', '#5b7f9b', '#9fc0d6', '#1a2a3a'],
  gate03: ['#4a8aa8', '#1f4c66', '#5ba0bf', '#0f2433'],
  gate04: ['#7a7480', '#3f3a47', '#8a8490', '#1b1820'],
  gate05: ['#9a5238', '#4a1f16', '#b05f40', '#240d0a'],
  gate06: ['#c8e6f2', '#6f9db5', '#dff2fa', '#14202c'],
  gate07: ['#59447a', '#2a1f40', '#6a5590', '#0e0a1a'],
  gate08: ['#3f4a8f', '#1a1f4a', '#5560b0', '#090b22'],
};

/** 幻獣の画像(<img> の HTML 文字列)。素材があればそれを、なければコード生成のドット絵を使う。 */
export function monsterSvg(speciesId: string, size = 96): string {
  const sp = getSpecies(speciesId);
  const src = overrideUrl(speciesId) ?? monsterPixelUrl(speciesId);
  return `<img class="pixel" src="${src}" width="${size}" height="${size}" alt="${sp.name}" draggable="false">`;
}

/** 探索画面などで Canvas に描く用の画像 URL */
export function monsterImageUrl(speciesId: string): string {
  return overrideUrl(speciesId) ?? monsterPixelUrl(speciesId);
}

