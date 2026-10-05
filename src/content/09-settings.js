/* CashSkillBD — 09-settings.js : Settings UI (10 categories, spec §12–§22). */
'use strict';

(function () {
  var U = CSB.util;

  var CATS = [
    { id: 'appearance', label: 'Appearance' },
    { id: 'panel', label: 'Panel' },
    { id: 'typing', label: 'Auto Typing' },
    { id: 'translation', label: 'Translation' },
    { id: 'screenshot', label: 'Screenshot' },
    { id: 'ocr', label: 'OCR' },
    { id: 'shortcuts', label: 'Shortcuts' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'privacy', label: 'Privacy' },
    { id: 'about', label: 'About' }
  ];

  function toggleRow(label, desc, path, def) {
    var row = U.el('div', 'csb-set-item');
    var flex = U.el('div', 'csb-set-flex');
    var txt = U.el('div', '', '<div class="csb-set-label">' + U.esc(label) + '</div>' +
      (desc ? '<div class="csb-set-desc">' + U.esc(desc) + '</div>' : ''));
    var lab = U.el('label', 'csb-toggle');
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!CSB.settings.get(path, def);
    input.setAttribute('aria-label', label);
    input.addEventListener('change', function () { CSB.settings.set(path, input.checked); });
    lab.appendChild(input);
    lab.appendChild(U.el('span', 'csb-track'));
    flex.appendChild(txt); flex.appendChild(lab);
    row.appendChild(flex);
    return row;
  }

  function segRow(label, desc, options, path, def) {
    // options: [[value, label], ...]
    var row = U.el('div', 'csb-set-item');
    row.appendChild(U.el('div', 'csb-set-label', U.esc(label)));
    if (desc) row.appendChild(U.el('div', 'csb-set-desc', U.esc(desc)));
    var seg = U.el('div', 'csb-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', label);
    var cur = String(CSB.settings.get(path, def));
    options.forEach(function (opt) {
      var b = U.el('button', 'csb-seg' + (String(opt[0]) === cur ? ' csb-on' : ''), U.esc(opt[1]));
      b.type = 'button';
      b.addEventListener('click', function () {
        CSB.settings.set(path, opt[0]);
        Array.prototype.forEach.call(seg.children, function (c) { c.classList.remove('csb-on'); });
        b.classList.add('csb-on');
      });
      seg.appendChild(b);
    });
    row.appendChild(seg);
    return row;
  }

  function numberRow(label, desc, path, def, min, max) {
    var row = U.el('div', 'csb-set-item');
    row.appendChild(U.el('div', 'csb-set-label', U.esc(label)));
    if (desc) row.appendChild(U.el('div', 'csb-set-desc', U.esc(desc)));
    var input = U.el('input', 'csb-input');
    input.type = 'number';
    input.min = min; input.max = max;
    input.value = CSB.settings.get(path, def);
    input.style.maxWidth = '160px';
    input.setAttribute('aria-label', label);
    input.addEventListener('change', function () {
      var v = U.clamp(parseFloat(input.value) || def, min, max);
      input.value = v;
      CSB.settings.set(path, v);
    });
    row.appendChild(input);
    return row;
  }

  function textRow(label, desc, path, def, maxWidth) {
    var row = U.el('div', 'csb-set-item');
    row.appendChild(U.el('div', 'csb-set-label', U.esc(label)));
    if (desc) row.appendChild(U.el('div', 'csb-set-desc', U.esc(desc)));
    var input = U.el('input', 'csb-input');
    input.type = 'text';
    input.value = CSB.settings.get(path, def);
    if (maxWidth) input.style.maxWidth = maxWidth;
    input.setAttribute('aria-label', label);
    input.addEventListener('change', function () { CSB.settings.set(path, input.value); });
    row.appendChild(input);
    return row;
  }

  function actionRow(label, desc, btnLabel, onClick, danger) {
    var row = U.el('div', 'csb-set-item');
    var flex = U.el('div', 'csb-set-flex');
    flex.appendChild(U.el('div', '',
      '<div class="csb-set-label">' + U.esc(label) + '</div>' +
      (desc ? '<div class="csb-set-desc">' + U.esc(desc) + '</div>' : '')));
    var b = U.el('button', 'csb-btn csb-btn-ghost csb-btn-sm', U.esc(btnLabel));
    b.type = 'button';
    if (danger) b.style.borderColor = '#e03131', b.style.color = '#ff8787';
    b.addEventListener('click', onClick);
    flex.appendChild(b);
    row.appendChild(flex);
    return row;
  }

  var builders = {
    appearance: function (page) {
      page.appendChild(segRow('Theme', 'Panel color scheme.',
        [['dark', 'Dark'], ['light', 'Light'], ['system', 'System']],
        'appearance.theme', 'system'));
      page.appendChild(segRow('Accent color', 'CashSkillBD brand color.',
        [['red', 'CashSkill Red'], ['custom', 'Custom']],
        'appearance.accent', 'red'));
      var row = U.el('div', 'csb-set-item');
      row.appendChild(U.el('div', 'csb-set-label', 'Custom accent'));
      var pick = U.el('input', '');
      pick.type = 'color';
      pick.value = CSB.settings.get('appearance.customAccent', '#D7263D');
      pick.setAttribute('aria-label', 'Custom accent color');
      pick.style.cssText = 'width:52px;height:34px;border:1px solid var(--csb-border);border-radius:8px;background:transparent;cursor:pointer;padding:2px';
      pick.addEventListener('input', U.debounce(function () {
        CSB.settings.set('appearance.customAccent', pick.value);
        CSB.settings.set('appearance.accent', 'custom');
      }, 200));
      row.appendChild(pick);
      page.appendChild(row);
    },

    panel: function (page) {
      if (CSB.IS_SIDEPANEL) {
        // Native side panel: Chrome owns the dock, width and open state.
        page.appendChild(toggleRow('Remember last tab', 'Reopen the tab you used last.', 'panel.rememberLastTab', true));
        return;
      }
      page.appendChild(toggleRow('Open in split panel', 'Open inside the current tab instead of a popup.', 'panel.openInSplitPanel', true));
      page.appendChild(toggleRow('Remember last tab', 'Reopen the tab you used last.', 'panel.rememberLastTab', true));
      return;
    },

    typing: function (page) {
      page.appendChild(segRow('Default speed', '',
        [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['custom', 'Custom']],
        'typing.defaultSpeed', 'normal'));
      page.appendChild(numberRow('Custom typing interval', 'Milliseconds per character (20–1000).', 'typing.customInterval', 70, 20, 1000));
      page.appendChild(toggleRow('Mistake simulation', 'Occasionally mistype, then correct with Backspace. Final text is always exact.', 'typing.mistakeSimulation', true));
      page.appendChild(segRow('Default mistake rate', '',
        [['0', '0%'], ['1', '1%'], ['2', '2%'], ['5', '5%'], ['custom', 'Custom']],
        'typing.defaultMistakeRate', '2'));
      page.appendChild(numberRow('Custom mistake rate', 'Percent of characters (0–20).', 'typing.customMistakeRate', 2, 0, 20));
      page.appendChild(segRow('Correction delay', 'Pause before fixing a simulated mistake.',
        [['100', '100ms'], ['200', '200ms'], ['300', '300ms'], ['500', '500ms'], ['custom', 'Custom']],
        'typing.correctionDelay', '300'));
      page.appendChild(numberRow('Custom correction delay', 'Milliseconds (0–5000).', 'typing.customCorrectionDelay', 300, 0, 5000));
      page.appendChild(toggleRow('Typing variation', 'Vary delays naturally within the configured range.', 'typing.typingVariation', true));
      page.appendChild(toggleRow('Auto focus detection', 'If no field is focused, wait for you to click one before typing.', 'typing.autoFocusDetection', true));
    },

    translation: function (page) {
      var langs = Object.keys(CSB.translate.LANG_NAMES)
        .filter(function (c) { return c !== 'auto'; })
        .sort(function (a, b) { return CSB.translate.LANG_NAMES[a].localeCompare(CSB.translate.LANG_NAMES[b]); });
      var row = U.el('div', 'csb-set-item');
      row.appendChild(U.el('div', 'csb-set-label', 'Target language'));
      var sel = U.el('select', 'csb-select');
      sel.style.maxWidth = '220px';
      langs.forEach(function (c) {
        var o = document.createElement('option');
        o.value = c; o.textContent = CSB.translate.LANG_NAMES[c];
        sel.appendChild(o);
      });
      sel.value = CSB.settings.get('translation.targetLanguage', 'en');
      sel.setAttribute('aria-label', 'Target language');
      sel.addEventListener('change', function () { CSB.settings.set('translation.targetLanguage', sel.value); });
      row.appendChild(sel);
      page.appendChild(row);

      var provs = Object.keys(CSB.translate.providers).map(function (id) {
        return [id, CSB.translate.providers[id].name];
      });
      page.appendChild(segRow('Translation provider', 'Swap the backend any time — no code changes needed.',
        provs, 'translation.provider', 'google'));
      page.appendChild(toggleRow('Auto language detection', 'Default the source language to auto-detect.', 'translation.autoDetect', true));
      page.appendChild(toggleRow('Show copy button', '', 'translation.showCopyButton', true));
      page.appendChild(toggleRow('Website translation prompt', 'Offer to translate the full page when a foreign language is detected.', 'pageTranslate.promptEnabled', true));
      // Auto-translate toggle: turning it on translates the current page right away.
      (function () {
        var row = U.el('div', 'csb-set-item');
        var flex = U.el('div', 'csb-set-flex');
        flex.appendChild(U.el('div', '',
          '<div class="csb-set-label">' + U.esc('Auto-translate pages') + '</div>' +
          '<div class="csb-set-desc">' + U.esc('When a foreign language is detected, translate the page automatically without asking.') + '</div>'));
        var lab = U.el('label', 'csb-toggle');
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!CSB.settings.get('pageTranslate.autoTranslate', true);
        input.setAttribute('aria-label', 'Auto-translate pages');
        input.addEventListener('change', function () {
          CSB.settings.set('pageTranslate.autoTranslate', input.checked);
          if (input.checked && CSB.bus) {
            CSB.bus.cmd('pt.go').catch(function () {});
          }
        });
        lab.appendChild(input);
        lab.appendChild(U.el('span', 'csb-track'));
        flex.appendChild(lab);
        row.appendChild(flex);
        page.appendChild(row);
      })();
      page.appendChild(actionRow('Never-translate sites', 'Sites where you chose “Never for this site”.', 'RESET', function () {
        CSB.settings.set('pageTranslate.neverHosts', []);
        CSB.panel.toast('Never-translate list cleared');
      }));
      var note = U.el('p', 'csb-hint', 'Note: the active provider sends the text you translate to its service. Nothing else leaves your browser.');
      page.appendChild(note);
    },

    screenshot: function (page) {
      page.appendChild(segRow('Image format', '', [['png', 'PNG'], ['jpg', 'JPG']], 'screenshot.format', 'png'));
      page.appendChild(segRow('Image quality', '', [['standard', 'Standard'], ['high', 'High']], 'screenshot.quality', 'high'));
      page.appendChild(toggleRow('Auto download', 'Download immediately after capture.', 'screenshot.autoDownload', false));
      page.appendChild(toggleRow('Copy after capture', 'Copy to clipboard immediately after capture.', 'screenshot.copyAfterCapture', false));
      page.appendChild(toggleRow('Auto-copy area screenshot', 'Area captures are copied to clipboard automatically.', 'screenshot.autoCopyArea', true));
      page.appendChild(textRow('Default filename', 'Use [DATE] and [TIME] placeholders.',
        'screenshot.filenameTemplate', 'CashSkillBD_FullPage_[DATE]_[TIME]', '100%'));
    },

    ocr: function (page) {
      (function () {
        var row = U.el('div', 'csb-set-item');
        row.appendChild(U.el('div', 'csb-set-label', 'OCR language'));
        row.appendChild(U.el('div', 'csb-set-desc',
          'Text is extracted in the selected language. Packs for other languages download on first use.'));
        var sel = U.el('select', 'csb-select');
        sel.style.maxWidth = '240px';
        (CSB.OCR_LANGS || [['auto', 'Auto Detect']]).forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o[0]; opt.textContent = o[1];
          sel.appendChild(opt);
        });
        sel.value = CSB.settings.get('ocr.language', 'auto');
        sel.setAttribute('aria-label', 'OCR language');
        sel.addEventListener('change', function () { CSB.settings.set('ocr.language', sel.value); });
        row.appendChild(sel);
        page.appendChild(row);
      })();
      page.appendChild(segRow('OCR accuracy', '',
        [['standard', 'Standard'], ['high', 'High']],
        'ocr.accuracy', 'standard'));
      page.appendChild(toggleRow('Auto copy OCR result', 'Copy extracted text to clipboard automatically.', 'ocr.autoCopy', true));
      // Force-copy toggle applies live (not just stored).
      (function () {
        var row = U.el('div', 'csb-set-item');
        var flex = U.el('div', 'csb-set-flex');
        flex.appendChild(U.el('div', '',
          '<div class="csb-set-label">' + U.esc('Force text selection') + '</div>' +
          '<div class="csb-set-desc">' + U.esc('Let me select and copy text even on sites that try to block copying.') + '</div>'));
        var lab = U.el('label', 'csb-toggle');
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!CSB.settings.get('forceCopy.enabled', true);
        input.setAttribute('aria-label', 'Force text selection');
        input.addEventListener('change', function () {
          if (CSB.forceCopy) CSB.forceCopy.setEnabled(input.checked);
          else CSB.settings.set('forceCopy.enabled', input.checked);
        });
        lab.appendChild(input);
        lab.appendChild(U.el('span', 'csb-track'));
        flex.appendChild(lab);
        row.appendChild(flex);
        page.appendChild(row);
      })();
      var note = U.el('p', 'csb-hint', 'OCR runs on-device (Tesseract.js). English, Bangla and Hindi are bundled; other language packs download on first use. Your selections never leave the browser.');
      page.appendChild(note);
    },

    shortcuts: function (page) {
      var rows = [
        ['Open CashSkillBD', 'Ctrl + Shift + C'],
        ['Start typing', 'Ctrl + Shift + S'],
        ['Stop typing', 'Ctrl + Shift + X'],
        ['Full-page screenshot', 'Ctrl + Shift + P'],
        ['Screen text select (OCR)', 'not set — assign below']
      ];
      rows.forEach(function (r) {
        var row = U.el('div', 'csb-set-item');
        var flex = U.el('div', 'csb-set-flex');
        flex.appendChild(U.el('div', 'csb-set-label', U.esc(r[0])));
        flex.appendChild(U.el('span', 'csb-kbd', U.esc(r[1])));
        row.appendChild(flex);
        page.appendChild(row);
      });
      page.appendChild(actionRow('Customize shortcuts', 'Change any shortcut in Chrome’s extension shortcut settings.',
        'OPEN CHROME SHORTCUT SETTINGS', function () {
          // Chrome blocks extensions from opening chrome:// pages directly.
          var done = function () { CSB.panel.toast('Open chrome://extensions/shortcuts manually'); };
          try {
            var p = chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
            if (p && p.catch) p.catch(done);
          } catch (e) { done(); }
        }));
    },

    notifications: function (page) {
      page.appendChild(toggleRow('Typing completed', '', 'notifications.typingCompleted', true));
      page.appendChild(toggleRow('Screenshot completed', '', 'notifications.screenshotCompleted', true));
      page.appendChild(toggleRow('OCR completed', '', 'notifications.ocrCompleted', true));
      page.appendChild(toggleRow('Translation completed', '', 'notifications.translationCompleted', true));
    },

    privacy: function (page) {
      page.appendChild(toggleRow('Save preferences locally', 'When off, settings apply for this session only.', 'privacy.saveLocally', true));
      page.appendChild(actionRow('Clear temporary data', 'OCR results, screenshot previews and typing drafts.', 'CLEAR', function () {
        CSB.settings.clearTemp();
        CSB.panel.toast('Temporary data cleared');
      }));
      page.appendChild(actionRow('Reset all settings', 'Restore every setting to its default.', 'RESET', function () {
        if (confirm('Reset all CashSkillBD settings to defaults?')) {
          CSB.settings.reset().then(function () {
            CSB.settingsUI.refresh();
            CSB.panel.toast('Settings reset');
          });
        }
      }, true));
      var note = U.el('p', 'csb-hint',
        'CashSkillBD never collects passwords, never reads password fields, never logs private page text, ' +
        'and never uploads screenshots. OCR runs on-device; only translation sends the text you choose to translate.');
      page.appendChild(note);
    },

    about: function (page) {
      var wrap = U.el('div', '');
      wrap.style.textAlign = 'center';
      wrap.style.padding = '10px 0 4px';
      var logo = U.el('img', 'csb-about-logo');
      logo.src = CSB.panel.logoUrl();
      logo.alt = 'CashSkillBD logo';
      var name = U.el('div', '', '<div style="font-size:20px;font-weight:800">CashSkill<span style="color:var(--csb-accent)">BD</span></div>');
      var tag = U.el('div', 'csb-about-ver', 'Learn • Earn • Grow');
      var ver = U.el('div', 'csb-about-ver', 'Version ' + U.esc(chrome.runtime.getManifest().version));
      var dev = U.el('div', 'csb-about-dev', 'Developed by <span>RIYAZUL ISLAM</span>');
      wrap.appendChild(logo); wrap.appendChild(name); wrap.appendChild(tag); wrap.appendChild(ver); wrap.appendChild(dev);
      page.appendChild(wrap);
      page.appendChild(actionRow('Check for updates', 'Compare with the latest GitHub release.', 'CHECK', function () {
        CSB.settingsUI.checkForUpdates();
      }));
      page.appendChild(actionRow('Privacy policy', '', 'VIEW', function () {
        CSB.settingsUI.modal('Privacy Policy',
          '<ul>' +
          '<li>All preferences are stored locally in your browser (chrome.storage.local).</li>' +
          '<li>OCR runs on-device using the bundled Tesseract.js engine; English, Bangla and Hindi are bundled, other language packs download on first use.</li>' +
          '<li>Translation sends only the text you explicitly translate to the selected provider.</li>' +
          '<li>CashSkillBD never reads password fields, never logs private page text, and never uploads screenshots.</li>' +
          '<li>No account, no analytics, no tracking.</li>' +
          '</ul>');
      }));
      page.appendChild(actionRow('Help / documentation', 'How each tool works.', 'VIEW', function () {
        CSB.settingsUI.modal('Help',
          '<p><b>⌨️ Typing:</b> paste text, click inside a page input field, press START. STOP any time.</p>' +
          '<p><b>🌐 Translate:</b> type, paste, or use selected page text — source language is auto-detected, result is English.</p>' +
          '<p><b>📸 Screenshot:</b> captures the full scrollable page, then copy or download it.</p>' +
          '<p><b>🔤 Text Select:</b> drag a rectangle over any visible region to extract its text with OCR.</p>' +
          '<p>Shortcuts: <span class="csb-kbd">Ctrl+Shift+C</span> open · <span class="csb-kbd">Ctrl+Shift+S</span> start · ' +
          '<span class="csb-kbd">Ctrl+Shift+X</span> stop · <span class="csb-kbd">Ctrl+Shift+P</span> screenshot. ' +
          'Text select has no default key (Chrome limit) — assign one at chrome://extensions/shortcuts.</p>');
      }));
    }
  };

  /** Compare dotted versions: 1 if a > b, -1 if a < b, 0 if equal. */
  function compareVersions(a, b) {
    var pa = String(a || '').split('.').map(function (x) { return parseInt(x, 10) || 0; });
    var pb = String(b || '').split('.').map(function (x) { return parseInt(x, 10) || 0; });
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var d = (pa[i] || 0) - (pb[i] || 0);
      if (d !== 0) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  var settingsUI = {
    navEl: null,
    pagesEl: null,
    activeCat: 'appearance',

    build: function (pane) {
      var self = this;
      pane.appendChild(U.el('div', 'csb-title', '⚙️ Settings'));

      var layout = U.el('div', 'csb-set-layout');
      var nav = U.el('div', 'csb-set-nav');
      nav.setAttribute('role', 'tablist');
      nav.setAttribute('aria-label', 'Settings categories');
      var pages = U.el('div', 'csb-set-pages');
      layout.appendChild(nav);
      layout.appendChild(pages);
      pane.appendChild(layout);

      this.navEl = nav;
      this.pagesEl = pages;
      this.renderCats();
      this.showCat('appearance');
    },

    renderCats: function () {
      var self = this;
      this.navEl.innerHTML = '';
      this.pagesEl.innerHTML = '';
      CATS.forEach(function (c) {
        var b = U.el('button', '', U.esc(c.label));
        b.type = 'button';
        b.dataset.cat = c.id;
        b.setAttribute('role', 'tab');
        b.addEventListener('click', function () { self.showCat(c.id); });
        self.navEl.appendChild(b);
        var pg = U.el('div', 'csb-set-page');
        pg.dataset.catPage = c.id;
        builders[c.id](pg);
        self.pagesEl.appendChild(pg);
      });
    },

    showCat: function (id) {
      this.activeCat = id;
      var navBtns = this.navEl.querySelectorAll('button');
      Array.prototype.forEach.call(navBtns, function (b) {
        b.classList.toggle('csb-active', b.dataset.cat === id);
      });
      var pgs = this.pagesEl.querySelectorAll('.csb-set-page');
      Array.prototype.forEach.call(pgs, function (p) {
        p.classList.toggle('csb-active', p.dataset.catPage === id);
      });
    },

    /** Rebuild to reflect current setting values (e.g. after reset). */
    refresh: function () {
      if (!this.navEl) return;
      var cur = this.activeCat;
      this.renderCats();
      this.showCat(cur);
    },

    modal: function (title, html, onClose) {
      var back = U.el('div', 'csb-modal-back');
      var m = U.el('div', 'csb-modal', '<h4>' + U.esc(title) + '</h4>' + html);
      var close = U.el('button', 'csb-btn csb-btn-primary csb-btn-sm', 'CLOSE');
      close.type = 'button';
      close.style.marginTop = '10px';
      var closed = false;
      function doClose() {
        if (closed) return;
        closed = true;
        try { back.remove(); } catch (e) {}
        if (onClose) { try { onClose(); } catch (e2) {} }
      }
      close.addEventListener('click', doClose);
      m.appendChild(close);
      back.appendChild(m);
      back.addEventListener('click', function (e) { if (e.target === back) doClose(); });
      CSB.panel.root.appendChild(back);
    },

    closeModals: function () {
      try {
        Array.prototype.forEach.call(
          CSB.panel.root.querySelectorAll('.csb-modal-back'),
          function (b) { b.remove(); });
      } catch (e) {}
    },

    /** Fetch the latest GitHub release. Strategies in order:
     * 1) api.github.com (rich info: version + direct asset URL).
     * 2) github.com/<repo>/releases/latest redirect — the final URL contains
     *    the tag (…/releases/tag/vX.Y.Z). Works when the API is rate-limited
     *    (403 on shared IPs) but github.com is reachable.
     * Each strategy tries a direct fetch first, then the SW proxy.
     * Returns {version, url, name}. Throws a specific error. */
    fetchLatestRelease: async function (repo) {
      var self = this;
      // Strategy 1: API.
      try {
        var api = await self.fetchJsonSmart('https://api.github.com/repos/' + repo + '/releases/latest');
        return {
          version: String(api.tag_name || '').trim().replace(/^[vV]/, ''),
          url: (api.assets && api.assets[0] && api.assets[0].browser_download_url) || api.html_url,
          name: api.name || ''
        };
      } catch (e) { /* fall through to redirect strategy */ }
      // Strategy 2: redirect.
      var finalUrl = await self.followRedirectSmart('https://github.com/' + repo + '/releases/latest');
      var m = /\/releases\/tag\/([^\/?#]+)/.exec(finalUrl || '');
      if (!m) throw new Error('update check failed (API unreachable and redirect failed)');
      var tag = m[1];
      return {
        version: tag.replace(/^[vV]/, ''),
        url: 'https://github.com/' + repo + '/releases/tag/' + tag,
        name: ''
      };
    },

    /** GET JSON directly, else via the SW proxy. */
    fetchJsonSmart: async function (url) {
      try {
        var res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (e) {
        var sw = await new Promise(function (resolve) {
          try {
            chrome.runtime.sendMessage({ type: 'CSB_FETCH', url: url }, function (r) { resolve(r); });
          } catch (e2) { resolve(null); }
        });
        if (sw && sw.ok) return JSON.parse(sw.text);
        throw new Error('network unreachable' + (sw && (sw.error || sw.status) ? ' (' + (sw.error || sw.status) + ')' : ''));
      }
    },

    /** Follow a redirecting URL (direct, else SW proxy) and return the final URL. */
    followRedirectSmart: async function (url) {
      try {
        var res = await fetch(url, { redirect: 'follow' });
        if (res.url) return res.url;
      } catch (e) {}
      var sw = await new Promise(function (resolve) {
        try {
          chrome.runtime.sendMessage({ type: 'CSB_FETCH', url: url }, function (r) { resolve(r); });
        } catch (e2) { resolve(null); }
      });
      if (sw && sw.url) return sw.url;
      throw new Error('redirect failed');
    },

    /** Silent check when the panel opens; pops up only for a new,
     * undismissed update. Throttled to once an hour; the timestamp is only
     * saved after a SUCCESSFUL check, so a failed check (offline / API
     * hiccup) retries on the next panel open instead of blacking out. */
    autoCheck: async function () {
      try {
        var now = Date.now();
        var last = CSB.settings.get('updates.lastCheck', 0) || 0;
        if (now - last < 3600 * 1000) return;
        var repo = String(CSB.settings.get('updates.repo', '') || '').trim();
        if (!repo || repo.split('/').length !== 2) return;
        var cur = chrome.runtime.getManifest().version;
        var rel = await this.fetchLatestRelease(repo);
        CSB.settings.set('updates.lastCheck', now);
        var latest = rel.version;
        if (!latest || compareVersions(latest, cur) <= 0) return;
        if (CSB.settings.get('updates.dismissed', '') === latest) return;
        var url = rel.url;
        this.modal('Update available',
          '<p>A newer version of CashSkillBD is available: <b>v' + U.esc(latest) + '</b> (you have v' + U.esc(cur) + ').</p>' +
          '<p><a href="' + U.esc(url) + '" target="_blank" rel="noopener">Download the update</a></p>' +
          '<p class="csb-hint">Download the zip, extract it, then reload the extension at chrome://extensions.</p>',
          function () { CSB.settings.set('updates.dismissed', latest); });
      } catch (e) {}
    },

    /** Check the latest GitHub release against the installed version. */
    checkForUpdates: async function () {
      var self = this;
      var repo = String(CSB.settings.get('updates.repo', '') || '').trim()
        .replace(/^\/+|\/+$/g, '');
      var cur = chrome.runtime.getManifest().version;
      this.closeModals();
      if (!repo || repo.split('/').length !== 2) {
        this.modal('Check for updates',
          '<p>Update checking is not configured in this build.</p>');
        return;
      }
      this.modal('Check for updates', '<p>Checking <span class="csb-kbd">' + U.esc(repo) + '</span>…</p>');
      try {
        var rel = await this.fetchLatestRelease(repo);
        var latest = rel.version;
        var cmp = compareVersions(latest, cur);
        self.closeModals();
        if (cmp > 0) {
          var url = rel.url;
          self.modal('Update available',
            '<p>A newer version is available: <b>v' + U.esc(latest) + '</b> (you have v' + U.esc(cur) + ').</p>' +
            (rel.name ? '<p>' + U.esc(String(rel.name)).slice(0, 200) + '</p>' : '') +
            '<p><a href="' + U.esc(url) + '" target="_blank" rel="noopener">Download the update</a></p>' +
            '<p class="csb-hint">Unpacked extensions can’t update themselves: download the zip, extract it, then reload the extension at chrome://extensions.</p>',
            function () { CSB.settings.set('updates.dismissed', latest); });
        } else {
          self.modal('Check for updates',
            '<p>You are running <b>CashSkillBD v' + U.esc(cur) + '</b> — the latest release' +
            (latest ? ' (<span class="csb-kbd">v' + U.esc(latest) + '</span>)' : '') + '.</p>');
        }
      } catch (e) {
        self.closeModals();
        var reason = e && e.message ? ' (' + U.esc(String(e.message)) + ')' : '';
        self.modal('Check for updates',
          '<p>Could not check for updates' + reason + '. Make sure <span class="csb-kbd">' + U.esc(repo) + '</span> ' +
          'exists, has at least one release, and you’re online.</p>');
      }
    }
  };

  CSB.settingsUI = settingsUI;
  CSB.compareVersions = compareVersions; // exposed for tests
})();
