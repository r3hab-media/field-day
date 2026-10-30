// Field Day extension service worker: menu/toolbar entry points, script injection, and cross-frame calls.
const MENU_ID = 'form-tester-open';
const CAPTCHA_FRAME = /recaptcha|hcaptcha|challenges\.cloudflare\.com|friendlycaptcha/i;
const FRAME_OPS = new Set([
  'listForms', 'selectForm', 'fillTarget', 'prepareClick', 'requestSubmit', 'getInvalid',
  'detectCaptcha', 'findConfirmation', 'submitOutcome', 'discoverConditionals', 'press',
]);

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Field Day: fill a form on this page',
    contexts: ['page', 'frame', 'editable', 'selection', 'link', 'image'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id !== undefined) openPanel(tab.id);
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id !== undefined) openPanel(tab.id);
});

async function injectEngine(tabId, frameIds) {
  const target = frameIds ? { tabId, frameIds } : { tabId, allFrames: true };
  await chrome.scripting.executeScript({ target, files: ['page-helper.js'], world: 'MAIN' }).catch(() => {});
  await chrome.scripting.executeScript({ target, files: ['engine.js'] }).catch(() => {});
}

async function openPanel(tabId) {
  try {
    await injectEngine(tabId);
    await chrome.scripting.executeScript({ target: { tabId }, files: ['panel.js'] });
  } catch (e) {
    // Browser pages (chrome://, edge://, the extension stores) can't be scripted.
    chrome.action.setBadgeText({ tabId, text: '!' });
    chrome.action.setTitle({ tabId, title: `Field Day can't run on this page: ${e.message}` });
  }
}

// After a reload the panel's script is gone, so reopen it when a run asked to continue.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return;
  const key = `resume:${tabId}`;
  const stored = await chrome.storage.session.get(key);
  if (!stored[key]) return;
  await chrome.storage.session.remove(key);
  openPanel(tabId);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined || sender.id !== chrome.runtime.id) return false;
  handle(msg, tabId).then(
    (result) => sendResponse({ ok: true, result }),
    (e) => sendResponse({ ok: false, error: String(e?.message || e) }),
  );
  return true;
});

async function handle(msg, tabId) {
  switch (msg?.type) {
    case 'resume-on-load':
      await chrome.storage.session.set({ [`resume:${tabId}`]: true });
      return true;
    case 'list-frames':
      return listFrames(tabId);
    case 'frame-call':
      return frameCall(tabId, msg.payload || {});
    default:
      throw new Error('Unknown request');
  }
}

async function listFrames(tabId) {
  await injectEngine(tabId);
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => ({ url: location.href, forms: globalThis.__FormTester ? globalThis.__FormTester.listForms(document) : [] }),
  });
  return results
    .filter((r) => r.frameId !== 0 && r.result && !CAPTCHA_FRAME.test(r.result.url) && r.result.forms.length)
    .map((r) => ({ frameId: r.frameId, url: r.result.url, forms: r.result.forms }));
}

async function frameCall(tabId, { frameId, op, args }) {
  if (!Number.isInteger(frameId) || !FRAME_OPS.has(op)) throw new Error('Invalid frame call');
  const run = () => chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    args: [op, Array.isArray(args) ? args : []],
    func: async (op, args) => {
      const FT = globalThis.__FormTester;
      if (!FT) return { missing: true };
      if (op === 'press') {
        const el = document.querySelector(args[0]);
        if (el) FT.press(el);
        return { value: !!el };
      }
      return { value: await FT[op](document, ...args) };
    },
  });
  let [r] = await run();
  if (r?.result?.missing) {
    await injectEngine(tabId, [frameId]);
    [r] = await run();
  }
  if (!r) throw new Error('The form frame is no longer on the page');
  return r.result?.value;
}
