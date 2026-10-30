import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const ENGINE = await readFile(new URL('./engine/engine.js', import.meta.url), 'utf8');
const CAPTCHA_FRAME = /recaptcha|hcaptcha|challenges\.cloudflare\.com|friendlycaptcha/i;

export function validateUrl(raw) {
  let url;
  try { url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { throw new Error(`Invalid URL: ${raw}`); }
  if (!['http:', 'https:', 'file:'].includes(url.protocol)) throw new Error('Only http, https and file URLs are supported');
  return url.href;
}

export class Session {
  constructor({ headless = false } = {}) {
    this.headless = headless;
    this.browser = null;
    this.page = null;
    this.frameList = [];
    this.forms = [];
    this.targetFrame = null;
  }

  async open(rawUrl) {
    const url = validateUrl(rawUrl);
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({ headless: this.headless });
    }
    if (this.context) await this.context.close().catch(() => {});
    this.context = await this.browser.newContext({ viewport: null });
    await this.context.addInitScript({ content: ENGINE });
    this.page = await this.context.newPage();
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this.settle(2000);
    this.url = url;
    return this.page.url();
  }

  async settle(extraMs = 1000) {
    await this.page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await this.page.waitForTimeout(extraMs);
  }

  async ensureEngine(frame) {
    try {
      const ok = await frame.evaluate(() => !!globalThis.__FormTester);
      if (!ok) await frame.evaluate(ENGINE);
      return true;
    } catch {
      return false;
    }
  }

  async scan() {
    if (!this.page) throw new Error('No page open');
    this.frameList = this.page.frames().filter((f) => !f.isDetached() && !CAPTCHA_FRAME.test(f.url()));
    const out = [];
    for (const [fi, frame] of this.frameList.entries()) {
      if (!(await this.ensureEngine(frame))) continue;
      const forms = await frame.evaluate(() => __FormTester.listForms(document)).catch(() => []);
      const main = frame === this.page.mainFrame();
      for (const f of forms) out.push({ ...f, id: `${fi}:${f.index}`, frameUrl: frame.url(), inIframe: !main });
    }
    this.forms = out;
    return out;
  }

  async liveFrame(frame) {
    if (frame && !frame.isDetached()) return frame;
    // The iframe was re-created (e.g. multi-step embed); find a frame with the same origin.
    const origin = frame ? new URL(frame.url()).origin : null;
    return this.page.frames().find((f) => origin && f.url().startsWith(origin)) || this.page.mainFrame();
  }

  async detectCaptcha() {
    for (const frame of this.page.frames()) {
      if (frame.isDetached() || CAPTCHA_FRAME.test(frame.url())) continue;
      if (!(await this.ensureEngine(frame))) continue;
      const r = await frame.evaluate(() => __FormTester.detectCaptcha(document)).catch(() => ({ found: false }));
      if (r.found) return r;
    }
    return { found: false };
  }

  /**
   * Fills the chosen form, walking through multi-step "Next" buttons, then submits unless
   * submit=false or a CAPTCHA is detected (status 'captcha' — caller must then call submit()).
   */
  async fill(formId, { submit = true, emailPattern = '', overrides = {}, forced = {}, discover = false, maxSteps = 10, onStep } = {}) {
    const [fi, idx] = String(formId).split(':').map(Number);
    let frame = this.frameList[fi];
    if (!frame) throw new Error(`Unknown form id ${formId}`);
    frame = await this.liveFrame(frame);
    await this.ensureEngine(frame);
    const selected = await frame.evaluate((i) => __FormTester.selectForm(document, i), idx);
    if (!selected) throw new Error('Form no longer on the page. Rescan and try again.');

    const steps = [];
    const conditionals = [];
    let seen = [];
    let person = null;
    for (let step = 1; step <= maxSteps; step++) {
      frame = await this.liveFrame(frame);
      await this.ensureEngine(frame);
      if (discover) {
        const d = await frame.evaluate((s) => __FormTester.discoverConditionals(document, { seen: s }), seen);
        seen = d.seen;
        d.nodes.forEach((n) => conditionals.push({ ...n, step }));
      }
      const res = await frame.evaluate((opts) => __FormTester.fillTarget(document, opts),
        { fresh: step === 1, emailPattern, overrides, forced, person });
      person = res.person;
      steps.push({ step, filled: res.filled, errors: res.errors });
      onStep?.(steps[steps.length - 1]);

      if (step > 1 && res.filled.length === 0) break;
      const next = await frame.evaluate(() => __FormTester.prepareClick(document, 'next'));
      if (!next.found) break;
      await frame.click(next.selector, { timeout: 5000 }).catch(() =>
        frame.evaluate((sel) => document.querySelector(sel)?.click(), next.selector));
      await this.settle(800);
    }

    this.targetFrame = frame;
    const invalid = await frame.evaluate(() => __FormTester.getInvalid(document)).catch(() => []);
    const captcha = await this.detectCaptcha();
    const base = { steps, invalid, captcha, person };
    if (discover) {
      const plan = await frame.evaluate((n) => __FormTester.buildPlan(n), conditionals);
      const tree = await frame.evaluate((n) => __FormTester.describeConditionals(n), conditionals);
      Object.assign(base, { conditionals, plan, tree });
    }
    if (!submit) return { ...base, status: 'filled' };
    if (captcha.found) return { ...base, status: 'captcha' };
    return { ...base, ...(await this.submit()) };
  }

  /**
   * Replays the form once per planned branch, forcing the branch's choices.
   * Stops early on a CAPTCHA unless onCaptcha resolves to 'submit' or 'manual'.
   */
  async runCoverage(formId, runs, { onRun, ...opts } = {}) {
    const results = [];
    for (const [i, run] of runs.entries()) {
      const entry = await this.runOne(formId, run, i, opts);
      results.push(entry);
      onRun?.(entry);
      if (entry.status === 'captcha') break;
    }
    return results;
  }

  /** Reloads the form and fills/submits it once with the run's forced choices. */
  async runOne(formId, run, i, { onCaptcha, ...fillOpts } = {}) {
    await this.open(this.url);
    await this.scan();
    let r = await this.fill(formId, { ...fillOpts, forced: run.forced });
    if (r.status === 'captcha') {
      const action = onCaptcha ? await onCaptcha(i, r) : 'stop';
      if (action === 'submit') r = { ...r, ...(await this.submit()) };
      else if (action === 'manual') r = { ...r, ...(await this.result({ status: 'submitted-manually' })) };
    }
    return { run: i + 1, choices: run.choices, status: r.status, email: r.person?.email || '', confirmation: r.confirmation || '', errors: r.errors || [] };
  }

  async submit() {
    let frame = await this.liveFrame(this.targetFrame);
    await this.ensureEngine(frame);
    const btn = await frame.evaluate(() => __FormTester.prepareClick(document, 'submit'));
    const urlBefore = this.page.url();
    if (btn.found) {
      await frame.click(btn.selector, { timeout: 5000 }).catch(() =>
        frame.evaluate((sel) => document.querySelector(sel)?.click(), btn.selector));
    } else if (btn.canRequestSubmit) {
      await frame.evaluate(() => __FormTester.requestSubmit(document));
    } else {
      return { status: 'no-submit-button' };
    }
    await this.page.waitForTimeout(1500);
    // Some forms (e.g. Cognito) upload files/signatures after Submit, so poll before deciding.
    const start = Date.now();
    let outcome = null;
    while (Date.now() - start < 20000) {
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      frame = await this.liveFrame(frame);
      await this.ensureEngine(frame);
      outcome = await frame.evaluate(() => __FormTester.submitOutcome(document)).catch(() => null);
      if (outcome?.submitted) break;
      if (outcome?.errors.length && Date.now() - start > 4000) break;
      await this.page.waitForTimeout(1000);
    }
    outcome ??= { submitted: false, errors: ['Could not read the page after submitting'] };
    return this.result({
      status: outcome.submitted ? 'submitted' : 'not-submitted',
      errors: outcome.errors,
      button: btn.text || '(form.requestSubmit)',
      urlBefore,
    });
  }

  async result(extra) {
    let confirmation = '';
    for (const frame of this.page.frames()) {
      if (frame.isDetached() || CAPTCHA_FRAME.test(frame.url())) continue;
      await this.ensureEngine(frame);
      confirmation = await frame.evaluate(() => __FormTester.findConfirmation(document)).catch(() => '');
      if (confirmation) break;
    }
    return { ...extra, finalUrl: this.page.url(), title: await this.page.title().catch(() => ''), confirmation };
  }

  async close() {
    await this.browser?.close().catch(() => {});
    this.browser = null;
    this.page = null;
  }
}

export const MAX_ENTRIES = 5;

// Runs with no forced choices: each reload + fill gets a new random person.
export function entryRuns(count) {
  const n = Math.min(MAX_ENTRIES, Math.max(1, Math.floor(Number(count)) || 1));
  return Array.from({ length: n }, (_, i) => ({ forced: {}, choices: [`Entry ${i + 1}`] }));
}

export function parseOverrides(lines) {
  const out = {};
  for (const line of [].concat(lines || [])) {
    for (const part of String(line).split(/\r?\n/)) {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
  }
  return out;
}
