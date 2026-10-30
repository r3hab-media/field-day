import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const out = new URL('dist/', root);
const copy = (from, to) => copyFile(new URL(from, root), new URL(to, out));

const html = (await readFile(new URL('site/index.html', root), 'utf8'))
  .replace('{{BUILD_INFO}}', new Date().toISOString().slice(0, 10));

await mkdir(out, { recursive: true });
await writeFile(new URL('index.html', out), html);
await copy('site/demo.html', 'demo.html');
await copy('site/privacy.html', 'privacy.html');
await copy('site/site.css', 'site.css');
await copy('src/extension/icons/logo.svg', 'logo.svg');
await copy('store/screenshot-2-fill.png', 'screenshot-fill.png');
console.log('Built dist/ (project site)');
