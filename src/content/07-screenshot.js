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
      var sheet = null;
      try {
        sheet = new CSSStyleSheet();
        sheet.replaceSync('.csb-cap-hide{display:none !important;}');
        document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sheet]);
        var vw = window.innerWidth, vh = window.innerHeight;
        var all = document.body ? document.body.getElementsByTagName('*') : [];
        for (var i = 0; i < all.length; i++) {
          var elm = all[i];
          if (CSB.panel.host && CSB.panel.host.contains(elm)) continue;
          // Cheap pre-filter: skip elements with no inline fixed/sticky hint
          // AND no computed check yet — we still need computed for CSS classes,
          // but first skip off-viewport nodes without touching style (7-1).
          var r = elm.getBoundingClientRect();
          if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
          var pos = window.getComputedStyle(elm).position;
          if (pos === 'fixed' || pos === 'sticky') {
            elm.classList.add('csb-cap-hide');
            hidden.push(elm);
          }
        }
        return { hidden: hidden, sheet: sheet };
      } catch (e) {
        return { hidden: hidden, sheet: null };
      }
    },

    unhideFixed: function (ctx) {
      try {
        ctx.hidden.forEach(function (elm) { elm.classList.remove('csb-cap-hide'); });
        // 7-2: remove by identity, not stale index — a page mutation between
        // hide and unhide must not remove the page's own stylesheet.
        if (ctx.sheet) {
          document.adoptedStyleSheets = document.adoptedStyleSheets.filter(function (s) {
            return s !== ctx.sheet;
          });
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
        var methodLabel = self.captureMethod === 'stitch' ? 'stitched' :
          self.captureMethod === 'debugger-sections' ? 'debugger sections' : 'debugger';
        self.setStatus('ok', 'Screenshot ready (' + w + ' × ' + h + ' px, ' + methodLabel + ').');
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
        if (self.debugError) {
          try { console.warn('[CashSkillBD] debugger capture failed:', self.debugError); } catch (e2) {}
        }
        self.setStatus('busy', 'Capturing full page… (stitching)');
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
        // 7-5: guard against a zero viewport height (would loop forever).
        var vh = window.innerHeight || 1;
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
          // 7-3: use the true section height (sections[i].h * dpr), not the
          // image aspect — CDP may round/clamp the returned image size.
          var dh = Math.round(sections[i].h * dpr);
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
      var self = this;
      return new Promise(function (resolve) {
        try {
          chrome.runtime.sendMessage(
            { type: 'CSB_DEBUG_CAPTURE', format: opts.format, quality: opts.quality },
            function (res) {
              if (res && res.ok) resolve(res.dataUrl);
              else {
                self.debugError = (res && res.error) || 'no response';
                resolve(null);
              }
            });
        } catch (e) { self.debugError = String((e && e.message) || e); resolve(null); }
      });
    },

    debugCaptureSections: function (sections, format, quality) {
      var self = this;
      return new Promise(function (resolve) {
        try {
          chrome.runtime.sendMessage(
            { type: 'CSB_DEBUG_CAPTURE_SECTIONS', sections: sections, format: format, quality: quality, dpr: window.devicePixelRatio || 1 },
            function (res) {
              if (res && res.ok) resolve(res.dataUrls);
              else {
                self.debugError = (res && res.error) || 'no response';
                resolve(null);
              }
            });
        } catch (e) { self.debugError = String((e && e.message) || e); resolve(null); }
      });
    },

    /** Scroll-stitch capture (fallback when the debugger is unavailable).
     *
     * ROOT-CAUSE FIX for the "same page repeated vertically" bug:
     * - Every scroll is VERIFIED: target Y → scroll → wait → read actual Y.
     * - A frame is captured ONLY if actual Y matches the target (within 2px).
     * - Each frame records its ACTUAL scroll Y; stitching draws at the actual
     *   position, never the target position.
     * - Duplicate positions are rejected, not stitched.
     * - After 3 failed scroll attempts for a target, the capture aborts with
     *   an honest error instead of producing a broken duplicated image.
     */
    stitchShot: async function () {
      var self = this;
      var origX = window.scrollX, origY = window.scrollY;
      var dpr = window.devicePixelRatio || 1;
      var qualityScale = CSB.settings.get('screenshot.quality', 'high') === 'high' ? 1 : 0.75;
      var scale = dpr * qualityScale;
      var vw = window.innerWidth, vh = window.innerHeight || 1;
      var fullW = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0, vw);
      var fullH = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0, vh);
      var hideCtx = this.hideFixed();
      // Hide scrollbars WITHOUT touching overflow: setting
      // documentElement.style.overflow='hidden' clips the visual viewport so
      // window.scrollTo updates scrollY but captureVisibleTab keeps grabbing
      // the same pixels — the classic "same section repeated" bug.
      var sbSheet = null;
      try {
        sbSheet = new CSSStyleSheet();
        sbSheet.replaceSync(
          '::-webkit-scrollbar{width:0 !important;height:0 !important;}' +
          'html{scroll-behavior:auto !important;}');
        document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sbSheet]);
      } catch (e) {}

      // Capture session state — cleared fresh for every screenshot (req #19).
      var frames = []; // {dataUrl, actualY}
      var capturedYs = [];

      /** Scroll to targetY and verify. Returns actual Y, or null if the page
       *  refuses to reach the target after retries. */
      async function scrollAndVerify(targetY) {
        for (var attempt = 0; attempt < 3; attempt++) {
          window.scrollTo(origX, targetY);
          // Wait for scroll + render (req #14). Poll for position to settle.
          for (var p = 0; p < 10; p++) {
            await U.sleep(60);
            var y = window.scrollY;
            if (Math.abs(y - targetY) <= 2) break;
          }
          await U.sleep(120); // let lazy content render
          var actualY = window.scrollY;
          if (Math.abs(actualY - targetY) <= 2) return actualY;
          // Not there yet — retry (req #3, #4).
        }
        return null;
      }

      try {
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(fullW * scale);
        canvas.height = Math.round(fullH * scale);
        var ctx2d = canvas.getContext('2d');
        ctx2d.fillStyle = '#ffffff';
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);

        // Build the target list: 0, vh, 2*vh, ... + final partial (req #7).
        var targets = [];
        for (var t = 0; t < fullH; t += vh) targets.push(t);
        // Ensure the bottom edge is covered: if the last target doesn't reach
        // fullH - vh, add it (avoids missing content without full duplication).
        var lastCover = targets.length ? targets[targets.length - 1] + vh : 0;
        if (lastCover < fullH - 2) {
          var finalY = Math.max(0, fullH - vh);
          if (!targets.length || Math.abs(finalY - targets[targets.length - 1]) > 2) {
            targets.push(finalY);
          }
        }

        var done = 0;
        for (var i = 0; i < targets.length; i++) {
          var targetY = targets[i];
          // Skip if we already captured this position (req #4, #9).
          var dup = false;
          for (var d = 0; d < capturedYs.length; d++) {
            if (Math.abs(capturedYs[d] - targetY) <= 2) { dup = true; break; }
          }
          if (dup) { done++; continue; }

          var actualY = await scrollAndVerify(targetY);
          if (actualY === null) {
            throw new Error('Unable to scroll the page correctly for full-page capture.');
          }
          // Double-check against history with the ACTUAL position (req #9).
          var dup2 = false;
          for (var d2 = 0; d2 < capturedYs.length; d2++) {
            if (Math.abs(capturedYs[d2] - actualY) <= 2) { dup2 = true; break; }
          }
          if (dup2) { done++; continue; }

          var shot = await self.captureVisibleThrottled();
          frames.push({ dataUrl: shot, actualY: actualY });
          capturedYs.push(actualY);
          done++;
          self.setStatus('busy', 'Capturing full page… ' + Math.round((done / targets.length) * 100) + '%');
        }

        // Stitch using ACTUAL capture positions (req #8).
        for (var f = 0; f < frames.length; f++) {
          var fr = frames[f];
          var img = await U.loadImage(fr.dataUrl);
          var dw = Math.round(fullW * scale);
          // Source: the captured viewport image (device pixels).
          // Dest: positioned at the ACTUAL scroll Y.
          var sy = Math.round(fr.actualY * scale);
          var dh = Math.round(vh * scale);
          // Clip the source if the frame would overflow the canvas bottom.
          var remain = canvas.height - sy;
          var drawH = Math.min(dh, remain);
          if (drawH <= 0) continue;
          // The image may be taller than one viewport in device pixels if
          // the browser captured at full DPR; slice proportionally from top.
          var srcH = img.height * (drawH / dh);
          var srcW = img.width;
          // Center-crop horizontally if the capture is wider than the page
          // (e.g. scrollbar area) — draw only the page width.
          var sx = 0;
          var drawW = Math.round(fullW * scale);
          if (srcW > drawW) {
            sx = Math.round((srcW - drawW) / 2);
            srcW = drawW;
          }
          ctx2d.drawImage(img, sx, 0, srcW, srcH, 0, sy, drawW, drawH);
        }

        // Validate (req #20): we must have covered the page height.
        var maxCovered = 0;
        for (var v = 0; v < capturedYs.length; v++) {
          maxCovered = Math.max(maxCovered, capturedYs[v] + vh);
        }
        if (maxCovered < fullH - vh * 0.5 && capturedYs.length > 0) {
          throw new Error('Screenshot is incomplete — the page could not be fully captured.');
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
        try {
          var sheets = document.adoptedStyleSheets.slice();
          var sbi = sheets.indexOf(sbSheet);
          if (sbi >= 0) sheets.splice(sbi, 1);
          document.adoptedStyleSheets = sheets;
        } catch (e3) {}
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
      return tpl.split('[DATE]').join(U.fmtDate(now)).split('[TIME]').join(U.fmtTime(now)) + '.' + ext;
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
