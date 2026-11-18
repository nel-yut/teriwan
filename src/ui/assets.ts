/**
 * 画像素材の差し替え。public/assets/manifest.json に素材のある種族 ID を列挙すると、
 * public/assets/monsters/<ID>.png を優先して使う(なければコード生成のドット絵)。
 */
let overrides = new Set<string>();

export async function loadAssetManifest(): Promise<void> {
  try {
    const res = await fetch('./assets/manifest.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const json = (await res.json()) as { monsters?: string[] };
    overrides = new Set(json.monsters ?? []);
  } catch {
    /* 素材なし(オフライン時など)でもコード生成にフォールバック */
  }
}

export const overrideUrl = (speciesId: string): string | null => (overrides.has(speciesId) ? `./assets/monsters/${speciesId}.png` : null);
