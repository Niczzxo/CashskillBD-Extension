/* CashSkillBD — 10-content.js : bootstrap + message router (loaded last).
 *
 * The UI now lives in Chrome's native side panel. This file:
 *  - exposes CSB.bridge so tab-side engines can push events to the panel,
 *  - routes CSB_BUS commands from the side panel to the tab-side engines,
 *  - boots the always-on tab features (page-translate detection, force copy).
 */
'use strict';

(function () {
  // Guard against double injection (e.g. icon clicked twice quickly).
  // Version-aware: after an extension update, a fresh injection must run
  // (the old scripts' context is invalidated on update).
  var CSB_VERSION = null;
  try { CSB_VERSION = chrome.runtime.getManifest().version; } catch (e) {}
  if (window.__CSB_LOADED__ && window.__CSB_LOADED__ === CSB_VERSION) return;
  window.__CSB_LOADED__ = CSB_VERSION || true;

  /* ---------- tab -> side panel event bridge ---------- */
  CSB.bridge = {
    emit: function (evt, data) {
      try {
        chrome.runtime.sendMessage({ type: 'CSB_EVT', evt: evt, data: data || {} });
      } catch (e) {}
    }
  };

  /* ---------- side panel -> tab command bus ---------- */
  function handleBus(cmd, args, sendResponse) {
    args = args || {};
    var done = function (payload) {
      try { sendResponse({ ok: true, data: payload || {} }); } catch (e) {}
    };
    try {
      switch (cmd) {
        // typing
        case 'typing.start':
          CSB.typing.setText(args.text || '');
          CSB.typing.start();
          done();
          break;
        case 'typing.stop':
          CSB.typing.stop();
          done();
          break;
        case 'typing.state':
          done({
            state: CSB.typing.state,
            hasText: !!CSB.typing.text,
            charIndex: CSB.typing.charIndex,
            total: CSB.typing.text.length
          });
          break;
        // page selection (translate "use selected text")
        case 'selection.get':
          var sel = '';
          try { sel = window.getSelection().toString(); } catch (e) {}
          done({ text: sel });
          break;
        // screenshot
        case 'shot.full':
          CSB.screenshot.setMode('full');
          CSB.screenshot.capture();
          done();
          break;
        case 'shot.area':
          CSB.screenshot.setMode('area');
          CSB.screenshot.startAreaSelect();
          done();
          break;
        case 'shot.copy':
          CSB.screenshot.copy().then(function (ok) { done({ copied: !!ok }); });
          return;
        case 'shot.download':
          CSB.screenshot.download();
          done();
          break;
        case 'shot.state':
          done({ state: CSB.screenshot.state, hasShot: !!CSB.screenshot.dataUrl });
          break;
        // ocr
        case 'ocr.select':
          CSB.ocr.startSelection();
          done();
          break;
        case 'ocr.copy':
          CSB.ocr.copy().then(function (ok) { done({ copied: !!ok }); });
          return;
        case 'ocr.clear':
          CSB.ocr.clearResult();
          done();
          break;
        case 'ocr.state':
          done({ state: CSB.ocr.state, text: CSB.ocr.resultText || '' });
          break;
        case 'pageText.copy': {
          // Extract all visible text from the page and copy it.
          var fullText = (function () {
            var walker = document.createTreeWalker(
              document.body || document.documentElement,
              NodeFilter.SHOW_TEXT,
              {
                acceptNode: function (node) {
                  var p = node.parentElement;
                  if (!p) return NodeFilter.FILTER_REJECT;
                  var tag = p.tagName;
                  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
                  var t = node.nodeValue;
                  if (!t || !t.trim()) return NodeFilter.FILTER_REJECT;
                  return NodeFilter.FILTER_ACCEPT;
                }
              }
            );
            var parts = [];
            var n;
            while ((n = walker.nextNode())) {
              parts.push(n.nodeValue.trim());
            }
            return parts.join('\n');
          })();
          var doDone = function (copied) { done({ copied: copied, length: fullText.length }); };
          try {
            navigator.clipboard.writeText(fullText).then(
              function () { doDone(true); },
              function () {
                try {
                  var ta = document.createElement('textarea');
                  ta.value = fullText;
                  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
                  document.body.appendChild(ta);
                  ta.select();
                  var ok = document.execCommand('copy');
                  ta.remove();
                  doDone(!!ok);
                } catch (e2) { doDone(false); }
              }
            );
          } catch (e) { doDone(false); }
          return;
        }
        // page translation
        case 'pt.state':
          done({ state: CSB.pageTranslate.state, detectedLang: CSB.pageTranslate.detectedLang });
          break;
        case 'pt.go':
          CSB.pageTranslate.translatePage();
          done();
          break;
        case 'pt.restore':
          CSB.pageTranslate.restorePage();
          done();
          break;
        // force copy
        case 'forcecopy.set':
          if (CSB.forceCopy) CSB.forceCopy.setEnabled(!!args.on);
          else CSB.settings.set('forceCopy.enabled', !!args.on);
          done();
          break;
        default:
          try { sendResponse({ ok: false, error: 'unknown command' }); } catch (e) {}
      }
    } catch (e) {
      try { sendResponse({ ok: false, error: String((e && e.message) || e) }); } catch (e2) {}
    }
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || typeof msg.type !== 'string') return false;
    if (msg.type === 'CSB_PING') {
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
      return false;
    }
    if (msg.type === 'CSB_TESS_PING') {
      sendResponse({ ok: typeof Tesseract !== 'undefined' && !!Tesseract.createWorker });
      return false;
    }
    if (msg.type === 'CSB_BUS') {
      handleBus(msg.cmd, msg.args, sendResponse);
      return true; // async response
    }
    return false;
  });

  // Keep the in-tab overlay host theme in sync with the OS when set to system.
  try {
    var mq = window.matchMedia('(prefers-color-scheme: light)');
    var onTheme = function () {
      if (CSB.settings.get('appearance.theme', 'system') === 'system' && CSB.panel.root) {
        try { CSB.panel.root.setAttribute('data-theme', CSB.settings.effectiveTheme()); } catch (e) {}
      }
    };
    if (mq.addEventListener) mq.addEventListener('change', onTheme);
    else if (mq.addListener) mq.addListener(onTheme);
  } catch (e) {}

  // Boot.
  CSB.settings.load().then(function () {
    // Bare shadow host for in-page overlays + toasts (the UI is in the side panel).
    if (CSB.panel && CSB.panel.ensureHost) CSB.panel.ensureHost();
    // Detect a foreign-language page and offer the Google-style translate bar.
    if (CSB.pageTranslate) CSB.pageTranslate.maybePrompt();
    // Force text selection on copy-blocking sites (unless disabled).
    if (CSB.forceCopy) CSB.forceCopy.apply();
  });
})();
