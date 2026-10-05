/* CashSkillBD — 07-screenshot.js : full-page screenshot engine.
 *
 * Captures the ENTIRE scrollable page (not just the viewport) by scrolling
 * through it in viewport-sized steps, capturing each step via the
 * background worker (chrome.tabs.captureVisibleTab), and stitching the
 * tiles onto one canvas. Fixed/sticky chrome is hidden during capture so
 * sections are not duplicated.
 */
'use strict';

(function () {
  var U = CSB.util;

  var screenshot = {
    state: 'READY', // READY | CAPTURING | PROCESSING | PREVIEW | ERROR
    mode: 'full', // full | area
    canvas: null,
    dataUrl: null,
    ui: null,
    _selecting: false,

    clearPreview: function () {
      this.canvas = null;
      this.dataUrl = null;
      this.state = 'READY';
      if (this.ui) {
        this.ui.previewWrap.innerHTML = '';
        this.ui.previewWrap.style.display = 'none';
        this.setStatus('', 'Ready');
        this.ui.copyBtn.disabled = true;
        this.ui.dlBtn.disabled = true;
      }
    },

    captureVisible: function () {
      return new Promise(function (resolve, reject) {
        try {
          chrome.runtime.sendMessage({ type: 'CSB_CAPTURE_VISIBLE' }, function (res) {
            if (res && res.ok) resolve(res.dataUrl);
            else reject(new Error((res && res.error) || 'Unable to capture this page. Please try again.'));
          });
        } catch (e) { reject(e); }
      });
    },

    /** Capture with quota throttling: Chrome allows ~2 captures/second. */
    _lastCap: 0,
    captureVisibleThrottled: async function () {
      var gap = Date.now() - this._lastCap;
      if (gap < 600) await U.sleep(600 - gap);
      for (var attempt = 0; attempt < 4; attempt++) {
        try {
          var shot = await this.captureVisible();
          this._lastCap = Date.now();
          return shot;
        } catch (e) {
          var msg = String((e && e.message) || e);
          if (/MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND|quota/i.test(msg) && attempt < 3) {
            await U.sleep(800 * (attempt + 1));
            continue;
          }
          throw e;
        }
      }
      throw new Error('Unable to capture this page. Please try again.');
    },

    /** Hide fixed/sticky elements that would otherwise repeat on every tile. */
    hideFixed: function () {
      var hidden = [];
      try {
        var sheet = new CSSStyleSheet();
        sheet.replaceSync('.csb-cap-hide{display:none !important;}');
        var idx = document.adoptedStyleSheets.length;
        document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sheet]);
        var vw = window.innerWidth, vh = window.innerHeight;
        var all = document.body ? document.body.getElementsByTagName('*') : [];
        for (var i = 0; i < all.length; i++) {
          var elm = all[i];
          if (CSB.panel.host && CSB.panel.host.contains(elm)) continue;
          var r = elm.getBoundingClientRect();
          if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
          var pos = window.getComputedStyle(elm).position;
          if (pos === 'fixed' || pos === 'sticky') {
            elm.classList.add('csb-cap-hide');
            hidden.push(elm);
          }
        }
        return { hidden: hidden, sheetIndex: idx };
      } catch (e) {
        return { hidden: hidden, sheetIndex: -1 };
      }
    },

    unhideFixed: function (ctx) {
      try {
        ctx.hidden.forEach(function (elm) { elm.classList.remove('csb-cap-hide'); });
        if (ctx.sheetIndex >= 0) {
          var sheets = document.adoptedStyleSheets.slice();
          sheets.splice(ctx.sheetIndex, 1);
          document.adoptedStyleSheets = sheets;
        }
      } catch (e) {}
    },

    capture: async function () {
      var self = this;
      if (this.state === 'CAPTURING' || this.state === 'PROCESSING') return;
      this.state = 'CAPTURING';
      this.setStatus('busy', 'Capturing full page…');
      this.render();

      // Hide our own in-tab host during capture so it never appears in the shot.
      var panelWasHidden = false;
      try {
        if (CSB.panel.host) { CSB.panel.host.style.visibility = 'hidden'; panelWasHidden = true; }
        CSB.panel.shiftPage(false);
      } catch (e0) {}

      var finishOk = function (w, h) {
        self.state = 'PREVIEW';
        self.showPreview();
        if (CSB.bridge) { try { CSB.bridge.emit('shot.result', { dataUrl: self.dataUrl, w: w, h: h }); } catch (e) {} }
        self.setStatus('ok', 'Screenshot ready (' + w + ' × ' + h + ' px).');
        if (CSB.settings.get('notifications.screenshotCompleted', true)) {
          U.notify('CashSkillBD', 'Full-page screenshot captured.');
        }
        if (CSB.settings.get('screenshot.copyAfterCapture', false)) self.copy(true);
        if (CSB.settings.get('screenshot.autoDownload', false)) self.download();
      };

      try {
        // 1) Pixel-perfect debugger capture first (no scrolling, no glitches).
        var dbg = await this.debuggerShot();
        if (dbg) {
          this.canvas = dbg.canvas;
          this.dataUrl = dbg.dataUrl;
          this.captureMethod = dbg.method || 'debugger';
          finishOk(dbg.w, dbg.h);
          return;
        }
        // 2) Fall back to scroll stitching when the debugger is unavailable.
        var st = await this.stitchShot();
        this.canvas = st.canvas;
        this.dataUrl = st.dataUrl;
        this.captureMethod = 'stitch';
        finishOk(st.w, st.h);
      } catch (e) {
        this.state = 'ERROR';
        this.setStatus('err', (e && e.message) || 'Unable to capture this page. Please try again.');
      } finally {
        try {
          if (panelWasHidden && CSB.panel.host) CSB.panel.host.style.visibility = '';
          if (CSB.panel.isOpen) CSB.panel.shiftPage(true);
        } catch (e0) {}
        this.render();
      }
    },

    /** Full-page capture via the debugger: pixel-perfect, no scrolling.
     * Normal pages: one shot with captureBeyondViewport.
     * Very tall pages (>14k px, beyond the single-shot limit): section
     * captures via clip (still no scrolling — tiles can never repeat/tear),
     * stitched on a canvas here.
     * Returns {canvas, dataUrl, w, h, method}, or null when unavailable. */
    debuggerShot: async function () {
      var format = CSB.settings.get('screenshot.format', 'png');
      var jpeg = format === 'jpg';
      var quality = CSB.settings.get('screenshot.quality', 'high') === 'high' ? 92 : 80;
      var fullW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
      var fullH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      var hideCtx = this.hideFixed();
      try {
        if (fullH <= 14000) {
          var dataUrl = await this.debugCapture({ format: jpeg ? 'jpeg' : 'png', quality: quality });
          if (!dataUrl) return null;
          var img = await U.loadImage(dataUrl);
          var canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          canvas.getContext('2d').drawImage(img, 0, 0);
          return { canvas: canvas, dataUrl: dataUrl, w: img.width, h: img.height, method: 'debugger' };
        }
        // Tall page: capture viewport-height sections, stitch them.
        var vh = window.innerHeight;
        var sections = [];
        for (var y = 0; y < fullH; y += vh) {
          sections.push({ x: 0, y: y, w: fullW, h: Math.min(vh, fullH - y) });
        }
        var dataUrls = await this.debugCaptureSections(sections, jpeg ? 'jpeg' : 'png', quality);
        if (!dataUrls || !dataUrls.length) return null;
        var dpr = window.devicePixelRatio || 1;
        var canvas2 = document.createElement('canvas');
        canvas2.width = Math.round(fullW * dpr);
        canvas2.height = Math.round(fullH * dpr);
        var ctx = canvas2.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas2.width, canvas2.height);
        for (var i = 0; i < dataUrls.length; i++) {
          var simg = await U.loadImage(dataUrls[i]);
          var sy = Math.round(sections[i].y * dpr);
          var dw = canvas2.width;
          var dh = Math.round(simg.height * (dw / simg.width));
          ctx.drawImage(simg, 0, sy, dw, dh);
          this.setStatus('busy', 'Capturing full page… ' + Math.round(((i + 1) / dataUrls.length) * 100) + '%');
        }
        var mime = jpeg ? 'image/jpeg' : 'image/png';
        return {
          canvas: canvas2,
          dataUrl: canvas2.toDataURL(mime, jpeg ? quality / 100 : undefined),
          w: canvas2.width, h: canvas2.height, method: 'debugger-sections'
        };
      } finally {
        this.unhideFixed(hideCtx);
      }
    },

    debugCapture: function (opts) {
      return new Promise(function (resolve) {
        try {
          chrome.runtime.sendMessage(
            { type: 'CSB_DEBUG_CAPTURE', format: opts.format, quality: opts.quality },
            function (res) { resolve(res && res.ok ? res.dataUrl : null); });
        } catch (e) { resolve(null); }
      });
    },

    debugCaptureSections: function (sections, format, quality) {
      return new Promise(function (resolve) {
        try {
          chrome.runtime.sendMessage(
            { type: 'CSB_DEBUG_CAPTURE_SECTIONS', sections: sections, format: format, quality: quality },
            function (res) { resolve(res && res.ok ? res.dataUrls : null); });
        } catch (e) { resolve(null); }
      });
    },

    /** Legacy scroll-stitch capture (fallback when the debugger is unavailable). */
    stitchShot: async function () {
      var origX = window.scrollX, origY = window.scrollY;
      var dpr = window.devicePixelRatio || 1;
      var qualityScale = CSB.settings.get('screenshot.quality', 'high') === 'high' ? 1 : 0.75;
      var scale = dpr * qualityScale;
      var vw = window.innerWidth, vh = window.innerHeight;
      var fullW = Math.max(document.documentElement.scrollWidth, vw);
      var fullH = Math.max(document.documentElement.scrollHeight, vh);
      var hideCtx = this.hideFixed();
      var de = document.documentElement;
      var prevOverflow = de.style.overflow;

      try {
        // Minimizing layout shift: hide scrollbars during capture.
        de.style.overflow = 'hidden';

        var canvas = document.createElement('canvas');
        canvas.width = Math.round(vw * scale);
        canvas.height = Math.round(fullH * scale);
        var ctx2d = canvas.getContext('2d');
        ctx2d.fillStyle = '#ffffff';
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);

        var steps = Math.max(1, Math.ceil(fullH / vh));
        var stuckCount = 0;
        for (var i = 0; i < steps; i++) {
          var y = Math.min(i * vh, fullH - vh);
          window.scrollTo(origX, y);
          await U.sleep(280); // let lazy content settle
          // If the page refuses to scroll (custom scroller / overflow lock),
          // we'd capture the same viewport repeatedly — abort instead of
          // producing a broken image with duplicated sections.
          if (Math.abs(window.scrollY - y) > 2) {
            stuckCount++;
            if (stuckCount >= 2) {
              throw new Error('This page blocks programmatic scrolling, so a stitched full-page capture is not possible here.');
            }
          } else {
            stuckCount = 0;
          }
          var shot = await this.captureVisibleThrottled();
          var img = await U.loadImage(shot);
          var dw = Math.round(vw * scale), dh = Math.round(vh * scale);
          var sy = Math.round(y * scale);
          // Last tile may be shorter than a viewport.
          var remain = canvas.height - sy;
          var sh = Math.min(dh, remain);
          if (sh > 0) {
            // Draw only the needed slice of the tile.
            var srcH = img.height * (sh / dh);
            ctx2d.drawImage(img, 0, img.height - srcH, img.width, srcH, 0, sy, dw, sh);
          }
          this.setStatus('busy', 'Capturing full page… ' + Math.round(((i + 1) / steps) * 100) + '%');
        }

        window.scrollTo(origX, origY);

        this.state = 'PROCESSING';
        this.setStatus('busy', 'Processing image…');
        await U.sleep(50);

        var format = CSB.settings.get('screenshot.format', 'png');
        var mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
        var q = format === 'jpg' ? (CSB.settings.get('screenshot.quality', 'high') === 'high' ? 0.95 : 0.85) : undefined;
        return { canvas: canvas, dataUrl: canvas.toDataURL(mime, q), w: canvas.width, h: canvas.height };
      } catch (e) {
        try { window.scrollTo(origX, origY); } catch (e2) {}
        throw e;
      } finally {
        try { de.style.overflow = prevOverflow; } catch (e3) {}
        this.unhideFixed(hideCtx);
      }
    },

    showPreview: function () {
      if (!this.ui) return;
      var wrap = this.ui.previewWrap;
      wrap.innerHTML = '';
      wrap.style.display = '';
      var img = document.createElement('img');
      img.className = 'csb-preview-img';
      img.src = this.dataUrl;
      img.alt = 'Full page screenshot preview';
      wrap.appendChild(img);
    },

    filename: function () {
      var tpl = CSB.settings.get('screenshot.filenameTemplate', 'CashSkillBD_FullPage_[DATE]_[TIME]');
      var now = new Date();
      var ext = CSB.settings.get('screenshot.format', 'png') === 'jpg' ? 'jpg' : 'png';
      return tpl.replace('[DATE]', U.fmtDate(now)).replace('[TIME]', U.fmtTime(now)) + '.' + ext;
    },

    copy: async function (silent) {
      if (!this.canvas) { if (!silent) this.setStatus('err', 'Capture a screenshot first.'); return false; }
      try {
        var mime = CSB.settings.get('screenshot.format', 'png') === 'jpg' ? 'image/jpeg' : 'image/png';
        var blob = await new Promise(function (res) { this.canvas.toBlob(res, mime, 0.95); }.bind(this));
        if (!blob) throw new Error('encode failed');
        await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
        if (!silent) CSB.panel.toast('Screenshot copied to clipboard');
        return true;
      } catch (e) {
        if (!silent) this.setStatus('err', 'Clipboard access is unavailable.');
        return false;
      }
    },

    /* ---------------- area selection ---------------- */

    setMode: function (mode) {
      this.mode = mode;
      if (!this.ui) return;
      var full = mode === 'full';
      this.ui.modeFull.className = 'csb-btn csb-btn-sm' + (full ? ' csb-btn-primary' : ' csb-btn-ghost');
      this.ui.modeArea.className = 'csb-btn csb-btn-sm' + (full ? ' csb-btn-ghost' : ' csb-btn-primary');
      this.ui.capBtn.textContent = full ? '📸 FULL PAGE SCREENSHOT' : '🖼️ SELECT AREA TO CAPTURE';
      this.ui.capBtn.setAttribute('aria-label', full ? 'Capture full page' : 'Select an area to capture');
    },

    startAreaSelect: function () {
      if (this.state === 'CAPTURING' || this.state === 'PROCESSING' || this._selecting) return;
      var self = this;
      try { if (CSB.panel.ensureHost) CSB.panel.ensureHost(); } catch (e) {}
      var root = CSB.panel.root;
      if (!root) {
        this.setStatus('err', 'Please reload this page, then try again.');
        return;
      }
      this._selecting = true;
      this.setStatus('busy', 'Drag a rectangle — Esc to cancel');
      this.render();

      var overlay = U.el('div', 'csb-select-overlay');
      overlay.style.pointerEvents = 'auto'; // must receive drags (host disables pointer events)
      overlay.setAttribute('role', 'presentation');
      var hint = U.el('div', 'csb-select-hint', '🖼️ Drag to select an area — Esc to cancel');
      var box = U.el('div', 'csb-select-box');
      box.style.display = 'none';
      root.appendChild(hint);
      root.appendChild(overlay);
      overlay.appendChild(box);

      var sx = 0, sy = 0, dragging = false;
      function cleanup() {
        self._selecting = false;
        try { hint.remove(); overlay.remove(); } catch (e) {}
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('keydown', onKey, true);
        self.render();
      }
      function onMove(e) {
        if (!dragging) return;
        box.style.display = '';
        box.style.left = Math.min(e.clientX, sx) + 'px';
        box.style.top = Math.min(e.clientY, sy) + 'px';
        box.style.width = Math.abs(e.clientX - sx) + 'px';
        box.style.height = Math.abs(e.clientY - sy) + 'px';
      }
      function onUp(e) {
        if (!dragging) { cleanup(); return; }
        dragging = false;
        var w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
        var x = Math.min(e.clientX, sx), y = Math.min(e.clientY, sy);
        cleanup();
        if (w < 8 || h < 8) { self.setStatus('err', 'Selection too small — drag a larger area.'); return; }
        self.captureArea({ x: x, y: y, w: w, h: h });
      }
      function onKey(e) {
        if (e.key === 'Escape') { cleanup(); self.setStatus('', 'Ready'); }
      }
      overlay.addEventListener('pointerdown', function (e) {
        dragging = true; sx = e.clientX; sy = e.clientY;
        try { e.preventDefault(); } catch (e2) {}
      });
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('keydown', onKey, true);
    },

    /** Capture just the selected viewport rectangle, then auto-copy it. */
    captureArea: async function (rect) {
      if (this.state === 'CAPTURING' || this.state === 'PROCESSING') return;
      this.state = 'CAPTURING';
      this.setStatus('busy', 'Capturing selected area…');
      this.render();
      // Hide our own panel during capture so it never appears in the shot.
      var panelWasHidden = false;
      try {
        if (CSB.panel.host) { CSB.panel.host.style.visibility = 'hidden'; panelWasHidden = true; }
        CSB.panel.shiftPage(false);
      } catch (e0) {}
      try {
        await U.sleep(150); // let the panel hide before capturing
        var shot = await this.captureVisible();
        var img = await U.loadImage(shot);
        var dpr = window.devicePixelRatio || 1;
        var sx = Math.max(0, Math.round(rect.x * dpr));
        var sy = Math.max(0, Math.round(rect.y * dpr));
        var sw = Math.min(Math.round(rect.w * dpr), img.width - sx);
        var sh = Math.min(Math.round(rect.h * dpr), img.height - sy);
        if (sw < 2 || sh < 2) throw new Error('Selection is outside the visible area.');
        var canvas = document.createElement('canvas');
        canvas.width = sw; canvas.height = sh;
        canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        this.canvas = canvas;
        this.dataUrl = canvas.toDataURL('image/png');
        this.state = 'PREVIEW';
        this.showPreview();
        if (CSB.bridge) { try { CSB.bridge.emit('shot.result', { dataUrl: this.dataUrl, w: sw, h: sh }); } catch (e) {} }
        this.setStatus('ok', 'Area captured (' + sw + ' × ' + sh + ' px).');
        if (CSB.settings.get('notifications.screenshotCompleted', true)) {
          U.notify('CashSkillBD', 'Area screenshot captured.');
        }
        if (CSB.settings.get('screenshot.autoCopyArea', true)) {
          var copied = await this.copy(true);
          if (copied) CSB.panel.toast('Area screenshot copied to clipboard');
        }
      } catch (e) {
        this.state = 'ERROR';
        this.setStatus('err', (e && e.message) || 'Unable to capture the area. Please try again.');
      } finally {
        try {
          if (panelWasHidden && CSB.panel.host) CSB.panel.host.style.visibility = '';
          if (CSB.panel.isOpen) CSB.panel.shiftPage(true);
        } catch (e0) {}
        this.render();
      }
    },

    download: function () {
      if (!this.dataUrl) { this.setStatus('err', 'Capture a screenshot first.'); return; }
      try {
        var a = document.createElement('a');
        a.href = this.dataUrl;
        a.download = this.filename();
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { a.remove(); }, 500);
        CSB.panel.toast('Downloading ' + this.filename());
      } catch (e) {
        this.setStatus('err', 'Download failed. Please try again.');
      }
    },

    setStatus: function (kind, msg) {
      if (CSB.bridge) { try { CSB.bridge.emit('shot.status', { kind: kind, msg: msg }); } catch (e) {} }
      if (!this.ui) return;
      this.ui.status.className = 'csb-status' + (kind ? ' csb-' + kind : '');
      this.ui.statusText.innerHTML =
        (kind === 'busy' ? '<span class="csb-spinner"></span>' : '<span class="csb-dot"></span>') +
        '<span>' + U.esc(msg) + '</span>';
    },

    render: function () {
      if (!this.ui) return;
      var busy = this.state === 'CAPTURING' || this.state === 'PROCESSING' || this._selecting;
      this.ui.capBtn.disabled = busy;
      var has = !!this.dataUrl;
      this.ui.copyBtn.disabled = !has;
      this.ui.dlBtn.disabled = !has;
    }
  };

  CSB.screenshot = screenshot;

  /* ---------------- UI ---------------- */
  CSB.screenshotUI = {
    build: function (pane) {
      var U2 = CSB.util;
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
          '<button class="csb-btn csb-btn-ghost" id="csb-shot-copy" type="button" style="flex:1" disabled>📋 COPY</button>' +
          '<button class="csb-btn csb-btn-ghost" id="csb-shot-dl" type="button" style="flex:1" disabled>💾 DOWNLOAD PNG</button>' +
        '</div>' +
        '<div class="csb-status" id="csb-shot-status"><span class="csb-dot"></span><span>Ready</span></div>' +
        '<div id="csb-shot-preview" style="display:none"></div>' +
        '<p class="csb-hint">Full page captures the entire scrollable page. Select area captures a dragged rectangle and copies it automatically. ' +
        'File name: <span class="csb-kbd" id="csb-shot-fname"></span></p>';
      pane.appendChild(card);

      var q = function (sel) { return pane.querySelector(sel); };
      screenshot.ui = {
        capBtn: q('#csb-shot-go'),
        modeFull: q('#csb-shot-mode-full'),
        modeArea: q('#csb-shot-mode-area'),
        copyBtn: q('#csb-shot-copy'),
        dlBtn: q('#csb-shot-dl'),
        status: q('#csb-shot-status'),
        statusText: q('#csb-shot-status'),
        previewWrap: q('#csb-shot-preview')
      };
      screenshot.ui.statusText = screenshot.ui.status;
      q('#csb-shot-fname').textContent = screenshot.filename();

      q('#csb-shot-mode-full').addEventListener('click', function () { screenshot.setMode('full'); });
      q('#csb-shot-mode-area').addEventListener('click', function () { screenshot.setMode('area'); });
      q('#csb-shot-go').addEventListener('click', function () {
        if (screenshot.mode === 'area') screenshot.startAreaSelect();
        else screenshot.capture();
      });
      q('#csb-shot-copy').addEventListener('click', function () { screenshot.copy(); });
      q('#csb-shot-dl').addEventListener('click', function () { screenshot.download(); });
      screenshot.setMode('full');
      screenshot.render();
    }
  };
})();
