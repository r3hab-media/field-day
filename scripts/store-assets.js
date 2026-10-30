// Generates the extension icons and the store images:
// - src/extension/icons/{16,32,48,128}.png from logo-small.svg (16, 32) and logo.svg (48, 128)
// - store/: 1280x800 screenshots, the 440x280 and 1400x560 promo tiles, and the 300x300 logo for Edge Add-ons
// The screenshots capture the real panel on site/demo.html, with chrome.* stubbed so it runs outside the extension.
// Uses the installed Chrome through Playwright, so no browser download is needed. Pass --icons-only to skip the store images.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.join(ROOT, 'src/extension/icons');
const OUT = path.join(ROOT, 'store');
const ICONS_ONLY = process.argv.includes('--icons-only');
const svg = (name) => 'data:image/svg+xml;base64,' + readFileSync(path.join(ICONS, name)).toString('base64');
const png = (file) => 'data:image/png;base64,' + readFileSync(file).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
const stage = await browser.newPage();

const BASE = `
  *{box-sizing:border-box;margin:0}
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;background:#eef0ff}
  .sticker{border:3px solid #111;border-radius:16px;box-shadow:6px 6px 0 #111;overflow:hidden;background:#fff}
  .sticker img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
  h1{font-size:46px;font-weight:800;line-height:1.08;letter-spacing:-0.02em}
  p{font-size:21px;line-height:1.45;color:#3d3d52;margin-top:18px}
  .tag{display:inline-block;padding:4px 14px;border:3px solid #111;border-radius:999px;font-weight:800;font-size:16px;margin-bottom:20px}`;

async function compose(file, width, height, html, { transparent = false } = {}) {
  await stage.setViewportSize({ width, height });
  await stage.setContent(`<style>${BASE}${transparent ? 'body{background:transparent}' : ''}</style>${html}`);
  await stage.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  await stage.screenshot({ path: file, omitBackground: transparent });
  console.log(path.relative(ROOT, file).split(path.sep).join('/'));
  return file;
}

// ---------- icons ----------
for (const size of [16, 32, 48, 128]) {
  const src = svg(size <= 32 ? 'logo-small.svg' : 'logo.svg');
  await compose(path.join(ICONS, `${size}.png`), size, size, `<img src="${src}" style="display:block;width:${size}px;height:${size}px">`, { transparent: true });
}

if (!ICONS_ONLY) {
  mkdirSync(OUT, { recursive: true });

  // ---------- captures ----------
  // The demo page at 1440 wide, so the panel (top right) does not cover the centered form.
  const demoUrl = pathToFileURL(path.join(ROOT, 'site/demo.html')).href;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  async function openPanel() {
    await page.goto(demoUrl);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    // Run the panel in extension mode, so its wording matches what extension users see. No frames to list here.
    await page.addScriptTag({ content: `globalThis.chrome = {
      runtime: { id: 'store-assets', sendMessage: async (m) => ({ ok: true, result: m.type === 'list-frames' ? [] : true }) },
      storage: { local: { get: async () => ({}), set: async () => {} } } };` });
    await page.addScriptTag({ path: path.join(ROOT, 'src/engine/engine.js') });
    await page.addScriptTag({ path: path.join(ROOT, 'src/panel/panel.js') });
    await page.locator('label.f').first().waitFor();
    await page.locator('#submit').uncheck();
  }
  const capture = async (name, clip) => {
    const file = path.join(OUT, `.capture-${name}.png`);
    await page.screenshot({ path: file, clip });
    return file;
  };
  // The form (x 400-1040) and the panel (x 1068-1428), without the empty left margin.
  const PAGE_CLIP = { x: 330, y: 0, width: 1110, height: 600 };
  const panelClip = async (bottomLocator, pad = 12) => {
    const p = await page.locator('.p').boundingBox();
    const b = await bottomLocator.boundingBox();
    return { x: p.x - 2, y: p.y - 2, width: p.width + 4, height: b.y + b.height + pad - p.y };
  };

  // 1. The form list, with the hovered form outlined on the page.
  await openPanel();
  await page.locator('label.f').first().hover();
  await sleep(300);
  const pick = await capture('pick', PAGE_CLIP);

  // 2. Filled through both steps of the demo form, not submitted.
  await page.mouse.move(700, 880);
  await page.locator('#fill').click();
  await page.getByText('Filled. Not submitted.').waitFor({ timeout: 60000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
  const filled = await capture('filled', PAGE_CLIP);
  const filledPanel = await capture('filled-panel', await panelClip(page.locator('tr').nth(8), 0));

  // 3. The conditionals plan: the panel down to the plan's start button (taller viewport so it all shows).
  await page.setViewportSize({ width: 1440, height: 1300 });
  await openPanel();
  await page.locator('#cond').check();
  await page.locator('#fill').click();
  await page.getByText(/Found \d+ conditional field/).waitFor({ timeout: 120000 });
  await sleep(300);
  const startBtn = page.getByRole('button', { name: /times \(no submit\)|submissions/ });
  const planSize = await panelClip(startBtn);
  const plan = await capture('plan', planSize);
  await page.close();

  // ---------- store images ----------
  const logo = svg('logo.svg');
  const framed = (img, tag, tagColor, title) => `
    <div style="width:1280px;height:800px;padding:36px 48px;display:flex;flex-direction:column;gap:22px">
      <div style="display:flex;align-items:center;gap:18px">
        <img src="${logo}" style="width:64px;height:64px">
        <h1 style="font-size:38px">${title}</h1>
        <span class="tag" style="background:${tagColor};margin:0 0 0 auto">${tag}</span>
      </div>
      <div class="sticker" style="flex:1;min-height:0"><img src="${png(img)}"></div>
    </div>`;

  await compose(path.join(OUT, 'screenshot-1-pick.png'), 1280, 800,
    framed(pick, 'Pick', '#ffd43b', 'Every form on the page, one click away'));
  await compose(path.join(OUT, 'screenshot-2-fill.png'), 1280, 800,
    framed(filled, 'Fill', '#2bd67b', 'Believable test data in every field'));

  // The panel crop beside a caption, scaled to fit the height.
  const planH = Math.min(680, Math.round(planSize.height));
  const planW = Math.round((planSize.width * planH) / planSize.height);
  await compose(path.join(OUT, 'screenshot-3-conditionals.png'), 1280, 800, `
    <div style="width:1280px;height:800px;display:flex;align-items:center;gap:64px;padding:0 80px">
      <div style="flex:1;min-width:0">
        <img src="${logo}" style="width:84px;height:84px;margin:0 0 18px -8px">
        <div><span class="tag" style="background:#ff6fae">Conditionals</span></div>
        <h1>Test every branch of the form</h1>
        <p>Field Day tries each option to find fields that only appear for certain answers, then plans the fewest runs that cover them all.</p>
      </div>
      <div class="sticker" style="width:${planW + 6}px;height:${planH + 6}px;flex-shrink:0;transform:rotate(1deg)"><img src="${png(plan)}"></div>
    </div>`);

  const wordmark = (size) => `<div style="font-size:${size}px;font-weight:800;letter-spacing:-0.02em">Field Day</div>`;
  await compose(path.join(OUT, 'promo-small-440x280.png'), 440, 280, `
    <div style="width:440px;height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:#ffd43b;border:4px solid #111">
      <img src="${logo}" style="width:112px;height:112px">
      ${wordmark(34)}
      <div style="font-size:17px;font-weight:600">Fill any web form with test data.</div>
    </div>`);

  // Marquee: only shown if a store features the extension.
  await compose(path.join(OUT, 'promo-marquee-1400x560.png'), 1400, 560, `
    <div style="width:1400px;height:560px;display:flex;align-items:center;gap:40px;padding:0 0 0 90px;background:#ffd43b;border:5px solid #111;overflow:hidden">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:26px">
          <img src="${logo}" style="width:96px;height:96px;margin-left:-10px">${wordmark(36)}
        </div>
        <h1 style="font-size:52px">Test any web form<br>in one click.</h1>
        <p style="color:#111;font-size:22px">Realistic fake data, multi-step forms, conditional branches. CAPTCHAs wait for you.</p>
      </div>
      <div class="sticker" style="width:440px;height:600px;flex-shrink:0;transform:rotate(3deg);margin:150px 110px 0 0">
        <img src="${png(filledPanel)}">
      </div>
    </div>`);

  // Edge Add-ons store logo: 1:1, 300x300 recommended. Chrome uses the 128px icon.
  await compose(path.join(OUT, 'logo-300x300.png'), 300, 300,
    `<img src="${logo}" style="display:block;width:300px;height:300px">`, { transparent: true });

  for (const f of [pick, filled, filledPanel, plan]) rmSync(f);
}

await browser.close();
