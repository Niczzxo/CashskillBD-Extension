/* CashSkillBD — 11-page-translate.js : full-page website translation.
 *
 * Google-Translate-style website translation:
 *  - When the extension is activated on a foreign-language page, the page
 *    language is detected (trusted <html lang>, else one small provider
 *    request on a text sample) and a translate bar offers to translate the
 *    whole page into the selected target language.
 *  - "Translate" collects visible text nodes (+ document.title, placeholder
 *    and alt/title attributes), translates them in newline-delimited batches
 *    through the selected translation provider, and swaps the text in place.
 *    Originals are kept so "Show original" restores the page exactly.
 *  - A MutationObserver translates content added afterwards (infinite
 *    scroll); only added nodes are handled, never characterData edits, so
 *    our own replacements can never loop.
 *
 * Batching note: the free endpoint's multi-q response shape is not
 * contractual, so batches are sent as ONE q with texts joined by "\n" and
 * split back on "\n". If the line count mismatches (the translator merged
 * lines), that batch falls back to one request per text.
 *
 * Privacy: detection sends a short text sample to the provider; translation
 * sends page text to the provider. Same disclosure as the Translate tab.
 * No always-on content script is added — detection runs when the user
 * activates the extension on the page.
 */
'use strict';

(function () {
  var U = CSB.util;

  var SKIP_TAGS = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CODE|PRE|KBD|SAMP|VAR|IFRAME|CANVAS)$/;
  // NOTE: OPTION/SELECT are intentionally NOT skipped — dropdown option
  // labels are translated too (form submission uses the `value` attribute,
  // so translating the visible label is safe). Options have no CSS boxes,
  // so they are collected explicitly in collectItems (visibility check
  // would drop them).
  var MEANINGFUL = /[^\d\s\p{P}\p{S}]/u; // has a real letter, not just digits/punct/symbols
  var BATCH_TEXTS = 25;
  var BATCH_CHARS = 1400; // keeps the joined payload inside one provider chunk
  var MAX_NODES = 3000;

  function cleanText(t) {
    return String(t || '').replace(/[\r\n]+/g, ' ').trim();
  }

  var pt = {
    state: 'idle', // idle | prompt | translating | translated
    detectedLang: null,

    emitState: function () {
      if (CSB.bridge) { try { CSB.bridge.emit('pt.state', { state: this.state, detectedLang: this.detectedLang }); } catch (e) {} }
    },
    pairs: [],          // applied translations: {node|el+attr|isTitle, orig, applied}
    observer: null,
    cancelRequested: false,
    barHost: null,
    barRoot: null,
    _prompted: false,
    _visCache: null,

    targetLang: function () {
      return CSB.settings.get('translation.targetLanguage', 'en');
    },

    /** Toast via the panel when it is available; never throws. */
    toast: function (msg) {
      try { if (CSB.panel && CSB.panel.root) CSB.panel.toast(msg); } catch (e) {}
    },

    /* ---------------- detection ---------------- */

    maybePrompt: function () {
      if (this._prompted) return;
      this._prompted = true;
      this._detectTries = 0;
      var self0 = this;
      // SPA navigation: re-detect when the URL changes without a full reload,
      // but only if we never translated (translated pages are covered by the
      // MutationObserver). Covers back/forward + hash routers.
      try {
        if (!this._spaHook) {
          this._spaHook = true;
          var recheck = function () {
            if (self0.state === 'idle') {
              self0._detectTries = 0;
              self0.detectedLang = null;
              self0._detectionDone = false;
              self0._noTextWarned = false;
              self0.tryDetect();
            }
          };
          window.addEventListener('popstate', function () { setTimeout(recheck, 1500); });
          window.addEventListener('hashchange', function () { setTimeout(recheck, 1500); });
        }
      } catch (e) {}
      // Late content: JS-heavy pages (surveys, SPAs) often render text long
      // after document_idle. Watch for added nodes and re-run detection once
      // substantial text appears (up to 60s). Without this, auto-translate
      // silently never fires and the user must click manually.
      try {
        if (!this._lateHook && window.MutationObserver && document.body) {
          this._lateHook = true;
          var moTimer = null;
          var mo = new MutationObserver(function () {
            if (self0.state === 'translated' || self0._detectionDone) {
              try { mo.disconnect(); } catch (e) {}
              return;
            }
            if (moTimer) return; // debounced
            moTimer = setTimeout(function () {
              moTimer = null;
              if (self0.state === 'translated' || self0._detectionDone) return;
              if (self0.sampleText().length >= 60) {
                try { mo.disconnect(); } catch (e2) {}
                self0._detectTries = 0;
                self0.tryDetect();
              }
            }, 1000);
          });
          mo.observe(document.body, { childList: true, subtree: true });
          setTimeout(function () { try { mo.disconnect(); } catch (e) {} }, 60000);
        }
      } catch (e2) {}
      this.tryDetect();
    },

    /** Detect with retries: heavy pages (SPA) may not have text yet at
     * injection time, so a too-short sample is retried a few times.
     * Detection always runs (auto-translate needs it); only the prompt
     * bar itself is gated on the prompt setting.
     *
     * Detection chain (first hit wins):
     *   1. trusted <html lang>
     *   2. chrome.i18n.detectLanguage — on-device CLD, no network needed
     *   3. provider endpoint (network)
     * With autoTranslate on (default), a detected foreign language means
     * the page is translated automatically — no manual step. */
    tryDetect: function () {
      try {
        var host = location.hostname || '';
        if (!host) return;
        var never = CSB.settings.get('pageTranslate.neverHosts', []);
        if (never.indexOf(host) !== -1) return;
        if (!document.body) return;
        var target = this.targetLang();
        var htmlLang = (document.documentElement.getAttribute('lang') || '')
          .toLowerCase().split(/[-_]/)[0];
        if (htmlLang && htmlLang === target) {
          // The lang attribute claims the target language, but survey
          // routers often set it wrong — verify against the actual text
          // (only verifiable for Latin-script targets).
          if (!this._latinTarget(target)) return;
          var vSample = this.sampleText();
          if (vSample.length < 60) {
            if (this._detectTries < 8) {
              this._detectTries++;
              var selfV = this;
              setTimeout(function () { selfV.tryDetect(); }, 2500);
            }
            return;
          }
          if (!this.looksForeign(vSample, target)) return; // truly the target language
          // Text looks foreign despite the attribute — detect properly below.
        }
        var sample = this.sampleText();
        if (sample.length < 60) {
          // Content may still be loading — retry for ~20s, then rely on the
          // late-content observer in maybePrompt for even slower pages.
          if (this._detectTries < 8) {
            this._detectTries++;
            var self = this;
            setTimeout(function () { self.tryDetect(); }, 2500);
          }
          return;
        }
        if (htmlLang && CSB.translate.langName(htmlLang) !== htmlLang.toUpperCase()) {
          this.onDetected(htmlLang); // trusted <html lang>, no network needed
          return;
        }
        var self2 = this;
        var autoT = CSB.settings.get('pageTranslate.autoTranslate', true);
        // On-device detection first (works offline); endpoint as backup.
        // Low-confidence non-target guesses still auto-translate when the
        // page really looks foreign — the provider detects per batch with
        // source=auto, so no manual click is ever needed.
        this.detectLocal(sample).then(function (r) {
          var code = r && r.code;
          var pct = (r && r.percentage) || 0;
          if (code && code !== target && pct >= 40) { self2.onDetected(code); return; }
          if (code && code === target && pct >= 50) return; // page is in target language
          if (code && code !== target && autoT && self2.looksForeign(sample, target)) {
            self2.translatePage();
            return;
          }
          self2.detectRemote(sample);
        });
      } catch (e) { /* never break the page */ }
    },

    /** On-device language detection via Chrome's built-in CLD.
     * Resolves to {code, percentage} (top guess), or null when
     * unavailable. Confidence filtering happens at the call site. */
    detectLocal: function (sample) {
      return new Promise(function (resolve) {
        var done = false;
        function fin(v) { if (!done) { done = true; resolve(v); } }
        try {
          if (!chrome.i18n || !chrome.i18n.detectLanguage) return fin(null);
          var timer = setTimeout(function () { fin(null); }, 8000);
          chrome.i18n.detectLanguage(sample.slice(0, 2000), function (res) {
            clearTimeout(timer);
            try {
              var langs = ((res && res.languages) || []).slice(0);
              langs.sort(function (a, b) { return (b.percentage || 0) - (a.percentage || 0); });
              var top = langs[0];
              var code = top && top.language
                ? String(top.language).toLowerCase().split(/[-_]/)[0] : '';
              // Skip unknown codes.
              if (code && CSB.translate.langName(code) !== code.toUpperCase()) {
                fin({ code: code, percentage: top.percentage || 0 });
              } else {
                fin(null);
              }
            } catch (e) { fin(null); }
          });
        } catch (e) { fin(null); }
      });
    },

    /** Heuristic: does the text look like it's NOT in the target language?
     * Script-agnostic — measures the share of non-ASCII letters. Used as a
     * last resort so auto-translate never needs a manual click. */
    looksForeign: function (sample, target) {
      try {
        var letters = sample.match(/\p{L}/gu) || [];
        if (!letters.length) return false;
        var nonAscii = 0;
        for (var i = 0; i < letters.length; i++) {
          if (letters[i].codePointAt(0) > 127) nonAscii++;
        }
        return nonAscii / letters.length > 0.08;
      } catch (e) { return false; }
    },

    /** Network detection via the translation provider (backup). */
    detectRemote: function (sample) {
      var self = this;
      this.detectViaEndpoint(sample).then(
        function (lang) { self.onDetected(lang); },
        function () {
          // Last resort: autoTranslate is on and the page really looks
          // foreign — translate with source=auto; the provider detects
          // per batch, so the user never has to click manually.
          try {
            if (CSB.settings.get('pageTranslate.autoTranslate', true) &&
                self.looksForeign(sample, self.targetLang())) {
              self.translatePage();
            }
          } catch (e) {}
        }
      );
    },

    sampleText: function () {
      try {
        return (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
      } catch (e) { return ''; }
    },

    detectViaEndpoint: async function (sample) {
      // 11-4: detect toward the user's target language, not hardcoded 'en'.
      // 11-7: never hang — 20s timeout.
      var provider = CSB.translate.currentProvider();
      var target = this.targetLang();
      var out = await Promise.race([
        provider.detectAndTranslate(sample.slice(0, 500), 'auto', target),
        new Promise(function (_, reject) {
          setTimeout(function () { reject(new Error('detect timeout')); }, 20000);
        })
      ]);
      return String(out.detected || 'auto').toLowerCase().split(/[-_]/)[0];
    },

    onDetected: function (lang) {
      this._detectionDone = true;
      lang = String(lang || '').toLowerCase().split(/[-_]/)[0];
      var target = this.targetLang();
      if (!lang || lang === 'auto' || lang === 'und' || lang === target) return;
      this.detectedLang = lang;
      this.emitState(); // the panel's "This page" card shows the detection
      if (CSB.settings.get('pageTranslate.autoTranslate', true)) {
        this.translatePage(); // full-auto: no click needed
        return;
      }
      if (!CSB.settings.get('pageTranslate.promptEnabled', true)) return; // silent
      this.state = 'prompt';
      this.renderBar('prompt');
      this.emitState();
    },

    /* ---------------- translate bar (own shadow host) ---------------- */

    ensureBar: function () {
      if (this.barHost) return;
      var host = document.createElement('div');
      host.id = 'cashskillbd-pt-host';
      // Host itself styled inline (immune to page CSP style-src rules).
      host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483645;pointer-events:none;';
      var shadow = host.attachShadow({ mode: 'open' });
      try {
        var sheet = new CSSStyleSheet();
        sheet.replaceSync(CSB.CSS);
        shadow.adoptedStyleSheets = [sheet];
      } catch (e) {
        var st = document.createElement('style');
        st.textContent = CSB.CSS;
        shadow.appendChild(st);
      }
      var root = U.el('div', 'csb-root');
      root.setAttribute('data-theme', CSB.settings.effectiveTheme());
      root.style.setProperty('--csb-accent', CSB.settings.effectiveAccent());
      shadow.appendChild(root);
      document.documentElement.appendChild(host);
      this.barHost = host;
      this.barRoot = root;
    },

    renderBar: function (mode) {
      this.ensureBar();
      var tName = CSB.translate.langName(this.targetLang());
      var sName = CSB.translate.langName(this.detectedLang);
      var html = '';
      if (mode === 'prompt') {
        // If detection never succeeded (offline/blocked endpoint, or the user
        // translated manually with source=auto then hit "Show original"),
        // never claim "Unknown" — say what we actually know.
        var langBit = this.detectedLang
          ? 'This page is in <b>' + U.esc(sName) + '</b>.'
          : 'This page may not be in <b>' + U.esc(tName) + '</b>.';
        html =
          '<div class="csb-pt-bar" role="dialog" aria-label="Translate this page">' +
            '<span class="csb-pt-globe">🌐</span>' +
            '<span class="csb-pt-text">' + langBit + '</span>' +
            '<button class="csb-btn csb-btn-primary csb-btn-sm" data-act="go" type="button">Translate to ' + U.esc(tName) + '</button>' +
            '<button class="csb-btn csb-btn-ghost csb-btn-sm" data-act="never" type="button">Never for this site</button>' +
            '<button class="csb-pt-x" data-act="hide" type="button" aria-label="Dismiss">×</button>' +
          '</div>';
      } else if (mode === 'working') {
        html =
          '<div class="csb-pt-bar" role="status">' +
            '<span class="csb-pt-globe">🌐</span>' +
            '<span class="csb-pt-text" id="csb-pt-prog">Translating…</span>' +
            '<button class="csb-btn csb-btn-ghost csb-btn-sm" data-act="cancel" type="button">Cancel</button>' +
          '</div>';
      } else if (mode === 'done') {
        html =
          '<div class="csb-pt-bar" role="status">' +
            '<span class="csb-pt-globe">🌐</span>' +
            '<span class="csb-pt-text">Translated to <b>' + U.esc(tName) + '</b>.</span>' +
            '<button class="csb-btn csb-btn-ghost csb-btn-sm" data-act="restore" type="button">Show original</button>' +
            '<button class="csb-pt-x" data-act="hide" type="button" aria-label="Dismiss">×</button>' +
          '</div>';
      }
      this.barRoot.innerHTML = html;
      var self = this;
      Array.prototype.forEach.call(this.barRoot.querySelectorAll('[data-act]'), function (b) {
        b.addEventListener('click', function () { self.onBarAct(b.getAttribute('data-act')); });
      });
    },

    onBarAct: function (act) {
      if (act === 'go') this.translatePage();
      else if (act === 'cancel') this.cancelRequested = true;
      else if (act === 'restore') this.restorePage();
      else if (act === 'hide') this.hideBar();
      else if (act === 'never') {
        try {
          var host = location.hostname || '';
          var never = CSB.settings.get('pageTranslate.neverHosts', []).slice(0, 200);
          if (host && never.indexOf(host) === -1) {
            never.push(host);
            CSB.settings.set('pageTranslate.neverHosts', never);
          }
        } catch (e) {}
        this.hideBar();
        this.toast('Won’t offer translation for this site');
      }
    },

    hideBar: function () {
      if (this.barRoot) this.barRoot.innerHTML = '';
    },

    progress: function (done, total) {
      if (!this.barRoot) return;
      var el = this.barRoot.querySelector('#csb-pt-prog');
      if (el) el.textContent = 'Translating… ' + done + ' / ' + total;
    },

    /* ---------------- collection ---------------- */

    acceptTextNode: function (node) {
      var p = node.parentElement;
      if (!p || SKIP_TAGS.test(p.tagName)) return null;
      if (p.isContentEditable) return null;
      if (p.closest && p.closest('[data-csb-ui],#cashskillbd-host,#cashskillbd-pt-host')) return null;
      var t = node.nodeValue;
      if (!t || !t.trim() || !MEANINGFUL.test(t)) return null;
      return t;
    },

    isVisible: function (el) {
      if (!this._visCache) this._visCache = new Map();
      var v = this._visCache.get(el);
      if (v === undefined) {
        v = true;
        try {
          // checkVisibility covers the element AND its ancestors (11-1);
          // fall back to manual walk on older Chrome.
          if (el.checkVisibility) {
            v = el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: false, checkSelectable: false });
          } else {
            for (var n = el; n && n !== document.documentElement; n = n.parentElement) {
              var cs = getComputedStyle(n);
              if (cs.display === 'none' || cs.visibility === 'hidden') { v = false; break; }
            }
          }
        } catch (e) {}
        this._visCache.set(el, v);
      }
      return v;
    },

    collectItems: function () {
      var items = [];
      if (!document.body) return items;
      this._visCache = new Map();
      var seen = new Set(); // text nodes already collected (option dedupe)
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      var node, count = 0;
      while ((node = walker.nextNode())) {
        if (count >= MAX_NODES) break;
        var t = this.acceptTextNode(node);
        if (!t) continue;
        if (!this.isVisible(node.parentElement)) continue;
        items.push({ node: node, text: t });
        seen.add(node);
        count++;
      }
      // Dropdown <option> labels (native <select> and <datalist>): option
      // elements have no CSS boxes, so the visibility check above would drop
      // them. Collect explicitly — the browser renders the native popup from
      // DOM option text, so translating here translates the dropdown list.
      try {
        var opts = document.body.querySelectorAll('option');
        for (var oi = 0; oi < opts.length && items.length < MAX_NODES + 300; oi++) {
          var opt = opts[oi];
          if (opt.closest && opt.closest('[data-csb-ui],#cashskillbd-host,#cashskillbd-pt-host')) continue;
          var tn = opt.firstChild;
          while (tn && tn.nodeType !== 3) tn = tn.nextSibling;
          if (!tn || seen.has(tn)) continue;
          var ot = tn.nodeValue;
          if (!ot || !ot.trim() || !MEANINGFUL.test(ot)) continue;
          items.push({ node: tn, text: ot });
          seen.add(tn);
        }
      } catch (e) {}
      // <optgroup> group labels inside dropdowns.
      try {
        var groups = document.body.querySelectorAll('optgroup[label]');
        for (var gi = 0; gi < groups.length && items.length < MAX_NODES + 300; gi++) {
          var g = groups[gi];
          if (g.closest && g.closest('[data-csb-ui],#cashskillbd-host,#cashskillbd-pt-host')) continue;
          var gv = g.getAttribute('label');
          if (gv && gv.trim() && MEANINGFUL.test(gv)) items.push({ el: g, attr: 'label', text: gv });
        }
      } catch (e2) {}
      if (document.title && document.title.trim() && MEANINGFUL.test(document.title)) {
        items.push({ isTitle: true, text: document.title });
      }
      try {
        var els = document.body.querySelectorAll('[placeholder],[alt],[title]');
        for (var i = 0; i < els.length && items.length < MAX_NODES + 300; i++) {
          (function (el) {
            if (el.closest && el.closest('[data-csb-ui],#cashskillbd-host,#cashskillbd-pt-host')) return;
            if (/^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) return;
            ['placeholder', 'alt', 'title'].forEach(function (at) {
              var v = el.getAttribute ? el.getAttribute(at) : null;
              if (v && v.trim() && MEANINGFUL.test(v)) items.push({ el: el, attr: at, text: v });
            });
          })(els[i]);
        }
      } catch (e) {}
      return items;
    },

    collectSubtree: function (nd, out) {
      var self = this;
      if (nd.nodeType === 3) {
        var t = this.acceptTextNode(nd);
        if (t && self.isVisible(nd.parentElement)) out.push({ node: nd, text: t });
        return;
      }
      if (nd.nodeType !== 1) return;
      if (nd.closest && nd.closest('[data-csb-ui],#cashskillbd-host,#cashskillbd-pt-host')) return;
      if (SKIP_TAGS.test(nd.tagName)) return;
      // <option> has no CSS box — never gate it on visibility.
      if (nd.tagName !== 'OPTION' && !self.isVisible(nd)) return; // 11-3: don't translate hidden dynamic nodes
      try {
        var walker = document.createTreeWalker(nd, NodeFilter.SHOW_TEXT, null);
        var n;
        while ((n = walker.nextNode())) {
          var t2 = self.acceptTextNode(n);
          if (t2) out.push({ node: n, text: t2 });
        }
      } catch (e) {}
    },

    /* ---------------- translation ---------------- */

    translateBatch: async function (texts, source, target) {
      var self = this;
      try {
        return await self.translateBatchPrimary(texts, source, target);
      } catch (e) {
        // Primary provider unreachable (network block / rate limit) —
        // try the MyMemory backup service automatically.
        self.usedBackup = true;
        return await self.translateBatchBackup(texts, source, target);
      }
    },

    translateBatchPrimary: async function (texts, source, target) {
      var provider = CSB.translate.currentProvider();
      var joined = texts.join('\n');
      var out = await provider.detectAndTranslate(joined, source, target);
      // Remember what the provider detected — if pre-translation detection
      // failed, this lets the prompt bar / panel show the real language.
      try {
        var det = String((out && out.detected) || '').toLowerCase().split(/[-_]/)[0];
        if (det && det !== 'auto' && det !== 'und') this._batchDetected = det;
      } catch (e) {}
      var parts = String(out.translated || '').split('\n');
      if (parts.length === texts.length) return parts;
      // Line count mismatched — fall back to one request per text.
      var results = new Array(texts.length);
      var idx = 0;
      async function worker() {
        while (idx < texts.length) {
          var i = idx++;
          try {
            var r = await provider.detectAndTranslate(texts[i], source, target);
            results[i] = r.translated;
          } catch (e) { results[i] = ''; }
        }
      }
      await Promise.all([worker(), worker(), worker(), worker()]);
      return results;
    },

    translateBatchBackup: async function (texts, source, target) {
      if (!CSB.translate || !CSB.translate.translateBatchMyMemory) {
        throw new Error('Backup service unavailable');
      }
      var parts = await CSB.translate.translateBatchMyMemory(texts.join('\n'), source, target);
      var out = new Array(texts.length);
      for (var i = 0; i < texts.length; i++) out[i] = parts[i] != null ? parts[i] : '';
      return out;
    },

    applyItem: function (it, translated) {
      if (!translated || !translated.trim()) return;
      if (!it.applied) {
        if (it.node) it.orig = it.node.nodeValue;
        else if (it.isTitle) it.orig = document.title;
        else if (it.el) it.orig = it.el.getAttribute(it.attr);
        it.applied = true;
        this.pairs.push(it);
      }
      try {
        if (it.node) it.node.nodeValue = translated;
        else if (it.isTitle) document.title = translated;
        else if (it.el) it.el.setAttribute(it.attr, translated);
      } catch (e) {}
    },

    makeBatches: function (items) {
      var batches = [], cur = [], curLen = 0;
      items.forEach(function (it) {
        if (cur.length >= BATCH_TEXTS || curLen + it.clean.length + 1 > BATCH_CHARS) {
          batches.push(cur); cur = []; curLen = 0;
        }
        cur.push(it); curLen += it.clean.length + 1;
      });
      if (cur.length) batches.push(cur);
      return batches;
    },

    prepareItems: function (items) {
      var out = [];
      items.forEach(function (it) {
        var c = cleanText(it.text);
        if (c && MEANINGFUL.test(c)) { it.clean = c; out.push(it); }
      });
      return out;
    },

    translatePage: async function () {
      // Watchdog: a stuck 'translating' state (e.g. a hung network request
      // from an older build) must never block translations forever.
      if (this.state === 'translating') {
        if (this._translatingSince && Date.now() - this._translatingSince > 180000) {
          this.state = 'idle';
        } else {
          return;
        }
      }
      var target = this.targetLang();
      // If we never detected (manual trigger), detect first so we can
      // bail out early when the page is already in the target language.
      if (!this.detectedLang) {
        try {
          var lang = await this.detectViaEndpoint(this.sampleText());
          if (lang && lang !== 'auto' && lang !== 'und') this.detectedLang = lang;
        } catch (e) {}
        if (this.detectedLang === target) {
          this.toast('Page is already in ' + CSB.translate.langName(target));
          return;
        }
      }
      var source = this.detectedLang || 'auto';
      try {
      this.state = 'translating';
      this._translatingSince = Date.now();
      this.emitState();
      this.cancelRequested = false;
      this.pairs = [];
      // 11-6: drop DOM references on navigation so detached nodes can GC.
      try {
        if (!this._pagehideHook) {
          this._pagehideHook = true;
          var self2 = this;
          window.addEventListener('pagehide', function () { self2.pairs = []; });
        }
      } catch (e) {}
      this.renderBar('working');
      var items = this.prepareItems(this.collectItems());
      var total = items.length;
      if (!total) {
        this.state = 'idle';
        this._translatingSince = 0;
        this.hideBar();
        // Nothing collectible yet (slow page) — allow the late-content
        // observer to retry the full cycle when more text arrives.
        this.detectedLang = null;
        this._detectionDone = false;
        if (!this._noTextWarned) {
          this._noTextWarned = true;
          this.toast('No translatable text found on this page');
        }
        return;
      }
      var batches = this.makeBatches(items);
      var done = 0, self = this, bi = 0, lastError = '';
      this.usedBackup = false;
      // Parallel workers: 6 batches in flight at once instead of one by
      // one — this is what makes full-page translation feel near-instant.
      async function worker() {
        while (bi < batches.length) {
          if (self.cancelRequested) return;
          var batch = batches[bi++];
          try {
            var parts = await self.translateBatch(
              batch.map(function (b) { return b.clean; }), source, target);
            batch.forEach(function (it, i) { self.applyItem(it, parts[i]); });
            // Adopt the provider's detected language when pre-detection failed.
            if (!self.detectedLang && self._batchDetected && self._batchDetected !== target) {
              self.detectedLang = self._batchDetected;
              self.emitState();
            }
          } catch (e) {
            // Keep originals for this batch, but remember why it failed so
            // the final message can say something useful.
            lastError = String((e && e.message) || e);
          }
          done += batch.length;
          self.progress(done, total);
        }
      }
      var workers = [];
      for (var w = 0; w < 6; w++) workers.push(worker());
      await Promise.all(workers);
      this._translatingSince = 0;
      if (this.cancelRequested) {
        this.restorePairs();
        this.state = 'idle';
        this.renderBar('prompt');
        this.emitState();
      } else if (!this.pairs.length) {
        // Nothing was actually translated (e.g. every request failed) —
        // do not claim success.
        this.state = 'idle';
        this.emitState();
        this.renderBar('prompt');
        this.toast(lastError
          ? 'Translation failed (' + lastError + ')'
          : 'Translation failed — check your connection and try again');
      } else {
        this.state = 'translated';
        this.emitState();
        this.startObserver();
        this.renderBar('done');
        if (CSB.settings.get('notifications.translationCompleted', true)) {
          U.notify('CashSkillBD', 'Page translated to ' + CSB.translate.langName(target) + '.');
        }
      }
      } catch (e) {
        // Never leave the engine wedged: an unexpected synchronous error
        // resets state so the next auto/manual attempt can run.
        try {
          this._translatingSince = 0;
          this.state = 'idle';
          this.emitState();
          this.renderBar('prompt');
          this.toast('Translation failed (' + String((e && e.message) || e) + ')');
        } catch (e2) {}
      }
    },

    restorePairs: function () {
      this.pairs.forEach(function (it) {
        try {
          if (it.node) it.node.nodeValue = it.orig;
          else if (it.isTitle) document.title = it.orig;
          else if (it.el && it.orig !== null && it.orig !== undefined) it.el.setAttribute(it.attr, it.orig);
        } catch (e) {}
      });
      this.pairs = [];
    },

    restorePage: function () {
      this.stopObserver();
      this.restorePairs();
      this.state = 'idle';
      this.emitState();
      this.renderBar('prompt');
      this.toast('Original page restored');
    },

    /* ---------------- live content ---------------- */

    startObserver: function () {
      this.stopObserver();
      var self = this;
      var pending = [];
      var timer = null;
      function flush() {
        timer = null;
        if (self.state !== 'translated' || !pending.length) { pending = []; return; }
        var batch = pending;
        pending = [];
        // 11-2/11-5: reset the visibility cache each flush (DOM changed), and
        // skip texts already translated to avoid burning quota on tickers /
        // live feeds that re-insert the same strings.
        self._visCache = new Map();
        var items = self.prepareItems(batch);
        if (!items.length) return;
        var target = self.targetLang();
        // Only translate texts that actually look foreign to the target.
        // (Replaces the old text-keyed `seen` dedup, which wrongly skipped
        // survey options that the page's framework had reverted to the
        // source language after our translation.)
        if (self._latinTarget(target)) {
          items = items.filter(function (it) { return self.looksForeign(it.clean, target); });
          if (!items.length) return;
        }
        var source = self.detectedLang || 'auto';
        var batches = self.makeBatches(items);
        (async function () {
          var bi = 0;
          async function worker() {
            while (bi < batches.length) {
              if (self.state !== 'translated') return;
              var batch = batches[bi++];
              try {
                var parts = await self.translateBatch(
                  batch.map(function (b) { return b.clean; }), source, target);
                batch.forEach(function (it, j) { self.applyItem(it, parts[j]); });
              } catch (e) {}
            }
          }
          var workers = [];
          for (var w = 0; w < 4; w++) workers.push(worker());
          await Promise.all(workers);
        })();
      }
      // Text dedup, kept only for non-Latin targets (tickers/live feeds).
      // For Latin targets the looksForeign filter in flush() handles this
      // without breaking re-rendered survey options.
      var seen = Object.create(null); // 11-2: hash set of translated texts
      var obs = new MutationObserver(function (muts) {
        if (self.state !== 'translated') return;
        var latin = self._latinTarget(self.targetLang());
        muts.forEach(function (m) {
          if (m.type !== 'childList') return;
          Array.prototype.forEach.call(m.addedNodes, function (nd) {
            var before = pending.length;
            self.collectSubtree(nd, pending);
            if (!latin) {
              // Drop texts we've already translated (live tickers re-insert).
              for (var i = before; i < pending.length; i++) {
                var key = pending[i].text;
                if (seen[key]) { pending.splice(i, 1); i--; before--; }
                else seen[key] = 1;
              }
            }
          });
        });
        if (pending.length && !timer) timer = setTimeout(flush, 1200);
      });
      try {
        obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
      } catch (e) { return; }
      this.observer = obs;
      // Safety net: every 8s (up to ~5 min) re-scan for visible foreign text
      // that slipped through — attribute-revealed content, framework
      // re-renders, shadow-DOM widgets. This keeps survey options translated
      // even when the page fights back.
      try {
        var sweeps = 0;
        var sweepTimer = setInterval(function () {
          if (self.state !== 'translated' || sweeps++ > 37) {
            clearInterval(sweepTimer);
            return;
          }
          try {
            var found = [];
            self._visCache = new Map();
            self.collectSweep(document.body || document.documentElement, found);
            if (!found.length) return;
            var sItems = self.prepareItems(found);
            var sTarget = self.targetLang();
            if (self._latinTarget(sTarget)) {
              sItems = sItems.filter(function (it) { return self.looksForeign(it.clean, sTarget); });
            }
            if (!sItems.length) return;
            var sSource = self.detectedLang || 'auto';
            var sBatches = self.makeBatches(sItems);
            (async function () {
              var sbi = 0;
              async function sWorker() {
                while (sbi < sBatches.length) {
                  if (self.state !== 'translated') return;
                  var sb = sBatches[sbi++];
                  try {
                    var sParts = await self.translateBatch(
                      sb.map(function (b) { return b.clean; }), sSource, sTarget);
                    sb.forEach(function (it, j) { self.applyItem(it, sParts[j]); });
                  } catch (e) {}
                }
              }
              var sWorkers = [];
              for (var w = 0; w < 4; w++) sWorkers.push(sWorker());
              await Promise.all(sWorkers);
            })();
          } catch (e) {}
        }, 8000);
        this._sweepTimer = sweepTimer;
      } catch (e2) {}
    },

    stopObserver: function () {
      if (this.observer) {
        try { this.observer.disconnect(); } catch (e) {}
        this.observer = null;
      }
      if (this._sweepTimer) {
        try { clearInterval(this._sweepTimer); } catch (e2) {}
        this._sweepTimer = null;
      }
    },

    /** Latin-script targets: the looksForeign() heuristic applies. */
    _latinTarget: function (target) {
      return /^(en|fr|de|es|it|pt|nl|sv|da|fi|no|nb|nn|is|pl|cs|sk|sl|hu|ro|hr|bs|ca|gl|eu|cy|ga|gd|mt|sq|sw|id|ms|vi|tl|mg|ny|st|sn|zu|xh|yo|ig|ha|so|su|jv|haw|la|eo|fy|co|ht|hmn|ceb|ku|tr|az|uz|tk|lv|lt|et)$/
        .test(String(target || '').toLowerCase());
    },

    /** Deep text collection for the sweep: walks the DOM and pierces open
     * shadow roots (survey widgets often use them). */
    collectSweep: function (root, out) {
      var self = this;
      var count = 0;
      function walk(nd) {
        if (count > 2000 || !nd) return;
        if (nd.nodeType === 3) {
          var t = self.acceptTextNode(nd);
          if (t) {
            try {
              if (self.isVisible(nd.parentElement)) { out.push({ node: nd, text: t }); count++; }
            } catch (e) {}
          }
          return;
        }
        if (nd.nodeType !== 1) return;
        if (nd.closest && nd.closest('[data-csb-ui],#cashskillbd-host,#cashskillbd-pt-host')) return;
        if (SKIP_TAGS.test(nd.tagName)) return;
        var ch = nd.firstChild;
        while (ch) { var nx = ch.nextSibling; walk(ch); ch = nx; }
        try {
          if (nd.shadowRoot) {
            var sn = nd.shadowRoot.firstChild;
            while (sn) { var snx = sn.nextSibling; walk(sn); sn = snx; }
          }
        } catch (e2) {}
      }
      try { walk(root); } catch (e3) {}
    },
  };

  CSB.pageTranslate = pt;
})();
