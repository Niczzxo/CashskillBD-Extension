/* CashSkillBD — license client (per-member keys).
 *
 * Key model: each member gets a unique key like CSB-7KQ2-9MZX-4PWR-8TND.
 * Only the SHA-256 hash of each key is stored server-side (private repo
 * Niczzxo/CashskillBD-Licenses, licenses.json). The extension hashes the
 * member's key locally and checks membership — the raw key is never sent
 * anywhere, and hashes cannot be reversed into keys.
 *
 * Revoking a key (admin removes it / sets revoked:true in the registry)
 * locks that member's extension on the next validation (browser start +
 * every 6 hours). Offline keeps the last known status — nobody gets locked
 * out by a network blip.
 *
 * Usable from extension pages (panel) via <script> and from the service
 * worker via importScripts. Exposes `CSBLicense`.
 */
(function (root) {
  'use strict';

  var STORE_KEY = 'csb_license';
  var KEY_RE = /^CSB-[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/;

  function cfg() {
    return root.CSB_LICENSE_CONFIG || {};
  }

  function storage() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return chrome.storage.local;
      }
    } catch (e) {}
    return null;
  }

  function sha256Hex(str) {
    var data = new TextEncoder().encode(str);
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {
      var bytes = new Uint8Array(buf);
      var out = '';
      for (var i = 0; i < bytes.length; i++) {
        out += ('0' + bytes[i].toString(16)).slice(-2);
      }
      return out;
    });
  }

  function b64ToText(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function tokenOk(tok) {
    return !!(tok && !/REPLACE|PLACEHOLDER/.test(tok) && tok.length > 10);
  }

  async function fetchRegistry() {
    var c = cfg();
    if (!tokenOk(c.readToken)) throw new Error('license-not-configured');
    var url = (c.apiUrl || '') + '?ref=' + encodeURIComponent(c.branch || 'main') +
      '&t=' + Date.now(); // cache-buster: revocations take effect fast
    var res = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + c.readToken
      }
    });
    if (!res.ok) throw new Error('license-fetch-' + res.status);
    var data = await res.json();
    if (!data || !data.content) throw new Error('license-bad-registry');
    var reg = JSON.parse(b64ToText(data.content));
    if (!reg || typeof reg !== 'object' || !reg.keys || typeof reg.keys !== 'object') {
      throw new Error('license-bad-registry');
    }
    return reg;
  }

  function getStored() {
    return new Promise(function (resolve) {
      var s = storage();
      if (!s) return resolve(null);
      try {
        s.get(STORE_KEY, function (r) { resolve((r && r[STORE_KEY]) || null); });
      } catch (e) { resolve(null); }
    });
  }

  function setStored(obj) {
    return new Promise(function (resolve) {
      var s = storage();
      if (!s) return resolve();
      try {
        var o = {};
        o[STORE_KEY] = obj;
        s.set(o, function () { resolve(); });
      } catch (e) { resolve(); }
    });
  }

  /** Validate + store a member key. Returns {ok, reason?}. */
  async function activate(rawKey) {
    var key = String(rawKey || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!KEY_RE.test(key)) return { ok: false, reason: 'format' };
    var hash;
    try {
      hash = await sha256Hex(key);
    } catch (e) {
      return { ok: false, reason: 'crypto' };
    }
    var reg;
    try {
      reg = await fetchRegistry();
    } catch (e) {
      return { ok: false, reason: 'network' };
    }
    var entry = reg.keys[hash];
    if (!entry) return { ok: false, reason: 'unknown' };
    if (entry.revoked) return { ok: false, reason: 'revoked' };
    await setStored({ hash: hash, status: 'valid', checkedAt: Date.now() });
    return { ok: true };
  }

  /** Re-check the stored key against the registry. */
  async function revalidate() {
    var cur = await getStored();
    if (!cur || !cur.hash) return { status: 'none' };
    var reg;
    try {
      reg = await fetchRegistry();
    } catch (e) {
      return { status: cur.status || 'unknown', offline: true };
    }
    var entry = reg.keys[cur.hash];
    var valid = !!(entry && !entry.revoked);
    var next = { hash: cur.hash, status: valid ? 'valid' : 'revoked', checkedAt: Date.now() };
    await setStored(next);
    return { status: next.status };
  }

  async function status() {
    var cur = await getStored();
    return (cur && cur.status) || 'none';
  }

  async function licensed() {
    return (await status()) === 'valid';
  }

  async function deactivate() {
    var s = storage();
    if (!s) return;
    try {
      await new Promise(function (res) { s.remove(STORE_KEY, function () { res(); }); });
    } catch (e) {}
  }

  root.CSBLicense = {
    KEY_RE: KEY_RE,
    sha256Hex: sha256Hex,
    activate: activate,
    revalidate: revalidate,
    status: status,
    licensed: licensed,
    deactivate: deactivate,
    getStored: getStored
  };
})(typeof window !== 'undefined' ? window : globalThis);
