import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const out = new URL('dist/extension/', root);
const copy = async (from, to) => writeFile(new URL(to, out), await readFile(new URL(from, root)));

await rm(out, { recursive: true, force: true });
await mkdir(new URL('icons/', out), { recursive: true });
await copy('src/extension/manifest.json', 'manifest.json');
await copy('src/extension/background.js', 'background.js');
await copy('src/extension/page-helper.js', 'page-helper.js');
await copy('src/engine/engine.js', 'engine.js');
await copy('src/panel/panel.js', 'panel.js');
// The PNGs are rendered from logo.svg and logo-small.svg by scripts/store-assets.js.
for (const size of [16, 32, 48, 128]) await copy(`src/extension/icons/${size}.png`, `icons/${size}.png`);
console.log('Built dist/extension/ (load this folder unpacked in Edge or Chrome)');
