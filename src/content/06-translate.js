/* CashSkillBD — 06-translate.js : Google-Translate-style auto translation.
 *
 * Works like translate.google.com:
 *  - Source language dropdown with "Detect language" (auto)
 *  - Target language dropdown, ⇄ swap button
 *  - Translates AUTOMATICALLY as you type (debounced) — no button needed
 *  - Detected-language label, character count, copy button
 *
 * Provider architecture: each provider implements
 *   { id, name, detectAndTranslate(text, sourceLang, targetLang) -> { translated, detected } }
 * sourceLang 'auto' means auto-detect. Register new providers in
 * CSB.translate.providers and select one via Settings → Translation.
 */
'use strict';

(function () {
  var U = CSB.util;

  var LANG_NAMES = {
    af: 'Afrikaans', sq: 'Albanian', am: 'Amharic', ar: 'Arabic', hy: 'Armenian',
    az: 'Azerbaijani', eu: 'Basque', be: 'Belarusian', bn: 'Bangla', bs: 'Bosnian',
    bg: 'Bulgarian', ca: 'Catalan', ceb: 'Cebuano', zh: 'Chinese', 'zh-cn': 'Chinese (Simplified)',
    'zh-tw': 'Chinese (Traditional)', co: 'Corsican', hr: 'Croatian', cs: 'Czech',
    da: 'Danish', nl: 'Dutch', en: 'English', eo: 'Esperanto', et: 'Estonian',
    fi: 'Finnish', fr: 'French', fy: 'Frisian', gl: 'Galician', ka: 'Georgian',
    de: 'German', el: 'Greek', gu: 'Gujarati', ht: 'Haitian Creole', ha: 'Hausa',
    haw: 'Hawaiian', he: 'Hebrew', hi: 'Hindi', hmn: 'Hmong', hu: 'Hungarian',
    is: 'Icelandic', ig: 'Igbo', id: 'Indonesian', ga: 'Irish', it: 'Italian',
    ja: 'Japanese', jv: 'Javanese', kn: 'Kannada', kk: 'Kazakh', km: 'Khmer',
    ko: 'Korean', ku: 'Kurdish', ky: 'Kyrgyz', lo: 'Lao', la: 'Latin',
    lv: 'Latvian', lt: 'Lithuanian', lb: 'Luxembourgish', mk: 'Macedonian',
    mg: 'Malagasy', ms: 'Malay', ml: 'Malayalam', mt: 'Maltese', mi: 'Maori',
    mr: 'Marathi', mn: 'Mongolian', my: 'Myanmar', ne: 'Nepali', no: 'Norwegian',
    ny: 'Nyanja', or: 'Odia', ps: 'Pashto', fa: 'Persian', pl: 'Polish',
    pt: 'Portuguese', pa: 'Punjabi', ro: 'Romanian', ru: 'Russian', sm: 'Samoan',
    gd: 'Scots Gaelic', sr: 'Serbian', st: 'Sesotho', sn: 'Shona', sd: 'Sindhi',
    si: 'Sinhala', sk: 'Slovak', sl: 'Slovenian', so: 'Somali', es: 'Spanish',
    su: 'Sundanese', sw: 'Swahili', sv: 'Swedish', tl: 'Tagalog', tg: 'Tajik',
    ta: 'Tamil', te: 'Telugu', th: 'Thai', tr: 'Turkish', uk: 'Ukrainian',
    ur: 'Urdu', ug: 'Uyghur', uz: 'Uzbek', vi: 'Vietnamese', cy: 'Welsh',
    xh: 'Xhosa', yi: 'Yiddish', yo: 'Yoruba', zu: 'Zulu', auto: 'Auto'
  };

  /** Split long text into chunks the endpoint can handle (URL length limits). */
  function chunkText(text, maxLen) {
    maxLen = maxLen || 1500;
    if (text.length <= maxLen) return [text];
    var chunks = [];
    var parts = text.split(/(?<=[.!?।\n])\s+/);
    var cur = '';
    parts.forEach(function (p) {
      if ((cur + ' ' + p).length > maxLen && cur) { chunks.push(cur); cur = p; }
      else cur = cur ? cur + ' ' + p : p;
    });
    if (cur) chunks.push(cur);
    var out = [];
    chunks.forEach(function (c) {
      while (c.length > maxLen) { out.push(c.slice(0, maxLen)); c = c.slice(maxLen); }
      if (c) out.push(c);
    });
    return out;
  }

  function langCodes() {
    return Object.keys(LANG_NAMES)
      .filter(function (c) { return c !== 'auto'; })
      .sort(function (a, b) { return LANG_NAMES[a].localeCompare(LANG_NAMES[b]); });
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /** Direct fetch of a JSON translation endpoint. */
  async function fetchDirect(url) {
    var res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  /** Same request proxied through the service worker (not bound by the page CSP). */
  async function fetchViaSW(url) {
    var sw = await new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage({ type: 'CSB_FETCH', url: url }, function (r) { resolve(r); });
      } catch (e2) { resolve(null); }
    });
    if (!sw || !sw.ok) {
      var detail = sw && (sw.error || sw.status) ? ' (' + (sw.error || ('HTTP ' + sw.status)) + ')' : '';
      throw new Error('network unreachable' + detail);
    }
    try {
      return JSON.parse(sw.text);
    } catch (e3) {
      throw new Error('invalid response data');
    }
  }

  /** Fetch JSON directly; on network/CSP failure retry through the service
   * worker (which is not CSP-bound). Retries once with jittered backoff —
   * this handles 429 rate limits and transient failures. Throws a short,
   * diagnosable message like "HTTP 429" or "network unreachable". */
  async function fetchJson(url) {
    var lastErr = null;
    for (var attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(600 + Math.random() * 900);
      try {
        return await fetchDirect(url);
      } catch (e) {
        lastErr = e;
        var isHttp = /^HTTP \d+/.test((e && e.message) || '');
        if (!isHttp) {
          try {
            return await fetchViaSW(url);
          } catch (e2) {
            lastErr = e2;
          }
        }
      }
    }
    throw lastErr || new Error('request failed');
  }

  /** Backup translation via MyMemory (api.mymemory.translated.net).
   * Used automatically for full-page translation when the Google endpoint is
   * unreachable (network block / rate limit). 400-char chunks — their
   * per-request limit is 500. Returns the same newline-split array shape as
   * the Google batch path. */
  async function translateBatchMyMemory(text, from, to) {
    // 6-3: MyMemory rejects langpair=auto|X — fall back to English source.
    var src = (from === 'auto' || !from) ? 'en' : from;
    var chunks = chunkText(text, 400);
    var out = [];
    for (var i = 0; i < chunks.length; i++) {
      var url = 'https://api.mymemory.translated.net/get?' +
        'q=' + encodeURIComponent(chunks[i]) +
        '&langpair=' + encodeURIComponent(src + '|' + to);
      var json = await fetchJson(url);
      var status = json && json.responseStatus;
      var translated = json && json.responseData && json.responseData.translatedText;
      if (status === 429 || (typeof translated === 'string' && /MYMEMORY WARNING/i.test(translated))) {
        throw new Error('backup daily limit reached');
      }
      if (status !== 200 || typeof translated !== 'string') {
        throw new Error('backup service error' + (status ? ' (HTTP ' + status + ')' : ''));
      }
      var parts = translated.split('\n');
      for (var j = 0; j < parts.length; j++) out.push(parts[j]);
    }
    return out;
  }

  var googleProvider = {
    id: 'google',
    name: 'Google Translate (free endpoint)',
    disclosesExternalUse: true,
    detectAndTranslate: async function (text, sourceLang, targetLang) {
      var sl = sourceLang && sourceLang !== 'auto' ? sourceLang : 'auto';
      var chunks = chunkText(text);
      var translatedParts = [];
      var detected = sl === 'auto' ? 'auto' : sl;
      for (var i = 0; i < chunks.length; i++) {
        var url = 'https://translate.googleapis.com/translate_a/single?client=gtx' +
          '&sl=' + encodeURIComponent(sl) + '&tl=' + encodeURIComponent(targetLang) +
          '&dt=t&q=' + encodeURIComponent(chunks[i]);
        var data = await fetchJson(url);
        if (!Array.isArray(data) || !Array.isArray(data[0])) {
          throw new Error('Unexpected translation response');
        }
        translatedParts.push(data[0].map(function (seg) { return seg[0] || ''; }).join(''));
        if (data[2]) detected = String(data[2]).toLowerCase();
      }
      // 6-2: join chunks without inserting spaces — spaceless scripts
      // (Chinese/Japanese/Thai) would get corrupted otherwise.
      return { translated: translatedParts.join(''), detected: detected };
    }
  };

  var translate = {
    state: 'READY', // READY | TRANSLATING | RESULT | ERROR
    providers: { google: googleProvider },
    LANG_NAMES: LANG_NAMES,
    runId: 0,
    ui: null,
    debouncedRun: null,
    /** Backup batch translator (MyMemory) — used by full-page translation
     * when the Google endpoint is unreachable. */
    translateBatchMyMemory: translateBatchMyMemory,

    langName: function (code) {
      code = String(code || '').toLowerCase();
      return LANG_NAMES[code] || (code ? code.toUpperCase() : 'Unknown');
    },

    currentProvider: function () {
      var id = CSB.settings.get('translation.provider', 'google');
      return this.providers[id] || this.providers.google;
    },

    sourceLang: function () {
      return CSB.settings.get('translation.sourceLanguage',
        CSB.settings.get('translation.autoDetect', true) ? 'auto' : 'en');
    },

    targetLang: function () {
      return CSB.settings.get('translation.targetLanguage', 'en');
    },

    run: async function () {
      if (!this.ui) return;
      var myRun = ++this.runId;
      var input = this.ui.input.value.trim();
      if (!input) {
        this.ui.result.textContent = '';
        this.ui.detectedWrap.style.display = 'none';
        this.setStatus('', 'Ready');
        this.state = 'READY';
        return;
      }
      var source = this.sourceLang();
      var target = this.targetLang();
      if (source === target) {
        this.ui.result.textContent = input;
        this.ui.detectedWrap.style.display = 'none';
        this.setStatus('ok', 'Source and target languages are the same.');
        this.state = 'RESULT';
        return;
      }
      var provider = this.currentProvider();
      this.state = 'TRANSLATING';
      this.setStatus('busy', 'Translating…');
      try {
        var out = await provider.detectAndTranslate(input, source, target);
        if (myRun !== this.runId) return; // superseded by newer input
        var detectedName = this.langName(out.detected);
        if (source === 'auto') {
          this.ui.detected.textContent = detectedName;
          this.ui.detectedWrap.style.display = '';
        } else {
          this.ui.detectedWrap.style.display = 'none';
        }
        this.ui.result.textContent = out.translated || '(empty result)';
        this.setStatus('ok', 'Translated' + (source === 'auto' ? ' from ' + detectedName : '') + '.');
        this.state = 'RESULT';
        if (CSB.settings.get('notifications.translationCompleted', true)) {
          U.notify('CashSkillBD', 'Translation completed.');
        }
      } catch (e) {
        if (myRun !== this.runId) return;
        this.state = 'ERROR';
        this.setStatus('err', 'Translation failed. Please try again.' + (e && e.message ? ' (' + e.message + ')' : ''));
      }
    },

    onInput: function () {
      if (!this.ui) return;
      this.ui.charCount.textContent = this.ui.input.value.length + ' / 5000';
      if (this.debouncedRun) this.debouncedRun();
    },

    swap: function () {
      if (!this.ui || this.ui.srcSel.value === 'auto') return;
      var oldSource = this.ui.srcSel.value;
      var oldTarget = this.ui.tgtSel.value;
      this.ui.srcSel.value = oldTarget;
      this.ui.tgtSel.value = oldSource;
      CSB.settings.set('translation.sourceLanguage', oldTarget);
      CSB.settings.set('translation.targetLanguage', oldSource);
      // Move the translation into the source box, like Google Translate.
      // 6-4: don't copy the '(empty result)' placeholder into the input.
      var resText = this.ui.result.textContent.trim();
      if (resText && resText !== '(empty result)') this.ui.input.value = resText.slice(0, 5000);
      this.ui.charCount.textContent = this.ui.input.value.length + ' / 5000';
      this.syncSwap();
      this.run();
    },

    syncSwap: function () {
      if (this.ui && this.ui.swapBtn) {
        this.ui.swapBtn.disabled = (this.ui.srcSel.value === 'auto');
      }
    },

    useSelection: async function () {
      var self = this;
      var sel = '';
      // The translate UI lives in the side panel; the page's selection must
      // be read from the tab via the bus (6-1). Fall back to the local
      // selection for contexts where the bus is unavailable.
      try {
        if (CSB.bus && CSB.bus.cmd) {
          var r = await CSB.bus.cmd('selection.get');
          sel = (r && r.text) || '';
        } else {
          sel = window.getSelection().toString();
        }
      } catch (e) {
        try { sel = window.getSelection().toString(); } catch (e2) {}
      }
      if (sel && sel.trim()) {
        self.ui.input.value = sel.trim().slice(0, 5000);
        self.onInput();
      } else {
        self.setStatus('err', 'No text is selected on the page.');
      }
    },

    copyResult: async function () {
      var text = this.ui ? this.ui.result.textContent : '';
      if (!text) { this.setStatus('err', 'Nothing to copy yet.'); return; }
      try {
        await navigator.clipboard.writeText(text);
        CSB.panel.toast('Translation copied');
      } catch (e) {
        this.setStatus('err', 'Clipboard access is unavailable.');
      }
    },

    setStatus: function (kind, msg) {
      if (!this.ui) return;
      this.ui.status.className = 'csb-status' + (kind ? ' csb-' + kind : '');
      this.ui.status.innerHTML =
        (kind === 'busy' ? '<span class="csb-spinner"></span>' : '<span class="csb-dot"></span>') +
        '<span>' + U.esc(msg) + '</span>';
    }
  };

  CSB.translate = translate;

  /* ---------------- UI ---------------- */
  CSB.translateUI = {
    build: function (pane) {
      var U2 = CSB.util;
      pane.appendChild(U2.el('div', 'csb-title', '🌐 Translate'));

      // ---- This page (full-website translation) ----
      (function pageCard() {
        var card = U2.el('div', 'csb-card');
        card.innerHTML =
          '<h3>🌐 This page</h3>' +
          '<div class="csb-hint" id="csb-tr-pageinfo" style="margin-bottom:10px">—</div>' +
          '<div class="csb-row">' +
            '<button class="csb-btn csb-btn-primary csb-btn-sm" id="csb-tr-pagego" type="button">Translate page</button>' +
            '<button class="csb-btn csb-btn-ghost csb-btn-sm" id="csb-tr-pagerestore" type="button">Show original</button>' +
          '</div>';
        pane.appendChild(card);
        var info = card.querySelector('#csb-tr-pageinfo');
        var go = card.querySelector('#csb-tr-pagego');
        var rs = card.querySelector('#csb-tr-pagerestore');
        function refresh() {
          var ptx = CSB.pageTranslate;
          if (ptx.detectedLang) {
            info.textContent = 'Detected: ' + CSB.translate.langName(ptx.detectedLang) +
              ' → ' + CSB.translate.langName(ptx.targetLang());
          } else {
            info.textContent = 'No foreign language detected on this page.';
          }
          go.disabled = (ptx.state === 'translating' || ptx.state === 'translated');
          rs.disabled = (ptx.state !== 'translated');
        }
        go.addEventListener('click', function () {
          CSB.pageTranslate.translatePage().then(refresh, refresh);
          setTimeout(refresh, 300);
        });
        rs.addEventListener('click', function () { CSB.pageTranslate.restorePage(); refresh(); });
        refresh();
        card._csbRefresh = refresh;
      })();

      var card = U2.el('div', 'csb-card');
      card.innerHTML =
        '<div class="csb-tr-langbar">' +
          '<select class="csb-select" id="csb-tr-src" aria-label="Source language"></select>' +
          '<button class="csb-tr-swap" id="csb-tr-swap" type="button" title="Swap languages" aria-label="Swap source and target languages">⇄</button>' +
          '<select class="csb-select" id="csb-tr-tgt" aria-label="Target language"></select>' +
        '</div>' +
        '<textarea class="csb-textarea" id="csb-tr-input" style="min-height:110px" maxlength="5000" placeholder="Enter text…" aria-label="Text to translate"></textarea>' +
        '<div class="csb-tr-meta">' +
          '<button class="csb-btn csb-btn-ghost csb-btn-sm" id="csb-tr-sel" type="button">Use selected text</button>' +
          '<span id="csb-tr-count">0 / 5000</span>' +
        '</div>' +
        '<div class="csb-hint" id="csb-tr-detected-wrap" style="display:none;margin-top:6px">Detected: <b id="csb-tr-detected">—</b></div>' +
        '<div class="csb-result" id="csb-tr-result" aria-live="polite" style="margin-top:12px"></div>' +
        '<div class="csb-row" style="margin-top:10px">' +
          '<button class="csb-btn csb-btn-ghost csb-btn-sm" id="csb-tr-copy" type="button">COPY</button>' +
        '</div>' +
        '<div class="csb-status" id="csb-tr-status"><span class="csb-dot"></span><span>Ready</span></div>';
      pane.appendChild(card);

      var q = function (sel) { return card.querySelector(sel); };
      var srcSel = q('#csb-tr-src'), tgtSel = q('#csb-tr-tgt');
      var dopt = document.createElement('option');
      dopt.value = 'auto';
      dopt.textContent = 'Detect language';
      srcSel.appendChild(dopt);
      langCodes().forEach(function (c) {
        var o1 = document.createElement('option');
        o1.value = c; o1.textContent = LANG_NAMES[c];
        var o2 = document.createElement('option');
        o2.value = c; o2.textContent = LANG_NAMES[c];
        srcSel.appendChild(o1);
        tgtSel.appendChild(o2);
      });
      srcSel.value = translate.sourceLang();
      tgtSel.value = translate.targetLang();

      translate.ui = {
        input: q('#csb-tr-input'),
        srcSel: srcSel,
        tgtSel: tgtSel,
        swapBtn: q('#csb-tr-swap'),
        copyBtn: q('#csb-tr-copy'),
        status: q('#csb-tr-status'),
        result: q('#csb-tr-result'),
        detected: q('#csb-tr-detected'),
        detectedWrap: q('#csb-tr-detected-wrap'),
        charCount: q('#csb-tr-count')
      };
      translate.debouncedRun = U2.debounce(function () { translate.run(); }, 600);

      srcSel.addEventListener('change', function () {
        CSB.settings.set('translation.sourceLanguage', srcSel.value);
        translate.syncSwap();
        translate.run();
      });
      tgtSel.addEventListener('change', function () {
        CSB.settings.set('translation.targetLanguage', tgtSel.value);
        translate.run();
      });
      q('#csb-tr-swap').addEventListener('click', function () { translate.swap(); });
      q('#csb-tr-sel').addEventListener('click', function () { translate.useSelection(); });
      q('#csb-tr-copy').addEventListener('click', function () { translate.copyResult(); });
      translate.ui.input.addEventListener('input', function () { translate.onInput(); });

      if (!CSB.settings.get('translation.showCopyButton', true)) {
        translate.ui.copyBtn.style.display = 'none';
      }
      translate.syncSwap();

      var note = U2.el('p', 'csb-hint',
        'Type and the translation appears automatically — just like Google Translate. ' +
        'Text you translate is sent to the selected provider (Settings → Translation).');
      pane.appendChild(note);
    }
  };
})();
