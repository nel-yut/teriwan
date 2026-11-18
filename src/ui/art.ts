import { getSpecies } from '../domain/monster';
import type { FamilyId } from '../domain/types';

/** 系統ごとの基準色 [体, 影, アクセント] */
const PALETTE: Record<FamilyId, [string, string, string]> = {
  sprout: ['#7bd36b', '#3f8f4a', '#f6e27a'],
  beast: ['#e0a465', '#9b6a3a', '#f4d8a8'],
  wing: ['#7fc8f0', '#3f86b8', '#fff3c4'],
  scale: ['#4fc3b0', '#237f78', '#c8f2e8'],
  metal: ['#aab4c4', '#667084', '#e8c15a'],
  shade: ['#9a7bd1', '#5a3f8f', '#e6d6ff'],
  flame: ['#f08a4b', '#b8452a', '#ffe08a'],
  frost: ['#a8e4f5', '#5aa9c8', '#ffffff'],
  astral: ['#f2d36b', '#a9812a', '#fff7cf'],
  dragon: ['#d86f7a', '#8e3340', '#f3c46b'],
};

function hueShift(hex: string, deg: number): string {
  // 簡易: CSS filter を使わず HSL へ変換
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) / 255;
  let g = ((n >> 8) & 255) / 255;
  let b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  h = (h + deg + 360) % 360;
  return `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%)`;
  void r;
  void g;
  void b;
}

function body(family: FamilyId, c: string, sh: string, ac: string, idx: number): string {
  const spots = idx % 3 === 1 ? `<circle cx="38" cy="58" r="4" fill="${sh}" opacity=".5"/><circle cx="62" cy="64" r="3" fill="${sh}" opacity=".5"/>` : idx % 3 === 2 ? `<path d="M36 52q14-8 28 0" stroke="${sh}" stroke-width="3" fill="none" opacity=".5"/>` : '';
  switch (family) {
    case 'sprout':
      return `<ellipse cx="50" cy="60" rx="30" ry="26" fill="${c}"/><path d="M50 36q-6-16 8-20q4 14-8 20z" fill="${ac}"/><path d="M50 36q-14-6-16-18q14 0 16 18z" fill="${sh}"/>${spots}`;
    case 'beast':
      return `<path d="M24 46l8-22 14 14z M76 46l-8-22-14 14z" fill="${sh}"/><ellipse cx="50" cy="60" rx="30" ry="26" fill="${c}"/><path d="M78 70q18-4 10-22" stroke="${sh}" stroke-width="7" fill="none" stroke-linecap="round"/><ellipse cx="50" cy="72" rx="14" ry="9" fill="${ac}"/>${spots}`;
    case 'wing':
      return `<path d="M22 56q-18-14-14-30q18 4 24 22z M78 56q18-14 14-30q-18 4-24 22z" fill="${ac}" stroke="${sh}" stroke-width="2"/><ellipse cx="50" cy="60" rx="26" ry="26" fill="${c}"/><path d="M50 62l8 6-8 6-8-6z" fill="#f5b942"/>${spots}`;
    case 'scale':
      return `<path d="M76 66q22 0 16-18" stroke="${sh}" stroke-width="8" fill="none" stroke-linecap="round"/><ellipse cx="48" cy="62" rx="32" ry="24" fill="${c}"/><path d="M26 60q8-8 16 0q8-8 16 0q8-8 16 0" stroke="${sh}" stroke-width="3" fill="none"/><ellipse cx="48" cy="74" rx="22" ry="8" fill="${ac}" opacity=".6"/>`;
    case 'metal':
      return `<rect x="22" y="34" width="56" height="50" rx="12" fill="${c}" stroke="${sh}" stroke-width="3"/><circle cx="30" cy="42" r="2.5" fill="${ac}"/><circle cx="70" cy="42" r="2.5" fill="${ac}"/><circle cx="30" cy="76" r="2.5" fill="${ac}"/><circle cx="70" cy="76" r="2.5" fill="${ac}"/><path d="M50 34v-10" stroke="${sh}" stroke-width="4"/><circle cx="50" cy="22" r="6" fill="${ac}" stroke="${sh}" stroke-width="2"/>`;
    case 'shade':
      return `<path d="M20 86V54q0-30 30-30t30 30v32l-10-8-10 8-10-8-10 8-10-8z" fill="${c}" opacity=".92"/><circle cx="50" cy="22" r="4" fill="${ac}"/>${spots}`;
    case 'flame':
      return `<path d="M50 14q8 18 22 30q10 12 4 28q-8 16-26 16T24 72q-6-18 6-30q10-8 12-22q4 8 8 0z" fill="${c}"/><path d="M50 50q10 10 8 22q-4 10-12 4q-6-8 4-26z" fill="${ac}"/>`;
    case 'frost':
      return `<path d="M50 14l24 20v32l-24 20-24-20V34z" fill="${c}" stroke="${sh}" stroke-width="3"/><path d="M50 14v72M26 34l48 32M74 34L26 66" stroke="${ac}" stroke-width="2" opacity=".7"/>`;
    case 'astral':
      return `<path d="M50 10l10 26 28 2-22 18 8 28-24-16-24 16 8-28-22-18 28-2z" fill="${c}" stroke="${sh}" stroke-width="3"/><circle cx="50" cy="52" r="6" fill="${ac}" opacity=".6"/>`;
    case 'dragon':
      return `<path d="M26 40l-6-20 16 10z M74 40l6-20-16 10z" fill="${ac}"/><path d="M20 60q-14-4-16-22q14 2 22 14z M80 60q14-4 16-22q-14 2-22 14z" fill="${sh}"/><ellipse cx="50" cy="62" rx="28" ry="26" fill="${c}"/><path d="M76 74q18 6 16-12" stroke="${sh}" stroke-width="7" fill="none" stroke-linecap="round"/><ellipse cx="50" cy="76" rx="14" ry="8" fill="${ac}" opacity=".7"/>`;
  }
}

/** 種族 ID から仮ビジュアル(SVG)を生成する。後で画像アセットに差し替える前提。 */
export function monsterSvg(speciesId: string, size = 96): string {
  const sp = getSpecies(speciesId);
  const [base, shade, accent] = PALETTE[sp.family];
  const shift = (sp.index - 4) * 7;
  const c = hueShift(base, shift);
  const sh = hueShift(shade, shift);
  const ac = accent;
  const eyeY = sp.family === 'metal' ? 52 : sp.family === 'frost' ? 48 : sp.family === 'astral' ? 50 : 56;
  const scale = 0.78 + sp.index * 0.025;
  const aura =
    sp.rank === 'S'
      ? `<circle cx="50" cy="52" r="46" fill="none" stroke="#ffd86b" stroke-width="2.5" opacity=".8"/><circle cx="50" cy="52" r="40" fill="#ffd86b" opacity=".12"/>`
      : sp.rank === 'A'
        ? `<circle cx="50" cy="52" r="44" fill="none" stroke="#bfe3ff" stroke-width="2" opacity=".6"/>`
        : '';
  const eyes = `<circle cx="40" cy="${eyeY}" r="5.5" fill="#fff"/><circle cx="60" cy="${eyeY}" r="5.5" fill="#fff"/><circle cx="41.5" cy="${eyeY + 1}" r="3" fill="#1b1f3a"/><circle cx="58.5" cy="${eyeY + 1}" r="3" fill="#1b1f3a"/><circle cx="42.5" cy="${eyeY}" r="1" fill="#fff"/><circle cx="59.5" cy="${eyeY}" r="1" fill="#fff"/>`;
  const mouth = `<path d="M44 ${eyeY + 10}q6 5 12 0" stroke="#1b1f3a" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${sp.name}">${aura}<g transform="translate(50 52) scale(${scale.toFixed(3)}) translate(-50 -52)">${body(sp.family, c, sh, ac, sp.index)}${eyes}${mouth}</g></svg>`;
}

export const FAMILY_NAMES: Record<FamilyId, string> = {
  sprout: '芽精',
  beast: '獣牙',
  wing: '羽翼',
  scale: '鱗甲',
  metal: '鉱機',
  shade: '幽影',
  flame: '火霊',
  frost: '氷晶',
  astral: '星妖',
  dragon: '古竜',
};

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
