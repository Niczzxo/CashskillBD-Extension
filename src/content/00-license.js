/* CashSkillBD — content-script license gate.
 *
 * Auto features (page auto-translate in the top frame and in iframes) must
 * not run on unlicensed installs. Reads the cached license status from
 * chrome.storage.local — written by the panel on activation and refreshed
 * by the service worker (browser start + every 6 hours).
 *
 * Exposes window.CSBLicenseGate() -> Promise<boolean>.
 */
(function () {
  'use strict';
  window.CSBLicenseGate = function () {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get('csb_license', function (r) {
          var lic = r && r.csb_license;
          resolve(!!(lic && lic.status === 'valid'));
        });
      } catch (e) {
        resolve(false);
      }
    });
  };

  function csbCmpVer(a, b) {
    var pa = String(a || '').split('.').map(function (x) { return parseInt(x, 10) || 0; });
    var pb = String(b || '').split('.').map(function (x) { return parseInt(x, 10) || 0; });
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var d = (pa[i] || 0) - (pb[i] || 0);
      if (d !== 0) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  /* Forced update gate for auto features. Resolves true when the install is
   * outdated AND a fresh (<=24h) update flag says so — a stale or missing
   * flag never blocks (offline-safe). */
  window.CSBUpdateGate = function () {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get('csb_update', function (r) {
          try {
            var u = r && r.csb_update;
            var cur = '';
            try { cur = chrome.runtime.getManifest().version; } catch (e2) {}
            if (!u || !u.latest || !u.checkedAt || !cur) return resolve(false);
            if (Date.now() - u.checkedAt > 24 * 3600 * 1000) return resolve(false);
            resolve(csbCmpVer(u.latest, cur) > 0);
          } catch (e3) { resolve(false); }
        });
      } catch (e) {
        resolve(false);
      }
    });
  };
})();
