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
    var count = 0;
    function walk(nd) {
      if (count >= 1500 || !nd) return;
      if (nd.nodeType === 3) {
        var t = accept(nd);
        if (t) {
          try {
            if (isVisible(nd.parentElement)) { items.push({ node: nd, text: t }); count++; }
          } catch (e) {}
        }
        return;
      }
      if (nd.nodeType !== 1 || SKIP.test(nd.tagName)) return;
      var ch = nd.firstChild;
      while (ch) { var nx = ch.nextSibling; walk(ch); ch = nx; }
      // Pierce open shadow roots — survey widgets often use them.
      try {
        if (nd.shadowRoot) {
          var sn = nd.shadowRoot.firstChild;
          while (sn) { var snx = sn.nextSibling; walk(sn); sn = snx; }
        }
      } catch (e2) {}
    }
    try { walk(document.body); } catch (e3) {}
    // Attributes: placeholders, alt text, titles, submit-button labels.
    try {
      var els = document.body.querySelectorAll(
        'input[placeholder],textarea[placeholder],[alt],[title],' +
        'input[type=submit][value],input[type=button][value],input[type=reset][value]');
      for (var i = 0; i < els.length && items.length < 1800; i++) {
        (function (el) {
          var attrs = ['placeholder', 'alt', 'title'];
          if (el.tagName === 'INPUT' && /^(submit|button|reset)$/i.test(el.type || '')) attrs.push('value');
          attrs.forEach(function (at) {
            var v = null;
            try { v = el.getAttribute(at); } catch (e) {}
            if (v && v.trim() && MEANINGFUL.test(v)) items.push({ el: el, attr: at, text: v });
          });
        })(els[i]);
      }
    } catch (e4) {}
    // <option> labels: no CSS boxes, collect explicitly.
    try {
      var opts = document.body.querySelectorAll('option');
      for (var oi = 0; oi < opts.length && items.length < 2000; oi++) {
        var opt = opts[oi];
        var tn = opt.firstChild;
        while (tn && tn.nodeType !== 3) tn = tn.nextSibling;
        if (!tn) continue;
        var ot = tn.nodeValue;
        if (!ot || !ot.trim() || !MEANINGFUL.test(ot)) continue;
        items.push({ node: tn, text: ot });
      }
    } catch (e5) {}
    return items;
  }

  function clean(t) { return String(t || '').replace(/[\r\n]+/g, ' ').trim(); }

  function applyItems(items, parts) {
    items.forEach(function (it, i) {
      var tr = parts[i];
      if (!tr || !tr.trim()) return;
      if (!it.done) {
        try {
          it.orig = it.node ? it.node.nodeValue : it.el.getAttribute(it.attr);
        } catch (e) { it.orig = ''; }
        it.done = true;
        st.pairs.push(it);
      }
      try {
        if (it.node) it.node.nodeValue = tr;
        else if (it.el) it.el.setAttribute(it.attr, tr);
      } catch (e2) {}
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
      try {
        if (it.node) it.node.nodeValue = it.orig;
        else if (it.el && it.orig != null) it.el.setAttribute(it.attr, it.orig);
      } catch (e) {}
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
    // Attributes on the added element itself.
    (function (el) {
      var attrs = ['placeholder', 'alt', 'title'];
      if (el.tagName === 'INPUT' && /^(submit|button|reset)$/i.test(el.type || '')) attrs.push('value');
      attrs.forEach(function (at) {
        var v = null;
        try { v = el.getAttribute(at); } catch (e) {}
        if (v && v.trim() && MEANINGFUL.test(v)) out.push({ el: el, attr: at, text: v });
      });
    })(nd);
    try {
      var walker = document.createTreeWalker(nd, NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = walker.nextNode())) {
        var t2 = accept(n);
        if (t2) out.push({ node: n, text: t2 });
      }
      // Attributes on descendants.
      var els = nd.querySelectorAll(
        'input[placeholder],textarea[placeholder],[alt],[title],' +
        'input[type=submit][value],input[type=button][value],input[type=reset][value]');
      for (var i = 0; i < els.length; i++) {
        (function (el) {
          var attrs = ['placeholder', 'alt', 'title'];
          if (el.tagName === 'INPUT' && /^(submit|button|reset)$/i.test(el.type || '')) attrs.push('value');
          attrs.forEach(function (at2) {
            var v2 = null;
            try { v2 = el.getAttribute(at2); } catch (e2) {}
            if (v2 && v2.trim() && MEANINGFUL.test(v2)) out.push({ el: el, attr: at2, text: v2 });
          });
        })(els[i]);
      }
      if (nd.shadowRoot) {
        var sn = nd.shadowRoot.firstChild;
        while (sn) { var snx = sn.nextSibling; collectSubtree(sn, out); sn = snx; }
      }
    } catch (e3) {}
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
            // Skip nodes/attrs we already translated.
            for (var i = 0; i < st.pairs.length; i++) {
              var p = st.pairs[i];
              if (it.node && p.node === it.node) return false;
              if (it.el && p.el === it.el && p.attr === it.attr) return false;
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

  function detectRemote(sample) {
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx' +
      '&sl=auto&tl=' + encodeURIComponent(st.target) +
      '&dt=t&q=' + encodeURIComponent(sample.slice(0, 500));
    return fetchJson(url).then(function (data) {
      var d = (data && data[2]) ? String(data[2]).toLowerCase().split(/[-_]/)[0] : null;
      return (d && d !== 'auto' && d !== 'und') ? d : null;
    }).catch(function () { return null; });
  }

  // Last-resort foreign check for Latin-script targets (script-agnostic
  // share of non-ASCII letters). Used when all detection fails.
  function foreignHeu(sample, target) {
    if (!/^(en|fr|de|es|it|pt|nl|sv|da|fi|no|nb|nn|is|pl|cs|sk|sl|hu|ro|hr|bs|ca|gl|eu|cy|ga|gd|mt|sq|sw|id|ms|vi|tl|mg|ny|st|sn|zu|xh|yo|ig|ha|so|su|jv|haw|la|eo|fy|co|ht|hmn|ceb|ku|tr|az|uz|tk|lv|lt|et)$/
      .test(String(target || '').toLowerCase())) return false;
    try {
      var letters = sample.match(/\p{L}/gu) || [];
      if (!letters.length) return false;
      var na = 0;
      for (var i = 0; i < letters.length; i++) {
        if (letters[i].codePointAt(0) > 127) na++;
      }
      return na / letters.length > 0.08;
    } catch (e) { return false; }
  }

  function maybeTranslate() {
    getSettings().then(function (s) {
      if (s) { st.target = s.target; st.auto = s.auto; }
      if (!st.auto) return;
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
      var target = st.target;
      function go(lang) {
        if (!lang || lang === 'auto' || lang === 'und' || lang === target) return;
        st.detected = lang;
        translateNow();
      }
      // 1. html lang attribute (verified — attributes are often wrong).
      if (htmlLang) {
        if (htmlLang === target) {
          if (!foreignHeu(sample, target)) return;
        } else {
          go(htmlLang);
          return;
        }
      }
      // 2. on-device CLD.
      detectLocal(sample).then(function (lang) {
        if (lang && lang !== target) { go(lang); return; }
        if (lang && lang === target) return;
        // 3. endpoint detection.
        detectRemote(sample).then(function (rlang) {
          if (rlang) { go(rlang); return; }
          // 4. last resort: looks foreign → translate with sl=auto.
          if (foreignHeu(sample, target)) { st.detected = 'auto'; translateNow(); }
        });
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
  // Follow live setting changes (target language / auto toggle).
  try {
    maybeTranslate();
    window.addEventListener('load', function () {
      setTimeout(function () { if (st.state === 'idle' && !st.detected) maybeTranslate(); }, 1500);
    });
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local' || !changes[STORE_KEY]) return;
        try {
          var d = changes[STORE_KEY].newValue || {};
          st.target = (d.translation && d.translation.targetLanguage) || 'en';
          st.auto = !(d.pageTranslate && d.pageTranslate.autoTranslate === false);
        } catch (e) {}
      });
    }
  } catch (e) {}
})();
