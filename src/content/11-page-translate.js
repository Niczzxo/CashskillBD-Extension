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

  var SKIP_TAGS = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION|SELECT|CODE|PRE|KBD|SAMP|VAR|IFRAME|CANVAS)$/;
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
      this.tryDetect();
    },

    /** Detect with retries: heavy pages (SPA) may not have text yet at
     * injection time, so a too-short sample is retried a few times.
     * Detection always runs (auto-translate needs it); only the prompt
     * bar itself is gated on the prompt setting. */
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
        if (htmlLang && htmlLang === target) return; // already the target language
        var sample = this.sampleText();
        if (sample.length < 60) {
          // Content may still be loading — retry a few times, then give up.
          if (this._detectTries < 4) {
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
        this.detectViaEndpoint(sample).then(
          function (lang) { self2.onDetected(lang); },
          function () { /* detection failed — stay silent */ }
        );
      } catch (e) { /* never break the page */ }
    },

    sampleText: function () {
      try {
        return (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
      } catch (e) { return ''; }
    },

    detectViaEndpoint: async function (sample) {
      var provider = CSB.translate.currentProvider();
      var out = await provider.detectAndTranslate(sample.slice(0, 500), 'auto', 'en');
      return String(out.detected || 'auto').toLowerCase().split(/[-_]/)[0];
    },

    onDetected: function (lang) {
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
        html =
          '<div class="csb-pt-bar" role="dialog" aria-label="Translate this page">' +
            '<span class="csb-pt-globe">🌐</span>' +
            '<span class="csb-pt-text">This page is in <b>' + U.esc(sName) + '</b>.</span>' +
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
          var cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') v = false;
        } catch (e) {}
        this._visCache.set(el, v);
      }
      return v;
    },

    collectItems: function () {
      var items = [];
      if (!document.body) return items;
      this._visCache = new Map();
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      var node, count = 0;
      while ((node = walker.nextNode())) {
        if (count >= MAX_NODES) break;
        var t = this.acceptTextNode(node);
        if (!t) continue;
        if (!this.isVisible(node.parentElement)) continue;
        items.push({ node: node, text: t });
        count++;
      }
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
        if (t) out.push({ node: nd, text: t });
        return;
      }
      if (nd.nodeType !== 1) return;
      if (nd.closest && nd.closest('[data-csb-ui],#cashskillbd-host,#cashskillbd-pt-host')) return;
      if (SKIP_TAGS.test(nd.tagName)) return;
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
      var provider = CSB.translate.currentProvider();
      var joined = texts.join('\n');
      var out = await provider.detectAndTranslate(joined, source, target);
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
      if (this.state === 'translating') return;
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
      this.state = 'translating';
      this.emitState();
      this.cancelRequested = false;
      this.pairs = [];
      this.renderBar('working');
      var items = this.prepareItems(this.collectItems());
      var total = items.length;
      if (!total) {
        this.state = 'idle';
        this.hideBar();
        this.toast('No translatable text found on this page');
        return;
      }
      var batches = this.makeBatches(items);
      var done = 0, self = this, bi = 0;
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
          } catch (e) { /* keep originals for this batch */ }
          done += batch.length;
          self.progress(done, total);
        }
      }
      var workers = [];
      for (var w = 0; w < 6; w++) workers.push(worker());
      await Promise.all(workers);
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
        this.toast('Translation failed — check your connection and try again');
      } else {
        this.state = 'translated';
        this.emitState();
        this.startObserver();
        this.renderBar('done');
        if (CSB.settings.get('notifications.translationCompleted', true)) {
          U.notify('CashSkillBD', 'Page translated to ' + CSB.translate.langName(target) + '.');
        }
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
        var items = self.prepareItems(batch);
        if (!items.length) return;
        var target = self.targetLang();
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
      var obs = new MutationObserver(function (muts) {
        if (self.state !== 'translated') return;
        muts.forEach(function (m) {
          if (m.type !== 'childList') return;
          Array.prototype.forEach.call(m.addedNodes, function (nd) {
            self.collectSubtree(nd, pending);
          });
        });
        if (pending.length && !timer) timer = setTimeout(flush, 1200);
      });
      try {
        obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
      } catch (e) { return; }
      this.observer = obs;
    },

    stopObserver: function () {
      if (this.observer) {
        try { this.observer.disconnect(); } catch (e) {}
        this.observer = null;
      }
    }
  };

  CSB.pageTranslate = pt;
})();
