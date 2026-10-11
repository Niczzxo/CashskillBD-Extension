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
})();
