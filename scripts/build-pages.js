import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const root = new URL('../', import.meta.url);
const out = new URL('dist/', root);
const read = (p) => readFile(new URL(p, root), 'utf8');

const source = (await read('src/engine/engine.js')) + '\n' + (await read('src/panel/panel.js'));
const { code } = await transform(source, { minify: true, format: 'iife', target: 'es2020', legalComments: 'none' });
const href = 'javascript:' + encodeURIComponent(code.trim().replace(/;$/, '') + ';void 0');

const html = (await read('site/index.html'))
  .replace('{{BOOKMARKLET_HREF}}', href.replace(/&/g, '&amp;').replace(/"/g, '&quot;'))
  .replace('{{BUILD_INFO}}', new Date().toISOString().slice(0, 10));

await mkdir(out, { recursive: true });
await writeFile(new URL('index.html', out), html);
await writeFile(new URL('bookmarklet.js', out), code);
await copyFile(new URL('site/demo.html', root), new URL('demo.html', out));
await copyFile(new URL('site/privacy.html', root), new URL('privacy.html', out));
await copyFile(new URL('site/site.css', root), new URL('site.css', out));
await copyFile(new URL('src/extension/icons/logo.svg', root), new URL('logo.svg', out));
await copyFile(new URL('store/screenshot-2-fill.png', root), new URL('screenshot-fill.png', out));
console.log(`Built dist/ (bookmarklet ${(href.length / 1024).toFixed(1)} KB)`);
