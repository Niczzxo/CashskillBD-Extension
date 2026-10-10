/* CashSkillBD — side panel screenshot UI.
 *
 * The capture engine runs in the tab; commands go through CSB.bus and
 * results/progress arrive via CSB.shotPanelUI.onEvent.
 */
'use strict';

(function () {
  var U = CSB.util;

  var ui = {
    mode: 'full',
    hasShot: false,
    busy: false,

    build: function (pane) {
      var U2 = CSB.util;
      var self = this;
      pane.appendChild(U2.el('div', 'csb-title', '📸 Screenshot'));

      var card = U2.el('div', 'csb-card');
      card.innerHTML =
        '<h3>Capture</h3>' +
        '<div class="csb-row" style="margin-bottom:10px">' +
          '<button class="csb-btn csb-btn-primary csb-btn-sm" id="csb-shot-mode-full" type="button" style="flex:1">Full page</button>' +
          '<button class="csb-btn csb-btn-ghost csb-btn-sm" id="csb-shot-mode-area" type="button" style="flex:1">Select area</button>' +
        '</div>' +
        '<button class="csb-btn csb-btn-primary csb-btn-block" id="csb-shot-go" type="button">📸 FULL PAGE SCREENSHOT</button>' +
        '<div class="csb-row" style="margin-top:10px">' +
          '<button class="csb-btn csb-btn-ghost" id="csb-shot-dl" type="button" style="flex:1">💾 DOWNLOAD</button>' +
        '</div>' +
        '<div class="csb-status" id="csb-shot-status"><span class="csb-dot"></span><span>Ready</span></div>' +
        '<div id="csb-shot-preview" style="display:none"></div>' +
        '<p class="csb-hint">Full page captures the entire scrollable page. Select area captures a dragged rectangle. Screenshots are copied to clipboard automatically.</p>';
      pane.appendChild(card);

      var q = function (sel) { return pane.querySelector(sel); };
      this.el = {
        capBtn: q('#csb-shot-go'),
        modeFull: q('#csb-shot-mode-full'),
        modeArea: q('#csb-shot-mode-area'),
        dlBtn: q('#csb-shot-dl'),
        status: q('#csb-shot-status'),
        previewWrap: q('#csb-shot-preview')
      };

      q('#csb-shot-mode-full').addEventListener('click', function () { self.setMode('full'); });
      q('#csb-shot-mode-area').addEventListener('click', function () { self.setMode('area'); });
      q('#csb-shot-go').addEventListener('click', function () { self.capture(); });
      q('#csb-shot-dl').addEventListener('click', function () { self.download(); });
      this.setMode('full');
      this.render();
    },

    setMode: function (mode) {
      this.mode = mode;
      if (!this.el) return;
      var full = mode === 'full';
      this.el.modeFull.className = 'csb-btn csb-btn-sm' + (full ? ' csb-btn-primary' : ' csb-btn-ghost');
      this.el.modeArea.className = 'csb-btn csb-btn-sm' + (full ? ' csb-btn-ghost' : ' csb-btn-primary');
      this.el.capBtn.textContent = full ? '📸 FULL PAGE SCREENSHOT' : '🖼️ SELECT AREA TO CAPTURE';
      this.el.capBtn.setAttribute('aria-label', full ? 'Capture full page' : 'Select an area to capture');
    },

    setStatus: function (kind, msg) {
      if (!this.el) return;
      this.el.status.className = 'csb-status' + (kind ? ' csb-' + kind : '');
      this.el.status.innerHTML =
        (kind === 'busy' ? '<span class="csb-spinner"></span>' : '<span class="csb-dot"></span>') +
        '<span>' + U.esc(msg) + '</span>';
    },

    render: function () {
      if (!this.el) return;
      this.el.capBtn.disabled = this.busy;
      this.el.dlBtn.disabled = !this.hasShot || this.busy;
    },

    showPreview: function (dataUrl) {
      var wrap = this.el.previewWrap;
      wrap.innerHTML = '';
      wrap.style.display = '';
      var img = document.createElement('img');
      img.className = 'csb-preview-img';
      img.src = dataUrl;
      img.alt = 'Screenshot preview';
      wrap.appendChild(img);
    },

    capture: function () {
      var self = this;
      this.busy = true;
      this.render();
      // Watchdog: if the tab never answers (crash / tab switch with no
      // events), don't wedge the UI forever (H-1).
      if (this._watchdog) clearTimeout(this._watchdog);
      this._watchdog = setTimeout(function () {
        if (self.busy) {
          self.busy = false;
          self.setStatus('err', 'Capture timed out. Please try again.');
          self.render();
        }
      }, 90000);
      var cmd = this.mode === 'area' ? 'shot.area' : 'shot.full';
      CSB.bus.cmd(cmd).catch(function (e) {
        if (self._watchdog) { clearTimeout(self._watchdog); self._watchdog = null; }
        self.busy = false;
        self.setStatus('err', (e && e.message) || 'Could not capture.');
        self.render();
      });
    },

    copy: function () {
      // Panel-side copy: more reliable than the tab's content script
      // (clipboard write needs extension context after async capture).
      this.copyFromDataUrl(false);
    },

    download: function () {
      var self = this;
      if (!this.hasShot) return;
      CSB.bus.cmd('shot.download').then(function () {
        CSB.panel.toast('Downloading screenshot');
      }).catch(function () {
        self.setStatus('err', 'Download failed.');
      });
    },

    onEvent: function (evt, d) {
      if (evt === 'shot.status') {
        this.setStatus(d.kind, d.msg);
        if (d.kind === 'busy') this.busy = true;
        else {
          this.busy = false; // ok / err / '' (e.g. selection cancelled) end the busy phase
          if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
        }
        this.render();
      } else if (evt === 'shot.result') {
        this.busy = false;
        if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
        this.hasShot = true;
        if (d.dataUrl) {
          this.dataUrl = d.dataUrl;
          this.showPreview(d.dataUrl);
          // Auto-copy after capture: do it here in the panel (extension)
          // context — clipboard writes from the tab's content script are
          // unreliable after async capture (user activation expires).
          // Full-page uses copyAfterCapture; area uses autoCopyArea.
          var wantCopy = d.area
            ? CSB.settings.get('screenshot.autoCopyArea', true)
            : CSB.settings.get('screenshot.copyAfterCapture', true);
          if (wantCopy) {
            this.copyFromDataUrl(true);
          }
        }
        this.render();
      }
    },

    copyFromDataUrl: async function (silent) {
      var self = this;
      var dataUrl = this.dataUrl;
      if (!dataUrl) { if (!silent) self.setStatus('err', 'Capture a screenshot first.'); return false; }
      // Try service worker first (has clipboardWrite permission, no user activation needed).
      // Fall back to panel clipboard on failure.
      var swOk = await new Promise(function (resolve) {
        try {
          chrome.runtime.sendMessage(
            { type: 'CSB_CLIPBOARD_WRITE_IMAGE', dataUrl: dataUrl },
            function (res) { resolve(!!(res && res.ok)); }
          );
        } catch (e) { resolve(false); }
      });
      if (swOk) {
        CSB.panel.toast('Screenshot copied to clipboard');
        return true;
      }
      try {
        var res = await fetch(dataUrl);
        var blob = await res.blob();
        if (!blob || !blob.size) throw new Error('encode failed');
        var mime = blob.type || 'image/png';
        await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
        CSB.panel.toast('Screenshot copied to clipboard');
        return true;
      } catch (e) {
        // Chrome requires user activation for clipboard writes. Auto-copy
        // (triggered by capture completion, not a click) gets NotAllowedError.
        // Don't scare the user with a red error for auto-copy — just hint.
        if (e && e.name === 'NotAllowedError') {
          if (silent) {
            CSB.panel.toast('Click COPY to copy the screenshot');
          } else {
            self.setStatus('err', 'Clipboard blocked — click COPY again.');
          }
        } else {
          self.setStatus('err', 'Clipboard access is unavailable.');
        }
        return false;
      }
    },
  };

  CSB.shotPanelUI = ui;
})();
