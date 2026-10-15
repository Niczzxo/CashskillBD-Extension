/* CashSkillBD — license registry config.
 *
 * The registry repo (Niczzxo/CashskillBD-Licenses) is public and contains
 * ONLY SHA-256 hashes of member keys — hashes cannot be reversed into keys,
 * so no secret is needed to read it. (A read-only token is unnecessary;
 * `readToken` is kept optional for private-registry setups.)
 */
(function (root) {
  'use strict';
  root.CSB_LICENSE_CONFIG = {
    apiUrl: 'https://api.github.com/repos/Niczzxo/CashskillBD-Licenses/contents/licenses.json',
    branch: 'main',
    readToken: ''
  };
})(typeof window !== 'undefined' ? window : globalThis);
