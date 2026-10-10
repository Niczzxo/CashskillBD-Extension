/* CashSkillBD — background service worker (Manifest V3)
 *
 * Responsibilities:
 *  - Open Chrome's native side panel when the toolbar icon is clicked.
 *  - Inject content scripts on demand for tabs that predate the install
 *    (fresh pages get them automatically via manifest content_scripts).
 *  - Route keyboard-shortcut commands (open the panel, then hand the
 *    command to it; stop-typing goes straight to the tab).
 *  - Capture the visible tab (used by screenshot stitching + OCR region).
 *  - Load the OCR engine on demand (CSP-safe: scripting.executeScript files
 *    are not subject to the page's content security policy).
 *  - Show subtle notifications (only the kinds the user enabled in Settings).
 */

'use strict';

const CONTENT_FILES = [
  'src/content/00-util.js',
  'src/content/01-storage.js',
  'src/content/02-styles.js',
  'src/content/13-tabhost.js',
  'src/content/04-typing.js',
  'src/content/06-translate.js',
  'src/content/07-screenshot.js',
  'src/content/08-ocr.js',
  'src/content/11-page-translate.js',
  'src/content/12-force-copy.js',
  'src/content/10-content.js'
];

const TESSERACT_FILES = ['src/lib/tesseract/tesseract.min.js'];

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: title || 'CashSkillBD',
      message: message || ''
    });
  } catch (e) { /* notifications unavailable — never fatal */ }
}

// Clicking the toolbar icon opens the native side panel (Chrome handles it).
try {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});
} catch (e) {}

chrome.runtime.onInstalled.addListener(function () {
  try {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});
  } catch (e) {}
});

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0] : null;
}

/** Inject content scripts if needed. Returns true when the tab can talk to us. */
async function ensureContent(tabId, quiet) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'CSB_PING' });
    if (res && res.ok) return true;
  } catch (e) { /* not injected yet */ }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
    return true;
  } catch (e) {
    if (!quiet) {
      notify(
        'CashSkillBD',
        'CashSkillBD cannot run on this page (for example chrome:// pages, the Chrome Web Store, or other restricted pages).'
      );
    }
    return false;
  }
}

/** Load the OCR engine file into the tab (lazy, only when OCR is first used). */
async function ensureTesseract(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'CSB_TESS_PING' });
    if (res && res.ok) return true;
  } catch (e) { /* engine not loaded yet */ }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: TESSERACT_FILES });
    return true;
  } catch (e) {
    return false;
  }
}

/** Pixel-perfect full-page capture via the debugger (no scroll stitching).
 * Returns a data URL, or throws when the debugger cannot be used. */
async function debugCaptureFullPage(tabId, format, quality, fullW, fullH) {
  const target = { tabId };
  await chrome.debugger.attach(target, '1.3');
  try {
    // Strategy 1: Emulation — resize the viewport to the full page dimensions,
    // then capture the viewport. No captureBeyondViewport, no scrolling,
    // no stitching — duplication is structurally impossible.
    if (fullW && fullH && fullH <= 16000) {
      try {
        await chrome.debugger.sendCommand(target, 'Emulation.setDeviceMetricsOverride', {
          width: Math.round(fullW),
          height: Math.round(fullH),
          deviceScaleFactor: 1,
          mobile: false
        });
        // Give the page a moment to re-layout at the new viewport size.
        await new Promise(r => setTimeout(r, 400));
        const params = { format: format === 'jpeg' ? 'jpeg' : 'png' };
        if (params.format === 'jpeg' && quality) params.quality = quality;
        const res = await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', params);
        await chrome.debugger.sendCommand(target, 'Emulation.clearDeviceMetricsOverride').catch(() => {});
        if (res && res.data) {
          return 'data:image/' + params.format + ';base64,' + res.data;
        }
        // Emulation capture failed — fall through to captureBeyondViewport.
      } catch (e) {
        try { await chrome.debugger.sendCommand(target, 'Emulation.clearDeviceMetricsOverride').catch(() => {}); } catch (e2) {}
      }
    }
    // Strategy 2: captureBeyondViewport (Chrome native full-page).
    const params = { captureBeyondViewport: true, format: format === 'jpeg' ? 'jpeg' : 'png' };
    if (params.format === 'jpeg' && quality) params.quality = quality;
    const res = await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', params);
    if (!res || !res.data) throw new Error('capture failed');
    return 'data:image/' + params.format + ';base64,' + res.data;
  } finally {
    try {
      await chrome.debugger.sendCommand(target, 'Emulation.clearDeviceMetricsOverride').catch(() => {});
      await chrome.debugger.detach(target);
    } catch (e) {}
  }
}

/** Open the native side panel for the active tab. */
async function openSidePanel(tabId) {
  try {
    await chrome.sidePanel.open({ tabId });
    return true;
  } catch (e) {
    return false;
  }
}

// Fallback: if the panel behavior ever fails to fire, open it ourselves.
chrome.action.onClicked.addListener(async () => {
  const tab = await getActiveTab();
  if (!tab || tab.id == null) return;
  await openSidePanel(tab.id);
});

// Keyboard shortcuts. Commands that need the panel UI are stashed in
// session storage so the panel picks them up race-free on boot;
// stop-typing goes straight to the tab's engine (no panel popup needed).
chrome.commands.onCommand.addListener(async (command) => {
  try {
    const tab = await getActiveTab();
    if (!tab || tab.id == null) return;
    if (!(await ensureContent(tab.id, true))) return;
    if (command === 'stop-typing') {
      // Stop typing wherever it's actually running (S-3): prefer the tab
      // recorded by the panel when typing started, fall back to active tab.
      let stopTabId = tab.id;
      try {
        const r = await chrome.storage.session.get('csb_typing_tab');
        if (r && r.csb_typing_tab != null) stopTabId = r.csb_typing_tab;
      } catch (e) {}
      try { await chrome.tabs.sendMessage(stopTabId, { type: 'CSB_BUS', cmd: 'typing.stop', args: {} }); } catch (e) {}
      if (stopTabId !== tab.id) {
        try { await chrome.tabs.sendMessage(tab.id, { type: 'CSB_BUS', cmd: 'typing.stop', args: {} }); } catch (e2) {}
      }
      return;
    }
    if (command === 'open-panel' || command === 'start-typing' ||
        command === 'take-screenshot' || command === 'text-select') {
      try { await chrome.storage.session.set({ csb_pending_cmd: command }); } catch (e) {}
      await openSidePanel(tab.id);
    }
  } catch (e) { /* never leave an unhandled rejection (S-4) */ }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return false;

  if (msg.type === 'CSB_CAPTURE_VISIBLE') {
    const windowId = sender.tab ? sender.tab.windowId : undefined;
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }).then(
      (dataUrl) => sendResponse({ ok: true, dataUrl }),
      (err) => sendResponse({ ok: false, error: String((err && err.message) || err) })
    );
    return true; // async response
  }

  if (msg.type === 'CSB_FETCH') {
    // Network fetch on behalf of a tab: the service worker is not subject
    // to the page's Content-Security-Policy, so this succeeds where a
    // content-script fetch would be blocked (e.g. Taobao).
    // Validate the URL first (S-5): only http/https, no credential leaks.
    let fetchUrl = null;
    try {
      const u = new URL(String(msg.url || ''));
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad protocol');
      fetchUrl = u.toString();
    } catch (e) {
      sendResponse({ ok: false, error: 'invalid url' });
      return false;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 30000);
    fetch(fetchUrl, { method: 'GET', redirect: 'follow', signal: ctrl.signal })
      .then(async (res) => {
        clearTimeout(timer);
        var text = '';
        try { text = await res.text(); } catch (e) {}
        sendResponse({ ok: res.ok, status: res.status, text: text, url: res.url || fetchUrl });
      })
      .catch((err) => {
        clearTimeout(timer);
        const aborted = err && err.name === 'AbortError';
        sendResponse({ ok: false, error: aborted ? 'timeout' : String((err && err.message) || err) });
      });
    return true; // async response
  }

  if (msg.type === 'CSB_DEBUG_CAPTURE') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId == null) { sendResponse({ ok: false, error: 'no tab' }); return false; }
    debugCaptureFullPage(tabId, msg.format, msg.quality, msg.fullW, msg.fullH).then(
      (dataUrl) => sendResponse({ ok: true, dataUrl }),
      (err) => sendResponse({ ok: false, error: String((err && err.message) || err) })
    );
    return true; // async response
  }

  if (msg.type === 'CSB_LOAD_TESSERACT') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId == null) { sendResponse({ ok: false, error: 'no tab' }); return false; }
    ensureTesseract(tabId).then(
      (ok) => sendResponse({ ok }),
      (err) => sendResponse({ ok: false, error: String((err && err.message) || err) })
    );
    return true; // async response
  }

  if (msg.type === 'CSB_CLIPBOARD_WRITE_TEXT') {
    // Use offscreen document for reliable clipboard write without user activation.
    (async function () {
      try {
        // Ensure offscreen document exists
        var hasDoc = false;
        try {
          var clients = await chrome.offscreen.hasDocument();
          hasDoc = !!clients;
        } catch (e) {}
        if (!hasDoc) {
          await chrome.offscreen.createDocument({
            url: 'src/offscreen/offscreen.html',
            reasons: ['CLIPBOARD'],
            justification: 'Copy OCR/translation text to clipboard'
          });
        }
        // Send to offscreen document
        chrome.runtime.sendMessage(
          { type: 'CSB_OFFSCREEN_COPY_TEXT', text: msg.text || '' },
          function (res) {
            sendResponse(res || { ok: false, error: 'no response' });
          }
        );
      } catch (e) {
        // Fallback: try direct clipboard
        try {
          await navigator.clipboard.writeText(msg.text || '');
          sendResponse({ ok: true });
        } catch (e2) {
          sendResponse({ ok: false, error: String((e2 && e2.message) || e2) });
        }
      }
    })();
    return true; // async response
  }

  if (msg.type === 'CSB_CLIPBOARD_WRITE_IMAGE') {
    // Write image blob to clipboard via service worker.
    try {
      fetch(msg.dataUrl).then(r => r.blob()).then(blob => {
        var mime = blob.type || 'image/png';
        return navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
      }).then(
        () => sendResponse({ ok: true }),
        (err) => sendResponse({ ok: false, error: String((err && err.message) || err) })
      );
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
    return true; // async response
  }

  if (msg.type === 'CSB_NOTIFY') {
    notify(msg.title || 'CashSkillBD', msg.message || '');
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'CSB_ENSURE_CONTENT') {
    // The side panel asks us to (re)inject into a stale tab
    // (opened before install/update), then it retries its command.
    const tabId = msg.tabId;
    if (tabId == null) { sendResponse({ ok: false }); return false; }
    ensureContent(tabId, true).then(
      (ok) => sendResponse({ ok: !!ok }),
      () => sendResponse({ ok: false })
    );
    return true; // async response
  }

  return false;
});
