/* CashSkillBD — side panel app (Chrome native side panel).
 *
 * The UI lives here, in an extension page. Tab-side engines (typing,
 * screenshot, OCR, page translation, force copy) run in the tab's content
 * scripts; this file talks to them through CSB.bus (chrome.tabs.sendMessage)
 * and receives engine events through CSB.bridge (chrome.runtime.sendMessage).
 */
'use strict';

(function () {
  var U = CSB.util;
  CSB.IS_SIDEPANEL = true;

  /* ---------- page-level layout (component styles come from CSB.CSS) ---------- */
  var css = document.createElement('style');
  css.textContent = (CSB.CSS || '') +
    '\nhtml,body{margin:0;padding:0;height:100%;}' +
    '\nbody{background:#101010;overflow:hidden;}' +
    '\n#csb-sp-root.csb-root{display:flex;flex-direction:column;height:100vh;width:100%;overflow:hidden;container-type:inline-size;}' +
    '\n.csb-sp-body{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;}' +
    '\n.csb-sp-body .csb-pane{display:none;}' +
    '\n.csb-sp-body .csb-pane.csb-active{display:block;animation:csbFadeUp .25s ease;}' +
    '\n@keyframes csbFadeUp{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}';
  document.head.appendChild(css);

  var root = document.getElementById('csb-sp-root');
  root.className = 'csb-root';

  /* ---------- CSB.panel compatibility (shared UI modules call these) ---------- */
  function applyTheme() {
    try { root.setAttribute('data-theme', CSB.settings.effectiveTheme()); } catch (e) {}
    var accent = CSB.settings.get('appearance.accent', 'red');
    var color = accent === 'custom' ? CSB.settings.get('appearance.customAccent', '#D7263D') : '#D7263D';
    root.style.setProperty('--csb-accent', color);
    root.style.setProperty('--csb-accent-soft', color + '1f');
  }

  CSB.panel = {
    root: root,
    isOpen: true,
    toast: function (msg, ms) {
      try {
        var t = U.el('div', 'csb-toast', U.esc(String(msg == null ? '' : msg)));
        root.appendChild(t);
        setTimeout(function () { try { t.remove(); } catch (e) {} }, ms || 2600);
      } catch (e) {}
    },
    logoUrl: function () {
      try { return chrome.runtime.getURL('icons/icon-128.png'); } catch (e) { return ''; }
    },
    applySettings: applyTheme
  };

  /* ---------- forceCopy shim: setting change also applies live in the tab ---------- */
  CSB.forceCopy = {
    setEnabled: function (on) {
      CSB.settings.set('forceCopy.enabled', !!on);
      CSB.bus.cmd('forcecopy.set', { on: !!on }).catch(function () {});
    }
  };

  /* ---------- bus: side panel -> active tab ---------- */
  var currentTabId = null;

  async function resolveTab() {
    try {
      var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0] && tabs[0].id != null) {
        currentTabId = tabs[0].id;
        return currentTabId;
      }
    } catch (e) {}
    return currentTabId;
  }

  CSB.bus = {
    _send: async function (tabId, cmdName, args) {
      var res = await chrome.tabs.sendMessage(tabId, { type: 'CSB_BUS', cmd: cmdName, args: args || {} });
      if (!res || res.ok === false) throw new Error((res && res.error) || 'Command failed.');
      return res.data || {};
    },
    _staleErr: function (e) {
      return /receiving end does not exist|could not establish connection/i
        .test(String((e && e.message) || ''));
    },
    cmd: async function (cmdName, args) {
      var self = this;
      var tabId = await resolveTab();
      if (tabId == null) throw new Error('No active tab.');
      try {
        return await self._send(tabId, cmdName, args);
      } catch (e) {
        if (self._staleErr(e)) {
          // Tab predates the install/update: inject fresh scripts, retry once.
          try {
            await chrome.runtime.sendMessage({ type: 'CSB_ENSURE_CONTENT', tabId: tabId });
            await U.sleep(400);
            return await self._send(tabId, cmdName, args);
          } catch (e2) {
            throw new Error('Please reload this page, then try again.');
          }
        }
        throw new Error('CashSkillBD cannot run on this page.');
      }
    },
    tabId: function () { return currentTabId; }
  };

  /* ---------- pageTranslate proxy (the engine lives in the tab) ---------- */
  CSB.pageTranslate = {
    state: 'idle',
    detectedLang: null,
    targetLang: function () { return CSB.settings.get('translation.targetLanguage', 'en'); },
    refresh: async function () {
      try {
        var d = await CSB.bus.cmd('pt.state');
        this.state = (d && d.state) || 'idle';
        this.detectedLang = (d && d.detectedLang) || null;
      } catch (e) {
        this.state = 'idle';
        this.detectedLang = null;
      }
    },
    translatePage: async function () {
      await CSB.bus.cmd('pt.go');
      await this.refresh();
    },
    restorePage: function () {
      CSB.bus.cmd('pt.restore').catch(function () {});
      this.state = 'idle';
    }
  };

  /* ---------- translate "use selected text" reads the tab's selection ---------- */
  CSB.translate.useSelection = async function () {
    var sel = '';
    try {
      var r = await CSB.bus.cmd('selection.get');
      sel = (r && r.text) || '';
    } catch (e) {}
    if (sel && sel.trim()) {
      this.ui.input.value = sel.trim().slice(0, 5000);
      this.onInput();
    } else {
      this.setStatus('err', 'No text is selected on the page.');
    }
  };

  /* ---------- frame ---------- */
  var TABS = [
    { id: 'typing', label: 'Typing', icon: '⌨️' },
    { id: 'translate', label: 'Translate', icon: '🌐' },
    { id: 'screenshot', label: 'Screenshot', icon: '📸' },
    { id: 'ocr', label: 'Text Select', icon: '🔤' },
    { id: 'settings', label: 'Settings', icon: '⚙️' }
  ];

  var panesEl = {};
  var activeTab = 'typing';

  function buildFrame() {
    var head = U.el('div', 'csb-head');
    var logo = U.el('img', 'csb-logo');
    logo.src = CSB.panel.logoUrl();
    logo.alt = 'CashSkillBD';
    head.appendChild(logo);
    var brand = U.el('div', 'csb-brand',
      '<div class="csb-brand-name">CashSkill<span class="csb-bd">BD</span></div>');
    head.appendChild(brand);
    root.appendChild(head);

    var nav = U.el('div', 'csb-nav');
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', 'CashSkillBD tools');
    TABS.forEach(function (t) {
      var b = U.el('button', 'csb-tab',
        '<span class="csb-ico">' + t.icon + '</span>' +
        '<span class="csb-tab-label">' + U.esc(t.label) + '</span>');
      b.type = 'button';
      b.dataset.tab = t.id;
      b.setAttribute('role', 'tab');
      b.addEventListener('click', function () { switchTab(t.id, true); });
      nav.appendChild(b);
    });
    root.appendChild(nav);

    var body = U.el('div', 'csb-sp-body');
    TABS.forEach(function (t) {
      var p = U.el('div', 'csb-pane');
      p.dataset.pane = t.id;
      p.setAttribute('role', 'tabpanel');
      body.appendChild(p);
      panesEl[t.id] = p;
    });
    root.appendChild(body);
  }

  function switchTab(id, save) {
    activeTab = id;
    var btns = root.querySelectorAll('.csb-tab');
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle('csb-active', b.dataset.tab === id);
    });
    TABS.forEach(function (t) {
      if (panesEl[t.id]) panesEl[t.id].classList.toggle('csb-active', t.id === id);
    });
    if (save && CSB.settings.get('panel.rememberLastTab', true)) {
      try { chrome.storage.session.set({ csb_last_tab: id }); } catch (e) {}
    }
  }

  /* ---------- engine events (tab -> panel) ---------- */
  function refreshPageCard() {
    try {
      var go = panesEl.translate && panesEl.translate.querySelector('#csb-tr-pagego');
      var card = go && go.closest('.csb-card');
      if (card && card._csbRefresh) card._csbRefresh();
    } catch (e) {}
  }

  function routeEvent(evt, d) {
    if (evt.indexOf('typing.') === 0) {
      if (CSB.typingPanelUI) CSB.typingPanelUI.onEvent(evt, d);
    } else if (evt.indexOf('shot.') === 0) {
      if (CSB.shotPanelUI) CSB.shotPanelUI.onEvent(evt, d);
    } else if (evt.indexOf('ocr.') === 0) {
      if (CSB.ocrPanelUI) CSB.ocrPanelUI.onEvent(evt, d);
    } else if (evt === 'pt.state') {
      CSB.pageTranslate.state = (d && d.state) || 'idle';
      CSB.pageTranslate.detectedLang = (d && d.detectedLang) || null;
      refreshPageCard();
    }
  }

  chrome.runtime.onMessage.addListener(function (msg, sender) {
    if (!msg || msg.type !== 'CSB_EVT') return false;
    var tabId = sender && sender.tab && sender.tab.id;
    if (tabId == null || tabId !== currentTabId) return false;
    try { routeEvent(msg.evt, msg.data || {}); } catch (e) {}
    return false;
  });

  // Follow the active tab so the "This page" card stays accurate.
  chrome.tabs.onActivated.addListener(async function (info) {
    if (info && info.tabId != null) {
      currentTabId = info.tabId;
      await CSB.pageTranslate.refresh();
      refreshPageCard();
    }
  });

  /* ---------- keyboard-shortcut commands handed off by the worker ---------- */
  async function consumePendingCommand() {
    var cmd = null;
    try {
      var r = await chrome.storage.session.get('csb_pending_cmd');
      cmd = r && r.csb_pending_cmd;
      if (cmd) await chrome.storage.session.remove('csb_pending_cmd');
    } catch (e) {}
    if (!cmd || cmd === 'open-panel') return;
    if (cmd === 'start-typing') {
      switchTab('typing', true);
      setTimeout(function () { if (CSB.typingPanelUI) CSB.typingPanelUI.start(); }, 350);
    } else if (cmd === 'take-screenshot') {
      switchTab('screenshot', true);
      setTimeout(function () { if (CSB.shotPanelUI) CSB.shotPanelUI.capture(); }, 350);
    } else if (cmd === 'text-select') {
      switchTab('ocr', true);
      setTimeout(function () { if (CSB.ocrPanelUI) CSB.ocrPanelUI.select(); }, 350);
    }
  }

  /* ---------- boot ---------- */
  CSB.settings.load().then(async function () {
    buildFrame();
    applyTheme();
    if (CSB.typingPanelUI) CSB.typingPanelUI.build(panesEl.typing);
    if (CSB.translateUI) CSB.translateUI.build(panesEl.translate);
    if (CSB.shotPanelUI) CSB.shotPanelUI.build(panesEl.screenshot);
    if (CSB.ocrPanelUI) CSB.ocrPanelUI.build(panesEl.ocr);
    if (CSB.settingsUI) CSB.settingsUI.build(panesEl.settings);

    await resolveTab();
    // Self-heal stale tabs (opened before install/update): make sure our
    // content scripts are in the tab so commands don't error.
    if (currentTabId != null) {
      try {
        await chrome.tabs.sendMessage(currentTabId, { type: 'CSB_PING' });
      } catch (e) {
        if (/receiving end does not exist|could not establish connection/i.test(String((e && e.message) || ''))) {
          try { await chrome.runtime.sendMessage({ type: 'CSB_ENSURE_CONTENT', tabId: currentTabId }); } catch (e2) {}
        }
      }
    }
    await CSB.pageTranslate.refresh();
    refreshPageCard();

    var last = 'typing';
    try {
      if (CSB.settings.get('panel.rememberLastTab', true)) {
        var r = await chrome.storage.session.get('csb_last_tab');
        if (r && r.csb_last_tab && panesEl[r.csb_last_tab]) last = r.csb_last_tab;
      }
    } catch (e) {}
    switchTab(last, false);
    consumePendingCommand();
    // Automatic update check: pops up only when a new, undismissed
    // release exists (throttled to once a day).
    if (CSB.settingsUI && CSB.settingsUI.autoCheck) {
      setTimeout(function () {
        try { CSB.settingsUI.autoCheck(); } catch (e) {}
      }, 2000);
    }
  });
})();
