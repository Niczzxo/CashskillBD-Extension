/* CashSkillBD — 01-storage.js : settings defaults + storage manager
 *
 * Settings live in chrome.storage.local under a single versioned key.
 * If the user turns "Save Preferences Locally" off, settings apply for the
 * current session only and are never persisted.
 */
'use strict';

(function () {
  var STORAGE_KEY = 'cashskillbd.settings.v1';
  var LAST_TAB_KEY = 'cashskillbd.lastTab';
  var PANEL_WIDTH_KEY = 'cashskillbd.panelWidth';

  var DEFAULTS = {
    appearance: {
      theme: 'system',          // dark | light | system
      accent: 'red',            // red | custom
      customAccent: '#D7263D'
    },
    panel: {
      openInSplitPanel: true,
      rememberLastTab: true,
      showFloatingController: true,
      panelWidth: '30%',        // 25% | 30% | 35% | 40% | 45% | 50%
      rememberPanelSize: true,
      controllerPosition: 'bottom-right', // right | left | top-right | bottom-right
      allowResize: true
    },
    typing: {
      defaultSpeed: 'slow',   // slow | normal | fast | custom
      customInterval: 70,       // ms, 20..1000
      mistakeSimulation: true,
      defaultMistakeRate: 'custom',  // 0 | 1 | 2 | 5 | custom
      customMistakeRate: 7,     // %
      correctionDelay: '300',   // 100 | 200 | 300 | 500 | custom
      customCorrectionDelay: 300, // ms
      typingVariation: true,
      autoFocusDetection: true
    },
    translation: {
      targetLanguage: 'en',
      sourceLanguage: 'auto',     // 'auto' = detect language
      provider: 'google',       // provider id — replaceable (see 06-translate.js)
      autoDetect: true,
      showCopyButton: true
    },
    screenshot: {
      format: 'png',            // png | jpg
      quality: 'high',          // standard | high
      autoDownload: false,
      copyAfterCapture: true,
      autoCopyArea: true,
      filenameTemplate: 'CashSkillBD_FullPage_[DATE]_[TIME]'
    },
    forceCopy: {
      enabled: true
    },
    ocr: {
      language: 'auto',         // auto | en | bn | hi
      accuracy: 'standard',     // standard | high
      autoCopy: true
    },
    pageTranslate: {
      promptEnabled: true,
      autoTranslate: true,
      neverHosts: []
    },
    updates: {
      repo: 'Niczzxo/CashskillBD-Extension', // GitHub "username/repo" for "Check for updates"
      lastCheck: 0, // timestamp of the last automatic update check
      dismissed: '' // latest version the user dismissed
    },
    notifications: {
      typingCompleted: true,
      screenshotCompleted: true,
      ocrCompleted: true,
      translationCompleted: true
    },
    privacy: {
      saveLocally: true
    }
  };

  function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  function deepMerge(base, over) {
    var out = {};
    Object.keys(base).forEach(function (k) {
      if (isPlainObject(base[k]) && isPlainObject(over && over[k])) {
        out[k] = deepMerge(base[k], over[k]);
      } else if (over && over[k] !== undefined) {
        out[k] = over[k];
      } else {
        out[k] = base[k];
      }
    });
    // keep unknown future keys from storage
    if (isPlainObject(over)) {
      Object.keys(over).forEach(function (k) {
        if (!(k in out)) out[k] = over[k];
      });
    }
    return out;
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  CSB.DEFAULT_SETTINGS = clone(DEFAULTS);

  CSB.settings = {
    data: clone(DEFAULTS),

    get: function (path, fallback) {
      var cur = this.data;
      var parts = String(path).split('.');
      for (var i = 0; i < parts.length; i++) {
        if (cur == null || typeof cur !== 'object' || !(parts[i] in cur)) return fallback;
        cur = cur[parts[i]];
      }
      return cur === undefined ? fallback : cur;
    },

    set: function (path, value) {
      var parts = String(path).split('.');
      var cur = this.data;
      for (var i = 0; i < parts.length - 1; i++) {
        if (!isPlainObject(cur[parts[i]])) cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      this.persist();
      if (CSB.panel && CSB.panel.applySettings) CSB.panel.applySettings();
    },

    load: async function () {
      try {
        // Never let a hung storage read block the boot (detection etc.):
        // after 5s continue with defaults, then merge the real data late.
        var got = false;
        var res = await Promise.race([
          chrome.storage.local.get(STORAGE_KEY).then(function (r) { got = true; return r; }),
          new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 5000); })
        ]);
        if (got && res) {
          this.data = deepMerge(clone(DEFAULTS), res[STORAGE_KEY] || {});
        } else {
          this.data = clone(DEFAULTS);
          var self = this;
          chrome.storage.local.get(STORAGE_KEY).then(function (r2) {
            if (r2 && r2[STORAGE_KEY]) {
              try { self.data = deepMerge(self.data, r2[STORAGE_KEY]); } catch (e) {}
            }
          }).catch(function () {});
        }
      } catch (e) {
        this.data = clone(DEFAULTS);
      }
      return this.data;
    },

    persist: async function () {
      if (!this.get('privacy.saveLocally', true)) return;
      try {
        var o = {};
        o[STORAGE_KEY] = this.data;
        await chrome.storage.local.set(o);
      } catch (e) {}
    },

    reset: async function () {
      this.data = clone(DEFAULTS);
      try { await chrome.storage.local.remove(STORAGE_KEY); } catch (e) {}
      await this.persist();
      if (CSB.panel && CSB.panel.applySettings) CSB.panel.applySettings();
    },

    /** Remove temporary/ephemeral data (OCR text, last capture, typing draft). */
    clearTemp: async function () {
      try {
        await chrome.storage.local.remove([LAST_TAB_KEY, PANEL_WIDTH_KEY, 'cashskillbd.temp']);
      } catch (e) {}
      if (CSB.ocr) CSB.ocr.clearResult();
      if (CSB.screenshot) CSB.screenshot.clearPreview();
      if (CSB.typing) CSB.typing.clearDraft();
    },

    getLastTab: async function () {
      try {
        var r = await chrome.storage.local.get(LAST_TAB_KEY);
        return r[LAST_TAB_KEY] || 'typing';
      } catch (e) { return 'typing'; }
    },

    setLastTab: async function (tab) {
      if (!this.get('panel.rememberLastTab', true)) return;
      try { var o = {}; o[LAST_TAB_KEY] = tab; await chrome.storage.local.set(o); } catch (e) {}
    },

    getPanelWidth: async function () {
      try {
        var r = await chrome.storage.local.get(PANEL_WIDTH_KEY);
        if (r[PANEL_WIDTH_KEY]) return r[PANEL_WIDTH_KEY];
      } catch (e) {}
      return this.get('panel.panelWidth', '30%');
    },

    setPanelWidth: async function (w) {
      if (!this.get('panel.rememberPanelSize', true)) return;
      try { var o = {}; o[PANEL_WIDTH_KEY] = w; await chrome.storage.local.set(o); } catch (e) {}
    },

    effectiveTheme: function () {
      var t = this.get('appearance.theme', 'system');
      if (t === 'system') {
        try {
          return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        } catch (e) { return 'dark'; }
      }
      return t;
    },

    effectiveAccent: function () {
      return this.get('appearance.accent', 'red') === 'custom'
        ? this.get('appearance.customAccent', '#D7263D')
        : '#E03131';
    }
  };

  // Keep settings in sync across contexts: a change made in the side panel
  // must reach every tab's content script (and vice versa).
  // Guarded so re-injection (10-1) doesn't stack duplicate listeners.
  try {
    if (!window.__CSB_SETTINGS_LISTENER) {
      window.__CSB_SETTINGS_LISTENER = true;
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        var nv = changes[STORAGE_KEY].newValue;
        if (nv && typeof nv === 'object') {
          CSB.settings.data = deepMerge(clone(DEFAULTS), nv);
          if (CSB.panel && CSB.panel.applySettings) { try { CSB.panel.applySettings(); } catch (e) {} }
          // Tab-side modules that hold applied state must re-apply it.
          try { if (CSB.forceCopy) CSB.forceCopy.apply(); } catch (e) {}
        }
      });
    }
  } catch (e) {}
})();
