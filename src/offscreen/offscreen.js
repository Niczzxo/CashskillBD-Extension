/* CashSkillBD — offscreen clipboard helper.
 * Runs in an offscreen document with clipboardWrite permission,
 * allowing clipboard writes without user activation.
 */
'use strict';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'CSB_OFFSCREEN_COPY_TEXT') return false;
  (async function () {
    try {
      await navigator.clipboard.writeText(msg.text || '');
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true;
});
