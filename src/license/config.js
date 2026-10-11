/* CashSkillBD — license registry config.
 *
 * READ-ONLY token for the private license registry repo
 * (Niczzxo/CashskillBD-Licenses). Use a fine-grained PAT with
 * "Contents: Read-only" on that repo only.
 *
 * This token CANNOT add, change or revoke keys — it only reads the
 * registry. Only SHA-256 hashes of keys are stored there, and hashes
 * cannot be reversed into keys, so embedding it here is safe.
 */
(function (root) {
  'use strict';
  root.CSB_LICENSE_CONFIG = {
    apiUrl: 'https://api.github.com/repos/Niczzxo/CashskillBD-Licenses/contents/licenses.json',
    branch: 'main',
    readToken: 'REPLACE_WITH_READ_ONLY_PAT'
  };
})(typeof window !== 'undefined' ? window : globalThis);
