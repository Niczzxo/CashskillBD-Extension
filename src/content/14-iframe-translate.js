/* CashSkillBD — 14-iframe-translate.js : page translation inside iframes.
 *
 * The main bundle runs with all_frames:false (top frame only), so survey /
 * offer-wall content loaded in cross-origin iframes (e.g. CPX Research) was
 * never detected or translated. This tiny self-contained bundle runs with
 * all_frames:true and bails out in the top frame; every sub-frame detects
 * the language of its OWN document and auto-translates it silently (no bar
 * — the top frame owns the UI). It also answers the pt.go / pt.restore bus
 * commands so the panel's "Translate page" / "Show original" cover iframe
 * content too.
 *
 * No dependency on the rest of the CSB stack: settings are read directly
 * from chrome.storage, translation goes through the Google free endpoint
 * (direct fetch, service-worker fallback).
 */
'use strict';

(function () {
  // Top frame is owned by the full engine (11-page-translate.js).
  try {
    if (window.self === window.top) return;
  } catch (e) {
    return;
  }

  var STORE_KEY = 'cashskillbd.settings.v1';
  var SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CODE|PRE|KBD|SAMP|VAR|IFRAME|CANVAS)$/;
  var MEANINGFUL = /[^\d\s\p{P}\p{S}]/u;

  var st = {
    target: 'en',
    auto: true,
    detected: null,
    state: 'idle', // idle | translating | translated
    pairs: [],     // {node, orig}
    observer: null,
    _tries: 0
  };

  function esc(s) { return String(s == null ? '' : s); }

  function getSettings() {
    return new Promise(function (resolve) {
      var done = false;
      function fin(v) { if (!done) { done = true; resolve(v); } }
      try {
        var timer = setTimeout(function () { fin(null); }, 4000);
        chrome.storage.local.get(STORE_KEY, function (res) {
          clearTimeout(timer);
          try {
            var d = (res && res[STORE_KEY]) || {};
            fin({
              target: (d.translation && d.translation.targetLanguage) || 'en',
              auto: !(d.pageTranslate && d.pageTranslate.autoTranslate === false)
            });
          } catch (e) { fin(null); }
        });
      } catch (e) { fin(null); }
    });
  }

  function fetchJson(url) {
    function direct() {
      return new Promise(function (resolve, reject) {
        var ctrl = null, timer = null;
        try {
          if (typeof AbortController !== 'undefined') {
            ctrl = new AbortController();
            timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 25000);
          }
          fetch(url, { method: 'GET', signal: ctrl ? ctrl.signal : undefined })
            .then(function (res) {
              if (timer) clearTimeout(timer);
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.json();
            })
            .then(resolve, function (e) {
              if (timer) clearTimeout(timer);
              reject(e && e.name === 'AbortError' ? new Error('request timed out') : e);
            });
        } catch (e) {
          if (timer) clearTimeout(timer);
          reject(e);
        }
      });
    }
    function viaSW() {
      return new Promise(function (resolve, reject) {
        try {
          chrome.runtime.sendMessage({ type: 'CSB_FETCH', url: url }, function (r) {
            if (r && r.ok) {
              try { resolve(JSON.parse(r.text)); }
              catch (e) { reject(new Error('invalid response data')); }
            } else {
              reject(new Error('network unreachable' + (r && (r.error || r.status) ? ' (' + (r.error || r.status) + ')' : '')));
            }
          });
        } catch (e) { reject(e); }
      });
    }
    return direct().catch(function () { return viaSW(); });
  }

  function gTranslate(texts, target) {
    var joined = texts.join('\n');
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx' +
      '&sl=auto&tl=' + encodeURIComponent(target) +
      '&dt=t&q=' + encodeURIComponent(joined);
    return fetchJson(url).then(function (data) {
      if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('Unexpected translation response');
      var full = data[0].map(function (seg) { return seg[0] || ''; }).join('');
      var parts = String(full).split('\n');
      var detected = data[2] ? String(data[2]).toLowerCase().split(/[-_]/)[0] : null;
      if (parts.length !== texts.length) {
        // Fall back to one request per text.
        return Promise.all(texts.map(function (t) {
          return gTranslate([t], target).then(function (r) { return r.parts[0] || ''; });
        })).then(function (ps) { return { parts: ps, detected: detected }; });
      }
      return { parts: parts, detected: detected };
    });
  }

  function sampleText() {
    try {
      return (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
    } catch (e) { return ''; }
  }

  function isVisible(el) {
    try {
      if (el.checkVisibility) {
        return el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: false, checkSelectable: false });
      }
      for (var n = el; n && n !== document.documentElement; n = n.parentElement) {
        var cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      }
      return true;
    } catch (e) { return true; }
  }

  function accept(node) {
    var p = node.parentElement;
    if (!p || SKIP.test(p.tagName)) return null;
    if (p.isContentEditable) return null;
    var t = node.nodeValue;
    if (!t || !t.trim() || !MEANINGFUL.test(t)) return null;
    return t;
  }

  function collect() {
    var items = [];
    if (!document.body) return items;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node, count = 0;
    while ((node = walker.nextNode())) {
      if (count >= 1500) break;
      var t = accept(node);
      if (!t) continue;
      if (!isVisible(node.parentElement)) continue;
      items.push({ node: node, text: t });
      count++;
    }
    return items;
  }

  function clean(t) { return String(t || '').replace(/[\r\n]+/g, ' ').trim(); }

  function applyItems(items, parts) {
    items.forEach(function (it, i) {
      var tr = parts[i];
      if (!tr || !tr.trim()) return;
      if (!it.done) {
        it.orig = it.node.nodeValue;
        it.done = true;
        st.pairs.push(it);
      }
      try { it.node.nodeValue = tr; } catch (e) {}
    });
  }

  function translateNow() {
    if (st.state === 'translating') return Promise.resolve();
    st.state = 'translating';
    var items = collect().filter(function (it) {
      var c = clean(it.text);
      if (!c || !MEANINGFUL.test(c)) return false;
      it.clean = c;
      return true;
    });
    if (!items.length) {
      st.state = 'idle';
      return Promise.resolve();
    }
    // Batch: 25 texts / ~1400 chars per request.
    var batches = [], cur = [], len = 0;
    items.forEach(function (it) {
      if (cur.length >= 25 || len + it.clean.length + 1 > 1400) { batches.push(cur); cur = []; len = 0; }
      cur.push(it); len += it.clean.length + 1;
    });
    if (cur.length) batches.push(cur);
    var bi = 0;
    function worker() {
      if (bi >= batches.length) return Promise.resolve();
      var b = batches[bi++];
      return gTranslate(b.map(function (x) { return x.clean; }), st.target).then(function (r) {
        applyItems(b, r.parts);
        if (!st.detected && r.detected && r.detected !== st.target) st.detected = r.detected;
      }).catch(function () {}).then(worker);
    }
    return Promise.all([worker(), worker(), worker(), worker()]).then(function () {
      st.state = st.pairs.length ? 'translated' : 'idle';
      if (st.state === 'translated') startObserver();
    });
  }

  function restore() {
    st.pairs.forEach(function (it) {
      try { it.node.nodeValue = it.orig; } catch (e) {}
    });
    st.pairs = [];
    st.state = 'idle';
    st.detected = null;
    stopObserver();
  }

  function collectSubtree(nd, out) {
    if (nd.nodeType === 3) {
      var t = accept(nd);
      if (t && isVisible(nd.parentElement)) out.push({ node: nd, text: t });
      return;
    }
    if (nd.nodeType !== 1 || SKIP.test(nd.tagName)) return;
    try {
      var walker = document.createTreeWalker(nd, NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = walker.nextNode())) {
        var t2 = accept(n);
        if (t2) out.push({ node: n, text: t2 });
      }
    } catch (e) {}
  }

  function startObserver() {
    stopObserver();
    var pending = [], timer = null;
    var obs = new MutationObserver(function (muts) {
      if (st.state !== 'translated') return;
      muts.forEach(function (m) {
        if (m.type !== 'childList') return;
        Array.prototype.forEach.call(m.addedNodes, function (nd) { collectSubtree(nd, pending); });
      });
      if (pending.length && !timer) {
        timer = setTimeout(function () {
          timer = null;
          var batch = pending; pending = [];
          var items = batch.filter(function (it) {
            var c = clean(it.text);
            if (!c || !MEANINGFUL.test(c)) return false;
            it.clean = c;
            // Skip nodes we already translated.
            for (var i = 0; i < st.pairs.length; i++) {
              if (st.pairs[i].node === it.node) return false;
            }
            return true;
          });
          if (!items.length || st.state !== 'translated') return;
          var bs = [], c2 = [], l2 = 0;
          items.forEach(function (it) {
            if (c2.length >= 25 || l2 + it.clean.length + 1 > 1400) { bs.push(c2); c2 = []; l2 = 0; }
            c2.push(it); l2 += it.clean.length + 1;
          });
          if (c2.length) bs.push(c2);
          (function next(i) {
            if (i >= bs.length || st.state !== 'translated') return;
            gTranslate(bs[i].map(function (x) { return x.clean; }), st.target).then(function (r) {
              applyItems(bs[i], r.parts);
            }).catch(function () {}).then(function () { next(i + 1); });
          })(0);
        }, 1200);
      }
    });
    try {
      obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
      st.observer = obs;
    } catch (e) {}
  }

  function stopObserver() {
    if (st.observer) { try { st.observer.disconnect(); } catch (e) {} st.observer = null; }
  }

  function detectLocal(sample) {
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
            if (top && top.language && (top.percentage || 0) >= 40) {
              fin(String(top.language).toLowerCase().split(/[-_]/)[0]);
            } else fin(null);
          } catch (e) { fin(null); }
        });
      } catch (e) { fin(null); }
    });
  }

  function maybeTranslate() {
    getSettings().then(function (s) {
      if (s) { st.target = s.target; st.auto = s.auto; }
      if (!st.auto) return;
      // Never-translate hosts are owned by the top frame; iframes follow the
      // global auto setting.
      var sample = sampleText();
      if (sample.length < 40) {
        if (st._tries < 6) {
          st._tries++;
          setTimeout(maybeTranslate, 2500);
        }
        return;
      }
      var htmlLang = '';
      try {
        htmlLang = (document.documentElement.getAttribute('lang') || '').toLowerCase().split(/[-_]/)[0];
      } catch (e) {}
      if (htmlLang && htmlLang === st.target) return;
      function go(lang) {
        if (!lang || lang === 'auto' || lang === 'und' || lang === st.target) return;
        st.detected = lang;
        translateNow();
      }
      if (htmlLang) { go(htmlLang); return; }
      detectLocal(sample).then(function (lang) {
        if (lang) go(lang);
        // No endpoint fallback here: keep the iframe bundle light; the top
        // frame's engine covers detection failures via the panel button.
      });
    });
  }

  // Bus: answer pt.go / pt.restore (broadcast reaches every frame).
  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (!msg || msg.type !== 'CSB_BUS') return false;
      if (msg.cmd === 'pt.go') {
        getSettings().then(function (s) {
          if (s) st.target = s.target;
          translateNow().then(function () {
            try { sendResponse({ ok: true, data: { state: st.state } }); } catch (e) {}
          });
        });
        return true;
      }
      if (msg.cmd === 'pt.restore') {
        try { restore(); } catch (e) {}
        try { sendResponse({ ok: true, data: {} }); } catch (e2) {}
        return false;
      }
      return false;
    });
  } catch (e) {}

  // Boot after settings; re-check once when the document fully loads.
  try {
    maybeTranslate();
    window.addEventListener('load', function () {
      setTimeout(function () { if (st.state === 'idle' && !st.detected) maybeTranslate(); }, 1500);
    });
  } catch (e) {}
})();
