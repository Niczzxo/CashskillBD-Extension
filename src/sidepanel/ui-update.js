/* CashSkillBD — forced update gate.
 *
 * When a newer release exists, the whole panel is blocked until the user
 * updates — no tool works on an outdated build. The check runs when the
 * panel opens (network call throttled to once an hour; a fresh cached
 * result is enforced instantly). A failed check never locks — offline
 * keeps the last known state.
 *
 * The service worker also refreshes the `csb_update` flag periodically so
 * content-script auto features (page auto-translate) are gated too.
 */
(function () {
  'use strict';

  var STORE_KEY = 'csb_update';
  var CHECK_TTL = 3600 * 1000;        // network re-check at most once an hour
  var ENFORCE_TTL = 24 * 3600 * 1000; // ignore cached flags older than a day

  var overlay = null;

  function cmp(a, b) {
    var pa = String(a || '').split('.').map(function (x) { return parseInt(x, 10) || 0; });
    var pb = String(b || '').split('.').map(function (x) { return parseInt(x, 10) || 0; });
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var d = (pa[i] || 0) - (pb[i] || 0);
      if (d !== 0) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function curVersion() {
    try { return chrome.runtime.getManifest().version; } catch (e) { return ''; }
  }

  function repo() {
    try {
      var r = String(CSB.settings.get('updates.repo', '') || '').trim();
      if (r && r.split('/').length === 2) return r;
    } catch (e) {}
    return 'Niczzxo/CashskillBD-Extension';
  }

  function getFlag() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(STORE_KEY, function (r) { resolve((r && r[STORE_KEY]) || null); });
      } catch (e) { resolve(null); }
    });
  }

  function setFlag(latest) {
    try {
      var o = {};
      o[STORE_KEY] = { latest: latest, checkedAt: Date.now() };
      chrome.storage.local.set(o, function () {});
    } catch (e) {}
  }

  function clearFlag() {
    try { chrome.storage.local.remove(STORE_KEY, function () {}); } catch (e) {}
  }

  function build() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'csb-update-gate';
    overlay.setAttribute('style',
      'position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;' +
      'background:#0c0c11;padding:24px;box-sizing:border-box;');
    overlay.innerHTML =
      '<div style="width:100%;max-width:340px;text-align:center;">' +
      '<div style="font-size:44px;margin-bottom:12px;">🔄</div>' +
      '<div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:6px;font-family:inherit;">Update আবশ্যক</div>' +
      '<div id="csb-update-text" style="font-size:13px;color:#fff;opacity:.7;margin-bottom:18px;line-height:1.7;font-family:inherit;"></div>' +
      '<a id="csb-update-link" href="#" target="_blank" rel="noopener" ' +
      'style="display:block;width:100%;box-sizing:border-box;padding:12px;border-radius:10px;font-size:15px;font-weight:700;' +
      'background:linear-gradient(135deg,#e11d48,#f59e0b);color:#fff;text-decoration:none;font-family:inherit;">Download update</a>' +
      '<div style="font-size:12px;margin-top:12px;opacity:.5;color:#fff;line-height:1.7;font-family:inherit;">' +
      'Zip download করে extract করো,<br>তারপর chrome://extensions-এ Reload চাপ দাও।<br>' +
      'Update না করা পর্যন্ত extension ব্যবহার করা যাবে না।<br>Developed by RIYAZUL ISLAM</div>' +
      '</div>';
    // No dismiss — this gate is mandatory. Clicks outside do nothing.
    overlay.addEventListener('click', function (ev) { ev.stopPropagation(); }, true);
    document.body.appendChild(overlay);
  }

  function show(latest, cur, url) {
    build();
    var t = document.getElementById('csb-update-text');
    if (t) t.innerHTML = 'নতুন version <b>v' + esc(latest) + '</b> এসেছে<br>(তোমার version v' + esc(cur) + ')।';
    var a = document.getElementById('csb-update-link');
    if (a && url) a.href = url;
    overlay.style.display = 'flex';
  }

  function hide() {
    if (overlay) overlay.style.display = 'none';
  }

  /** Check for updates and enforce the gate. Never locks on failure. */
  async function check() {
    var cur = curVersion();
    if (!cur) return;
    var now = Date.now();
    // 1. Enforce a fresh cached flag instantly (no network needed).
    try {
      var flag = await getFlag();
      if (flag && flag.latest && (now - (flag.checkedAt || 0)) < ENFORCE_TTL) {
        if (cmp(flag.latest, cur) > 0) { show(flag.latest, cur); return; }
        if ((now - (flag.checkedAt || 0)) < CHECK_TTL) { hide(); return; }
      }
    } catch (e) {}
    // 2. Network check (throttled by the cached flag above).
    try {
      if (!CSB.settingsUI || !CSB.settingsUI.fetchLatestRelease) return;
      var rel = await CSB.settingsUI.fetchLatestRelease(repo());
      var latest = rel && rel.version;
      if (!latest) { hide(); return; }
      if (cmp(latest, cur) > 0) {
        setFlag(latest);
        show(latest, cur, rel.url);
      } else {
        clearFlag();
        hide();
      }
    } catch (e) { hide(); } // offline / API hiccup: never lock
  }

  (window.CSB = window.CSB || {}).updateGate = {
    check: check,
    show: show,
    hide: hide,
    compare: cmp
  };

  // Safety net: panel.js also triggers via settingsUI.autoCheck (2s after
  // boot). This covers panels where that path is skipped.
  function init() {
    setTimeout(function () { try { check(); } catch (e) {} }, 3000);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
