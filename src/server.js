import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Session, parseOverrides, entryRuns } from './runner.js';

const INDEX = new URL('./ui/index.html', import.meta.url);
const MAX_BODY = 64 * 1024;

let session = null;
let busy = false;
let lastDiscovery = null;
let queue = null;
const SUCCESS = ['submitted', 'submitted-manually', 'filled'];

// Runs queued submissions; without auto it does one, and auto stops at the first unconfirmed one.
async function advance(auto) {
  if (!queue) throw new Error('Nothing queued');
  while (queue.i < queue.runs.length) {
    const entry = await session.runOne(queue.formId, queue.runs[queue.i], queue.i, queue.opts);
    queue.i++;
    queue.results.push(entry);
    if (!auto || !SUCCESS.includes(entry.status)) break;
  }
  const last = queue.results[queue.results.length - 1];
  return {
    results: queue.results,
    total: queue.runs.length,
    remaining: queue.runs.length - queue.i,
    lastFailed: !!last && !SUCCESS.includes(last.status),
  };
}

const fillOptions = ({ submit, emailPattern, overrides }) => ({
  submit: submit !== false,
  emailPattern: typeof emailPattern === 'string' ? emailPattern : '',
  overrides: parseOverrides(typeof overrides === 'string' ? overrides : ''),
});

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

const routes = {
  async open({ url, headless }) {
    if (session && session.headless !== !!headless) { await session.close(); session = null; }
    session ??= new Session({ headless: !!headless });
    const finalUrl = await session.open(String(url || ''));
    return { finalUrl, forms: await session.scan() };
  },
  async scan() {
    if (!session?.page) throw new Error('Open a URL first');
    return { forms: await session.scan() };
  },
  async fill(body) {
    if (!session?.page) throw new Error('Open a URL first');
    return session.fill(String(body.formId), fillOptions(body));
  },
  async discover(body) {
    if (!session?.page) throw new Error('Open a URL first');
    const r = await session.fill(String(body.formId), { ...fillOptions(body), submit: false, discover: true });
    lastDiscovery = { formId: String(body.formId), runs: r.plan.runs };
    return r;
  },
  async coverage(body) {
    if (!session?.page) throw new Error('Open a URL first');
    if (!lastDiscovery?.runs.length) throw new Error('Search for conditionals first');
    queue = { formId: lastDiscovery.formId, runs: lastDiscovery.runs, i: 0, results: [], opts: fillOptions(body) };
    return advance(!!body.auto);
  },
  async entries(body) {
    if (!session?.page) throw new Error('Open a URL first');
    queue = { formId: String(body.formId), runs: entryRuns(body.count), i: 0, results: [], opts: fillOptions(body) };
    return advance(!!body.auto);
  },
  async next(body) {
    if (!session?.page) throw new Error('Open a URL first');
    return advance(!!body.auto);
  },
  async stop() {
    queue = null;
    return { ok: true };
  },
  async submit() {
    if (!session?.page) throw new Error('Open a URL first');
    return session.submit();
  },
  async manual() {
    if (!session?.page) throw new Error('Open a URL first');
    return session.result({ status: 'submitted-manually' });
  },
  async close() {
    await session?.close();
    session = null;
    queue = null;
    return { ok: true };
  },
};

export async function startServer(port = 3210) {
  const server = http.createServer(async (req, res) => {
    // Reject cross-site requests so other pages in your browser can't drive the tool.
    const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
    const origin = req.headers.origin;
    if (!allowed.includes(req.headers.host) || (origin && !allowed.some((h) => origin === `http://${h}`))) {
      return send(res, 403, { error: 'Forbidden' });
    }
    const { pathname } = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && pathname === '/') {
      return send(res, 200, await readFile(INDEX, 'utf8'), 'text/html; charset=utf-8');
    }
    const name = pathname.startsWith('/api/') && pathname.slice(5);
    if (req.method !== 'POST' || !name || !Object.hasOwn(routes, name)) return send(res, 404, { error: 'Not found' });
    if (busy && name !== 'close') return send(res, 409, { error: 'Busy, wait for the current action to finish' });
    busy = true;
    try {
      send(res, 200, await routes[name](await readJson(req)));
    } catch (e) {
      send(res, 400, { error: e.message });
    } finally {
      busy = false;
    }
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  console.log(`Field Day UI: http://localhost:${port}  (Ctrl+C to stop)`);
  const stop = async () => { await session?.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer(Number(process.env.PORT) || 3210);
}
