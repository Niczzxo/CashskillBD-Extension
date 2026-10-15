/* CashSkillBD — panel license lock screen.
 *
 * When the install has no valid member key, a full-panel overlay blocks the
 * whole UI and asks for the license key. Activation hashes the key locally
 * and checks it against the license registry (per-member keys, revocable by
 * the admin). If the service worker later marks the key revoked, the
 * overlay comes back automatically via chrome.storage.onChanged.
 */
(function () {
  'use strict';

  var MESSAGES = {
    format: 'Invalid key format. Enter it as CSB-XXXX-XXXX-XXXX-XXXX.',
    unknown: 'This key was not found. Please check the key and try again.',
    revoked: 'This key has been revoked. Contact your admin for a new key.',
    network: 'Cannot reach the server. Check your internet connection and try again.',
    crypto: 'This browser cannot verify keys. Update Chrome and try again.'
  };

  function networkMessage(detail) {
    if (detail === '403') return 'GitHub rate limit reached. Try again in 2-3 minutes.';
    if (detail === '404') return 'License registry not found (404). Please inform the admin.';
    if (detail) return 'Server error (HTTP ' + detail + '). Try again.';
    return MESSAGES.network;
  }

  var overlay = null;
  var inputEl = null;
  var msgEl = null;

  function el(tag, style, html) {
    var d = document.createElement(tag);
    if (style) d.setAttribute('style', style);
    if (html != null) d.innerHTML = html;
    return d;
  }

  function build() {
    if (overlay) return;
    overlay = el('div',
      'position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;' +
      'background:#0c0c11;padding:24px;box-sizing:border-box;');
    overlay.id = 'csb-license-lock';

    var box = el('div', 'width:100%;max-width:340px;text-align:center;');
    box.appendChild(el('div', 'font-size:44px;margin-bottom:12px;', '🔑'));
    box.appendChild(el('div',
      'font-size:18px;font-weight:700;color:#fff;margin-bottom:6px;font-family:inherit;',
      'License Key Required'));
    box.appendChild(el('div',
      'font-size:13px;color:#fff;opacity:.65;margin-bottom:18px;font-family:inherit;',
      'Enter your member key to use CashSkillBD.'));

    inputEl = el('input',
      'width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #e11d48;' +
      'background:rgba(255,255,255,.06);color:#fff;font-size:15px;letter-spacing:1px;text-align:center;' +
      'margin-bottom:12px;outline:none;font-family:inherit;text-transform:uppercase;');
    inputEl.type = 'text';
    inputEl.id = 'csb-license-input';
    inputEl.placeholder = 'CSB-XXXX-XXXX-XXXX-XXXX';
    inputEl.autocomplete = 'off';
    inputEl.spellcheck = false;
    inputEl.addEventListener('input', function () {
      inputEl.value = inputEl.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    });
    inputEl.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') doActivate();
    });
    box.appendChild(inputEl);

    var go = el('button',
      'width:100%;padding:12px;border:none;border-radius:10px;cursor:pointer;font-size:15px;font-weight:700;' +
      'background:linear-gradient(135deg,#e11d48,#f59e0b);color:#fff;font-family:inherit;',
      'Activate');
    go.type = 'button';
    go.id = 'csb-license-go';
    go.addEventListener('click', doActivate);
    box.appendChild(go);

    msgEl = el('div',
      'min-height:20px;font-size:13px;margin-top:12px;color:#f87171;font-family:inherit;', '');
    msgEl.id = 'csb-license-msg';
    box.appendChild(msgEl);

    box.appendChild(el('div',
      'font-size:12px;margin-top:8px;opacity:.5;color:#fff;font-family:inherit;',
      'Contact your admin to get a key.<br>Developed by RIYAZUL ISLAM'));

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function show() {
    if (!overlay) build();
    overlay.style.display = 'flex';
    try {
      if (inputEl && !inputEl.value) setTimeout(function () { inputEl.focus(); }, 100);
    } catch (e) {}
  }

  function hide() {
    if (overlay) overlay.style.display = 'none';
  }

  function say(text, ok) {
    if (!msgEl) return;
    msgEl.style.color = ok ? '#4ade80' : '#f87171';
    msgEl.textContent = text;
  }

  async function doActivate() {
    if (!inputEl) return;
    var btn = document.getElementById('csb-license-go');
    say('Verifying…', true);
    if (btn) btn.disabled = true;
    try {
      var r = await CSBLicense.activate(inputEl.value);
      if (r.ok) {
        say('Activated ✓', true);
        setTimeout(hide, 600);
      } else if (r.reason === 'network') {
        say(networkMessage(r.detail), false);
      } else {
        say(MESSAGES[r.reason] || 'Key verification failed.', false);
      }
    } catch (e) {
      say(MESSAGES.network, false);
    }
    if (btn) btn.disabled = false;
  }

  async function refresh() {
    var ok = false;
    try {
      ok = await CSBLicense.licensed();
    } catch (e) {}
    if (ok) hide();
    else show();
  }

  /** Fresh registry check when the panel opens: a revoked key locks
   * promptly instead of waiting for the service worker's periodic
   * revalidation. Offline falls back to the stored status (never locks
   * on network failure). */
  async function refreshFresh() {
    try {
      var r = await CSBLicense.revalidate();
      if (r && r.offline) { await refresh(); return; }
    } catch (e) {}
    try { await refresh(); } catch (e2) {}
  }

  function init() {
    build();
    refreshFresh();
    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        // UI-only refresh here: refreshFresh() would re-trigger
        // revalidation in a loop via the storage write it performs.
        if (area === 'local' && changes.csb_license) refresh();
      });
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
