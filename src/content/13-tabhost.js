/* CashSkillBD — 13-tabhost.js : minimal in-tab host.
 *
 * The extension UI now lives in Chrome's native side panel, so the tab only
 * needs a bare shadow host for in-page overlays (OCR / screenshot area
 * selection, toasts) plus a small CSB.panel compatibility surface that the
 * engines already call. The panel itself is managed by Chrome; the methods
 * below are intentional no-ops.
 */
'use strict';

(function () {
  var panel = {
    host: null,
    root: null,
    isOpen: false,
    isMinimized: false,

    ensureHost: function () {
      if (this.host) return;
      try {
        // Re-injection guard (10-1/13-1): if a host from a previous injection
        // already exists, adopt it instead of creating a duplicate.
        var existing = document.getElementById('cashskillbd-host');
        if (existing && existing.shadowRoot) {
          this.host = existing;
          var prevRoot = existing.shadowRoot.querySelector('.csb-root');
          if (prevRoot) this.root = prevRoot;
          return;
        }
        var host = document.createElement('div');
        host.id = 'cashskillbd-host';
        // Invisible by default — overlays opt into pointer events themselves.
        host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;' +
          'pointer-events:none;margin:0;padding:0;border:0;background:transparent;';
        var shadow = host.attachShadow({ mode: 'open' });
        var style = document.createElement('style');
        style.textContent = CSB.CSS || '';
        shadow.appendChild(style);
        var root = document.createElement('div');
        root.className = 'csb-root';
        try { root.setAttribute('data-theme', CSB.settings.effectiveTheme()); } catch (e) {}
        shadow.appendChild(root);
        (document.documentElement || document.body || document).appendChild(host);
        this.host = host;
        this.root = root;
      } catch (e) {}
    },

    toast: function (msg, ms) {
      try {
        this.ensureHost();
        if (!this.root) return;
        var t = document.createElement('div');
        t.className = 'csb-toast';
        t.textContent = String(msg == null ? '' : msg);
        this.root.appendChild(t);
        setTimeout(function () { try { t.remove(); } catch (e) {} }, ms || 2600);
      } catch (e) {}
    },

    logoUrl: function () {
      try { return chrome.runtime.getURL('icons/icon-128.png'); } catch (e) { return ''; }
    },

    // The native side panel is managed by Chrome — these stay as no-ops.
    open: function () {},
    close: function () {},
    toggle: function () {},
    minimize: function () {},
    unminimize: function () {},
    shiftPage: function () {},
    applySettings: function () {},
    switchTab: function () {},
    hideMinButton: function () {},
    showMinButton: function () {}
  };

  CSB.panel = panel;
})();
