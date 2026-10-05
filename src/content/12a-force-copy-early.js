/* CashSkillBD — 12a-force-copy-early.js : EARLY copy-block neutralizer.
 *
 * Runs at document_start — BEFORE any page script — so our capture-phase
 * listeners are registered FIRST and win the race against the page's own
 * copy-blocking listeners. Calling stopImmediatePropagation() here prevents
 * the event from ever reaching the page's listeners (or target on* handlers),
 * so they can never call preventDefault().
 *
 * No dependencies (vanilla JS). The main 12-force-copy.js (document_idle)
 * applies the user setting: if force-copy is disabled, it removes these
 * early listeners via __CSB_FC_DISABLE().
 */
'use strict';

(function () {
  var EVENTS = ['beforecopy', 'copy', 'cut', 'contextmenu', 'selectstart', 'dragstart'];

  function blocker(e) {
    try { e.stopImmediatePropagation(); } catch (err) {}
  }

  // Install immediately.
  try {
    for (var i = 0; i < EVENTS.length; i++) {
      window.addEventListener(EVENTS[i], blocker, true);
    }
  } catch (e) {}

  // Exposed for the main force-copy module (same isolated world).
  window.__CSB_FC_BLOCKER = blocker;
  window.__CSB_FC_EVENTS = EVENTS;
  window.__CSB_FC_DISABLE = function () {
    try {
      for (var j = 0; j < EVENTS.length; j++) {
        window.removeEventListener(EVENTS[j], blocker, true);
      }
    } catch (e) {}
  };
})();
