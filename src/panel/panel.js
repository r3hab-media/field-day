// Field Day panel. Injected by the extension's service worker as a content script.
(async function () {
  const FT = globalThis.__FormTester;
  const HOST_ID = '__form-tester-panel';
  const SETTINGS = 'form-tester-settings';
  const COVERAGE = 'form-tester-coverage';
  const OK = ['submitted', 'filled'];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.getElementById(HOST_ID)?.remove();

  // ---------- environment ----------
  async function ext(type, payload) {
    const r = await chrome.runtime.sendMessage({ type, payload });
    if (!r?.ok) throw new Error(r?.error || 'Extension error');
    return r.result;
  }

  async function loadSettings() {
    try { return (await chrome.storage.local.get(SETTINGS))[SETTINGS] || {}; } catch { return {}; }
  }

  function saveSettings(s) {
    chrome.storage.local.set({ [SETTINGS]: s }).catch(() => {});
  }

  // Runs need a fresh page each time, so progress survives reloads in sessionStorage.
  const loadCoverage = () => {
    try { const c = JSON.parse(sessionStorage.getItem(COVERAGE) || 'null'); return c && c.url === location.href ? c : null; } catch { return null; }
  };
  const saveCoverage = (c) => {
    try { if (c) sessionStorage.setItem(COVERAGE, JSON.stringify(c)); else sessionStorage.removeItem(COVERAGE); } catch { /* ignore */ }
  };

  // A target is one document holding forms: local (same page) or a frame reached through the extension.
  function localTarget(doc) {
    return {
      remote: false,
      doc,
      call: async (op, ...args) => FT[op](doc, ...args),
      press: async (sel) => { const el = doc.querySelector(sel); if (el) FT.press(el); },
    };
  }

  function remoteTarget(frameId) {
    return {
      remote: true,
      frameId,
      call: (op, ...args) => ext('frame-call', { frameId, op, args }),
      press: (sel) => ext('frame-call', { frameId, op: 'press', args: [sel] }),
    };
  }

  // The page itself is a local target; forms in frames (any origin) are reached through the service worker.
  const docs = [document];

  // ---------- UI ----------
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);

  root.innerHTML = `
  <style>
    /* Sticker Sheet theme: light ground, 2px ink outlines, hard offset shadows. */
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .p { width: 360px; max-height: 85vh; overflow: auto; background: #eef0ff; color: #111; border: 2px solid #111;
         border-radius: 14px; box-shadow: 4px 4px 0 #111; font-size: 13px; }
    header { position: sticky; top: 0; z-index: 1; display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #fff; border-bottom: 2px solid #111; }
    header b { font-size: 15px; font-weight: 800; letter-spacing: -.01em; }
    header button { background: #fff; border: 2px solid #111; border-radius: 8px; color: #111; width: 28px; height: 28px; font-size: 18px; line-height: 1; cursor: pointer; }
    header button:hover { background: #ff6fae; }
    header nav { display: flex; align-items: center; gap: 8px; }
    .coffee { font-size: 11px; font-weight: 800; color: #111; text-decoration: none; background: #ffd43b; border: 2px solid #111; border-radius: 999px; padding: 2px 9px; }
    .coffee:hover { background: #ff6fae; }
    :focus-visible { outline: 3px solid #2442e0; outline-offset: 2px; }
    section { padding: 10px 12px; }
    label { font-weight: 600; }
    input[type=checkbox], input[type=radio] { accent-color: #2442e0; }
    .f { display: flex; gap: 8px; background: #fff; border: 2px solid #111; border-radius: 10px; padding: 6px 8px; margin: 6px 0; cursor: pointer; font-weight: 400; }
    .f:has(input:checked) { background: #dfe4ff; box-shadow: 2px 2px 0 #111; }
    .m { color: #3d3d52; font-size: 12px; }
    summary.m { font-weight: 700; cursor: pointer; margin-top: 8px; }
    .t { display: inline-block; font-size: 10px; font-weight: 800; background: #ff6fae; border: 2px solid #111; border-radius: 999px; padding: 0 6px; margin-left: 4px; transform: rotate(3deg); }
    label.o { display: block; margin: 6px 0 2px; font-weight: 700; font-size: 12px; }
    input[type=text], textarea, select { background: #fff; color: #111; border: 2px solid #111; border-radius: 8px; font-size: 12px; }
    input[type=text], textarea { width: 100%; padding: 5px; }
    textarea { height: 52px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    .btn { background: #ffd43b; color: #111; border: 2px solid #111; border-radius: 10px; box-shadow: 3px 3px 0 #111; padding: 6px 12px; cursor: pointer; font-size: 13px; font-weight: 800;
           transition: transform .08s ease, box-shadow .08s ease; }
    .btn.s { background: #fff; }
    .btn:hover { transform: translate(-1px, -1px); }
    .btn:active { transform: translate(2px, 2px); box-shadow: none; }
    .row { display: flex; gap: 8px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
    .st { padding: 6px 8px; background: #fff; border: 2px solid #111; border-radius: 10px; margin: 8px 0; white-space: pre-line; font-weight: 600; }
    .ok { background: #e3fff0; } .w { background: #fff4c2; } .st.e { background: #ffe0ee; }
    tr.e td { background: #ffe0ee; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; background: #fff; border: 2px solid #111; border-radius: 8px; margin: 6px 0; }
    td { padding: 3px 5px; border-bottom: 1px solid #c9cce6; vertical-align: top; word-break: break-word; }
    pre { background: #fff; border: 2px solid #111; padding: 6px; border-radius: 8px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; white-space: pre-wrap; margin: 6px 0; }
    ol { padding-left: 18px; margin: 4px 0; font-size: 12px; }
  </style>
  <div class="p">
    <header><b>Field Day</b><nav><a class="coffee" href="https://buymeacoffee.com/r3habmedia" target="_blank" rel="noopener">☕ Buy me a coffee</a><button id="x" title="Close">&times;</button></nav></header>
    <section>
      <div id="forms"></div>
      <div class="row"><label><input type="checkbox" id="submit" checked> Submit after filling</label></div>
      <div class="row" id="entriesWrap" style="margin-top:2px"><label>Entries <select id="entries"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label></div>
      <div class="row" style="margin-top:2px"><label><input type="checkbox" id="cond"> Search for conditionals</label></div>
      <div class="row" style="margin-top:2px"><label title="When running multiple entries or conditional runs"><input type="checkbox" id="auto"> Auto-continue to the next submission</label></div>
      <details><summary class="m">Options</summary>
        <label class="o" for="email">Email pattern ({random} {timestamp} {first} {last})</label>
        <input type="text" id="email" placeholder="qa+{random}@yourdomain.com">
        <label class="o" for="ov">Pinned values (field=value per line)</label>
        <textarea id="ov"></textarea>
      </details>
      <div class="row"><button class="btn" id="fill">Fill form</button><button class="btn s" id="rescan">Rescan</button></div>
      <div id="out"></div>
    </section>
  </div>`;

  const $ = (id) => root.getElementById(id);
  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
  const status = (cls, text) => $('out').prepend(el('div', { className: 'st ' + cls, textContent: text }));
  const noun = (c) => c.label || 'Run';

  const saved = await loadSettings();
  $('email').value = saved.email || '';
  $('ov').value = saved.overrides || '';
  if ('submit' in saved) $('submit').checked = saved.submit;
  if ('cond' in saved) $('cond').checked = saved.cond;
  if ('auto' in saved) $('auto').checked = saved.auto;
  if (saved.entries) $('entries').value = saved.entries;
  const syncEntries = () => { $('entriesWrap').style.display = $('cond').checked ? 'none' : ''; };
  $('cond').addEventListener('change', syncEntries);
  syncEntries();
  const persist = () => saveSettings({
    email: $('email').value, overrides: $('ov').value, submit: $('submit').checked,
    cond: $('cond').checked, entries: $('entries').value, auto: $('auto').checked,
  });

  let highlighted = null;
  const highlight = (node) => {
    if (highlighted) { highlighted.style.outline = highlighted.__ftOutline || ''; highlighted = null; }
    if (node && node.tagName !== 'BODY') { node.__ftOutline = node.style.outline; node.style.outline = '3px dashed #2442e0'; highlighted = node; }
  };

  // ---------- forms ----------
  let items = [];

  async function scan() {
    const found = [];
    docs.forEach((doc, di) => {
      const t = localTarget(doc);
      let frameUrl = null;
      if (di > 0) try { frameUrl = doc.location.href; } catch { /* ignore */ }
      FT.listForms(doc).forEach((f) => found.push({ ...f, key: `L${di}:${f.index}`, t, frameUrl, framed: di > 0 }));
    });
    try {
      for (const fr of await ext('list-frames')) {
        const t = remoteTarget(fr.frameId);
        fr.forms.forEach((f) => found.push({ ...f, key: `R${fr.frameId}:${f.index}`, t, frameUrl: fr.url, framed: true }));
      }
    } catch { /* frames unavailable */ }
    items = found;
    renderForms();
    return items;
  }

  function renderForms() {
    const box = $('forms');
    box.replaceChildren();
    if (!items.length) box.append(el('div', { className: 'st w', textContent: 'No forms found on this page.' }));
    items.forEach((f, i) => {
      const title = f.heading || f.id || f.name || (f.kind === 'loose' ? 'Fields outside a <form>' : 'Untitled form');
      const item = el('label', { className: 'f' },
        el('input', { type: 'radio', name: 'f', value: f.key, checked: i === 0 }),
        el('div', {},
          el('div', {}, el('b', { textContent: title }), ` · ${f.fieldCount} fields`,
            ...(f.framed ? [el('span', { className: 't', textContent: 'iframe' })] : []),
            ...(f.captcha ? [el('span', { className: 't', textContent: 'CAPTCHA' })] : [])),
          el('div', { className: 'm', textContent: f.preview.join(' | ') })));
      if (!f.t.remote) {
        item.onmouseenter = () => highlight(FT.formRoots(f.t.doc)[f.index]);
        item.onmouseleave = () => highlight(null);
      }
      box.append(item);
    });
  }

  const selectedItem = () => items.find((i) => i.key === root.querySelector('input[name=f]:checked')?.value);
  const targetRef = (item) => ({ frameUrl: item.frameUrl, index: item.index });
  const findItem = (ref) => items.find((i) => i.frameUrl === ref.frameUrl && i.index === ref.index)
    || items.find((i) => i.frameUrl === ref.frameUrl);

  function renderSteps(steps) {
    const rows = [];
    for (const s of steps) {
      if (steps.length > 1) rows.push(el('tr', {}, el('td', { colSpan: 2 }, el('b', { textContent: 'Step ' + s.step }))));
      for (const f of s.filled) rows.push(el('tr', {}, el('td', { textContent: f.field }), el('td', { textContent: f.value })));
      for (const e of s.errors) rows.push(el('tr', { className: 'e' }, el('td', { textContent: e.field }), el('td', { textContent: e.error })));
    }
    $('out').append(el('table', {}, ...rows));
  }

  async function captchaFor(t) {
    const own = await t.call('detectCaptcha').catch(() => ({ found: false }));
    if (own.found) return own;
    for (const d of docs) { const c = FT.detectCaptcha(d); if (c.found) return c; }
    return { found: false };
  }

  async function submit(t) {
    const b = await t.call('prepareClick', 'submit');
    if (b.found) await t.press(b.selector);
    else if (b.canRequestSubmit) await t.call('requestSubmit');
    else { status('e', 'Filled, but no submit button was found.'); return 'no-submit-button'; }
    let out = { submitted: false, errors: [] };
    for (let waited = 0; waited < 20000; waited += 1000) {
      await sleep(1000);
      try { out = await t.call('submitOutcome'); } catch { out = { submitted: true, errors: [] }; }
      if (out.submitted || (out.errors.length && waited >= 4000)) break;
    }
    if (!out.submitted) {
      status('e', `Clicked "${b.text || 'Submit'}", but the form is still showing. It probably wasn't submitted.` +
        (out.errors.length ? '\nPage errors:\n- ' + out.errors.join('\n- ') : ''));
      return 'not-submitted';
    }
    status('ok', `Submitted${b.text ? ` via "${b.text}"` : ''}.${out.confirmation ? '\nPage says: ' + out.confirmation : ''}`);
    return 'submitted';
  }

  function parseOverrides(text) {
    const o = {};
    text.split(/\r?\n/).forEach((l) => { const i = l.indexOf('='); if (i > 0) o[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
    return o;
  }

  async function run(item, { forced = {}, submit: doSubmit = $('submit').checked, discover = $('cond').checked, heading = '' } = {}) {
    const t = item.t;
    persist();
    highlight(null);
    const overrides = parseOverrides($('ov').value);
    $('out').replaceChildren();
    if (heading) status('', heading);
    await t.call('selectForm', item.index);
    if (discover) status('', 'Searching for conditionals (trying each option)…');

    const steps = [];
    const nodes = [];
    let seen = [];
    let person = null;
    for (let step = 1; step <= 10; step++) {
      if (discover) {
        const d = await t.call('discoverConditionals', { seen });
        seen = d.seen;
        d.nodes.forEach((n) => nodes.push({ ...n, step }));
      }
      const res = await t.call('fillTarget', { fresh: step === 1, emailPattern: $('email').value, overrides, forced, person });
      person = res.person;
      steps.push({ step, ...res });
      if (step > 1 && !res.filled.length) break;
      const next = await t.call('prepareClick', 'next');
      if (!next.found) break;
      await t.press(next.selector);
      await sleep(1000);
    }
    renderSteps(steps);
    const invalid = await t.call('getInvalid').catch(() => []);
    if (invalid.length) status('w', 'Still failing validation: ' + invalid.map((v) => `${v.field} (${v.message})`).join('; '));

    if (discover) { renderDiscovery(nodes, item); return 'filled'; }
    if (!doSubmit) { status('ok', 'Filled. Not submitted.'); return 'filled'; }
    const cap = await captchaFor(t);
    if (cap.found) {
      status('w', `${cap.kind} detected. Solve it on the page, then click Submit now (or submit it yourself).`);
      const btn = el('button', { className: 'btn', textContent: 'Submit now' });
      $('out').prepend(el('div', { className: 'row' }, btn));
      return new Promise((resolve) => { btn.onclick = () => { btn.remove(); submit(t).then(resolve); }; });
    }
    return submit(t);
  }

  // ---------- multi-run (entries / conditionals) ----------
  async function reloadForNext(c) {
    saveCoverage(c);
    await ext('resume-on-load').catch(() => {});
    location.reload();
  }

  function startRuns(c, pageIsFresh) {
    saveCoverage(c);
    return pageIsFresh ? runStep(c) : reloadForNext(c);
  }

  function renderDiscovery(nodes, item) {
    if (!nodes.length) return status('ok', 'No conditionals found. The form was filled but not submitted.');
    const plan = FT.buildPlan(nodes);
    const doSubmit = $('submit').checked;
    const start = el('button', { className: 'btn', textContent: doSubmit ? `Start ${plan.runs.length} submissions` : `Fill ${plan.runs.length} times (no submit)` });
    start.onclick = () => startRuns({
      url: location.href, target: targetRef(item), runs: plan.runs, i: 0, results: [], submit: doSubmit, auto: $('auto').checked,
    }, false);
    const how = $('auto').checked
      ? 'Auto-continue is on: each run loads the form fresh and the next one starts once it is confirmed.'
      : 'The page reloads before each run, and the panel reopens by itself.';
    $('out').prepend(el('div', {},
      el('div', { className: 'st ok', textContent: `Found ${nodes.length} conditional field(s):` }),
      el('pre', { textContent: FT.describeConditionals(nodes).join('\n') }),
      el('div', { className: 'm', textContent: `${plan.branchCount} branches, covered by ${plan.runs.length} run(s). Each run reloads the page and forces these choices:` }),
      el('ol', {}, ...plan.runs.map((r) => el('li', { textContent: r.choices.join('; ') }))),
      el('div', { className: 'm', textContent: how }),
      el('div', { className: 'row' }, start)));
  }

  function showCoverage(c) {
    const box = el('div', {});
    $('out').prepend(box);
    if (c.i >= c.runs.length) {
      const ok = c.results.filter((r) => OK.includes(r.status)).length;
      box.append(
        el('div', { className: 'st ' + (ok === c.results.length ? 'ok' : 'w'), textContent: `Done: ${ok} of ${c.results.length} succeeded.` }),
        el('ol', {}, ...c.results.map((r) => el('li', { textContent: `${r.choices.join('; ')} -> ${r.status}` }))));
      saveCoverage(null);
      return;
    }
    const runBtn = el('button', { className: 'btn', textContent: `Run ${c.i + 1} of ${c.runs.length}` });
    const cancel = el('button', { className: 'btn s', textContent: 'Cancel' });
    box.append(
      el('div', { className: 'st w', textContent: `${noun(c)} ${c.i + 1} of ${c.runs.length}:\n${c.runs[c.i].choices.join('\n')}` }),
      el('div', { className: 'row' }, runBtn, cancel));
    cancel.onclick = () => { saveCoverage(null); box.remove(); };
    runBtn.onclick = () => {
      box.remove();
      c.auto = $('auto').checked;
      runStep(c);
    };
  }

  function askContinue(message) {
    return new Promise((resolve) => {
      const cont = el('button', { className: 'btn', textContent: 'Continue' });
      const stop = el('button', { className: 'btn s', textContent: 'Stop' });
      const box = el('div', {}, el('div', { className: 'st w', textContent: message }), el('div', { className: 'row' }, cont, stop));
      cont.onclick = () => { box.remove(); resolve(true); };
      stop.onclick = () => { box.remove(); resolve(false); };
      $('out').prepend(box);
    });
  }

  async function runStep(c) {
    const item = findItem(c.target);
    if (!item) { status('e', "Couldn't find the form on this page. Click Rescan, or Cancel and start again."); return; }
    const result = await run(item, {
      forced: c.runs[c.i].forced, submit: c.submit, discover: false,
      heading: `${noun(c)} ${c.i + 1} of ${c.runs.length}${c.auto ? ' (auto-continue)' : ''}`,
    });
    c.results.push({ choices: c.runs[c.i].choices, status: result });
    c.i++;
    saveCoverage(c);
    if (c.i >= c.runs.length) return showCoverage(c);
    if (c.auto) {
      if (!OK.includes(result) && !(await askContinue(`${noun(c)} ${c.i} wasn't confirmed as submitted. Continue with the rest, or stop?`))) {
        c.i = c.runs.length;
        return showCoverage(c);
      }
      status('', 'Reloading for the next one…');
      await sleep(800);
      return reloadForNext(c);
    }
    const next = el('button', { className: 'btn', textContent: `Reload for ${noun(c).toLowerCase()} ${c.i + 1} of ${c.runs.length}` });
    next.onclick = () => reloadForNext(c);
    $('out').prepend(el('div', { className: 'row' }, next),
      el('div', { className: 'm', textContent: 'The panel reopens by itself after the page reloads.' }));
  }

  async function startEntries() {
    const item = selectedItem();
    if (!item) return;
    const n = Math.min(5, Math.max(1, Number($('entries').value) || 1));
    const runs = Array.from({ length: n }, (_, i) => ({ forced: {}, choices: [`Entry ${i + 1}`] }));
    return startRuns({
      url: location.href, target: targetRef(item), runs, i: 0, results: [], submit: $('submit').checked, label: 'Entry', auto: $('auto').checked,
    }, true);
  }

  // ---------- wiring ----------
  const report = (e) => status('e', String(e && e.message || e));
  $('x').onclick = () => { highlight(null); host.remove(); };
  $('rescan').onclick = () => scan().catch(report);
  $('fill').onclick = () => {
    persist();
    const item = selectedItem();
    if (!item) return;
    const multi = !$('cond').checked && Number($('entries').value) > 1;
    (multi ? startEntries() : run(item)).catch(report);
  };

  await scan();
  const pending = loadCoverage();
  if (pending) {
    if (pending.auto && pending.i < pending.runs.length) {
      // Wait for slow forms (e.g. Cognito) to render after the reload before continuing.
      for (let t = 0; t < 20000 && !findItem(pending.target); t += 1000) { await sleep(1000); await scan(); }
      await sleep(1000);
      runStep(pending).catch(report);
    } else {
      showCoverage(pending);
    }
  }
})();
