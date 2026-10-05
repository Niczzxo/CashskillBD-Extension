/* CashSkillBD — 12-force-copy.js : force text selection on copy-blocking sites.
 *
 * Some sites try to prevent copying: CSS `user-select: none`, or JS
 * listeners that cancel `copy` / `cut` / `contextmenu` / `selectstart` /
 * `dragstart` events. When enabled, this module:
 *  1. Injects a page-level `!important` style forcing `user-select: text`.
 *  2. Registers window capture-phase listeners for those events and calls
 *     stopImmediatePropagation(), so the page's own blocking listeners
 *     (registered later, on deeper nodes/phases) never run and can never
 *     call preventDefault().
 *
 * Why this is safe for the page: stopImmediatePropagation() only stops
 * *listeners* — it does not cancel the event's default action. Clicks,
 * buttons and forms keep working; only the copy-blocking listeners are
 * neutralized. Our own panel lives in a shadow root and copies through
 * normally (the default copy action is untouched).
 *
 * Runs automatically when the extension is activated on a page, unless
 * disabled in Settings → Text Select / OCR.
 */
'use strict';

(function () {
  var STYLE_ID = 'cashskillbd-force-copy';
  var EVENTS = ['beforecopy', 'copy', 'cut', 'contextmenu', 'selectstart', 'dragstart'];

  function blocker(e) {
    // Neutralize the page's copy-blocking listeners. The default action
    // (e.g. putting the selection on the clipboard) still happens.
    try { e.stopImmediatePropagation(); } catch (err) {}
  }

  var forceCopy = {
    active: false,

    enable: function () {
      if (this.active) return;
      try {
        var st = document.getElementById(STYLE_ID);
        if (!st) {
          st = document.createElement('style');
          st.id = STYLE_ID;
          st.setAttribute('data-csb-ui', '1');
          st.textContent =
            '*{-webkit-user-select:text !important;user-select:text !important;' +
            '-webkit-touch-callout:default !important;}';
          (document.head || document.documentElement).appendChild(st);
        }
        for (var i = 0; i < EVENTS.length; i++) {
          window.addEventListener(EVENTS[i], blocker, true);
        }
        this.active = true;
      } catch (e) { /* never break the page */ }
    },

    disable: function () {
      if (!this.active) return;
      try {
        var st = document.getElementById(STYLE_ID);
        if (st && st.parentNode) st.parentNode.removeChild(st);
        for (var i = 0; i < EVENTS.length; i++) {
          window.removeEventListener(EVENTS[i], blocker, true);
        }
        // Also remove the early (document_start) listeners.
        if (window.__CSB_FC_DISABLE) window.__CSB_FC_DISABLE();
      } catch (e) {}
      this.active = false;
    },

    /** Apply the current setting (called once at boot). */
    apply: function () {
      try {
        if (CSB.settings.get('forceCopy.enabled', true)) this.enable();
        else this.disable();
      } catch (e) {}
    },

    /** Live-toggle from Settings. */
    setEnabled: function (on) {
      try {
        CSB.settings.set('forceCopy.enabled', !!on);
        if (on) this.enable(); else this.disable();
      } catch (e) {}
    }
  };

  CSB.forceCopy = forceCopy;
})();
