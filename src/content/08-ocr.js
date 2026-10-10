/* CashSkillBD — 08-ocr.js : screen text selection + OCR.
 *
 * The OCR engine (Tesseract.js) is lazy-loaded: the library file is
 * injected by the background worker only on first use, and the WASM
 * core + English/Bangla/Hindi language data live inside the extension
 * package. Other languages (21 supported) download their traineddata
 * on first use from a CDN and are cached afterwards.
 *
 * Supported OCR languages: 21 (see OCR_LANGS below); auto → English.
 */
'use strict';

(function () {
  var U = CSB.util;

  // [UI code, label, Tesseract code]. Non-bundled languages download
  // their traineddata on first use (CDN), then Tesseract caches them.
  var OCR_LANGS = [
    ['auto', 'Auto Detect', 'eng'],
    ['en', 'English', 'eng'],
    ['bn', 'Bangla', 'ben'],
    ['hi', 'Hindi', 'hin'],
    ['zh-CN', 'Chinese (Simplified)', 'chi_sim'],
    ['zh-TW', 'Chinese (Traditional)', 'chi_tra'],
    ['ar', 'Arabic', 'ara'],
    ['es', 'Spanish', 'spa'],
    ['fr', 'French', 'fra'],
    ['de', 'German', 'deu'],
    ['ru', 'Russian', 'rus'],
    ['ja', 'Japanese', 'jpn'],
    ['ko', 'Korean', 'kor'],
    ['pt', 'Portuguese', 'por'],
    ['it', 'Italian', 'ita'],
    ['tr', 'Turkish', 'tur'],
    ['ur', 'Urdu', 'urd'],
    ['vi', 'Vietnamese', 'vie'],
    ['th', 'Thai', 'tha'],
    ['id', 'Indonesian', 'ind'],
    ['fa', 'Persian', 'fas']
  ];
  var TESS_LANG = {};
  var OCR_LANG_LABEL = {}; // tess code -> label
  OCR_LANGS.forEach(function (o) { TESS_LANG[o[0]] = o[2]; OCR_LANG_LABEL[o[2]] = o[1]; });
  CSB.OCR_LANGS = OCR_LANGS;

  // Languages shipped inside the extension; the rest come from the CDN.
  var BUNDLED_TESS = { eng: 1, ben: 1, hin: 1 };
  var CDN_LANG_PATH = 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0';

  var ocr = {
    state: 'READY', // READY | SELECTING | PROCESSING | RESULT | ERROR
    overlay: null,
    selBox: null,
    startPt: null,
    worker: null,
    workerKey: null,
    ui: null,

    isSelecting: function () { return this.state === 'SELECTING'; },

    clearResult: function () {
      this.resultText = '';
      if (this.ui) {
        this.ui.result.textContent = '';
        this.setStatus('', 'Ready');
      }
      this.state = 'READY';
    },

    tessLang: function () {
      var l = CSB.settings.get('ocr.language', 'auto');
      return TESS_LANG[l] || 'eng';
    },

    /* ---------- selection overlay ---------- */
    startSelection: function () {
      if (this.state === 'SELECTING' || this.state === 'PROCESSING') return;
      try { if (CSB.panel.ensureHost) CSB.panel.ensureHost(); } catch (e) {}
      var root = CSB.panel.root;
      if (!root) {
        this.setStatus('err', 'Please reload this page, then try again.');
        return;
      }
      this.state = 'SELECTING';
      this.setStatus('busy', 'Drag a rectangle around the text… (Esc to cancel)');
      this.render();

      var overlay = U.el('div', 'csb-select-overlay');
      overlay.style.pointerEvents = 'auto'; // must receive drags (host disables pointer events)
      overlay.setAttribute('role', 'presentation');
      var hint = U.el('div', 'csb-select-hint', '🔤 Drag to select a region — Esc to cancel');
      var box = U.el('div', 'csb-select-box');
      box.style.display = 'none';
      root.appendChild(hint);
      root.appendChild(overlay);
      overlay.appendChild(box);

      var self = this;
      var sx = 0, sy = 0, dragging = false;
      // Document coordinates for scroll-aware selection
      var sxDoc = 0, syDoc = 0, lastCX = 0, lastCY = 0;

      function paintDoc(cxDoc, cyDoc) {
        var x = Math.min(cxDoc, sxDoc), y = Math.min(cyDoc, syDoc);
        var w = Math.abs(cxDoc - sxDoc), h = Math.abs(cyDoc - syDoc);
        // Convert to viewport for display
        var vx = x - window.scrollX, vy = y - window.scrollY;
        box.style.display = '';
        box.style.left = vx + 'px';
        box.style.top = vy + 'px';
        box.style.width = w + 'px';
        box.style.height = h + 'px';
        self._rect = { x: x, y: y, w: w, h: h, docCoords: true };
        hint.textContent = '🔤 ' + Math.round(w) + ' × ' + Math.round(h) + ' px — scroll to extend, Esc to cancel';
      }

      function onDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (dragging) return;
        dragging = true;
        sx = e.clientX; sy = e.clientY;
        lastCX = e.clientX; lastCY = e.clientY;
        sxDoc = e.clientX + window.scrollX;
        syDoc = e.clientY + window.scrollY;
        self._rect = null;
        try { overlay.setPointerCapture(e.pointerId); } catch (capErr) {}
        e.preventDefault();
      }

      function onMove(e) {
        if (!dragging) return;
        lastCX = e.clientX; lastCY = e.clientY;
        paintDoc(e.clientX + window.scrollX, e.clientY + window.scrollY);
      }

      function onScroll() {
        if (!dragging) return;
        paintDoc(lastCX + window.scrollX, lastCY + window.scrollY);
      }

      function onUp(e) {
        if (!dragging) return;
        dragging = false;
        paintDoc(e.clientX + window.scrollX, e.clientY + window.scrollY);
        cleanup();
        var r = self._rect;
        if (!r || r.w < 8 || r.h < 8) {
          self.cancelSelection();
          self.setStatus('err', 'Selection too small — try again.');
          return;
        }
        self.processRegion(r);
      }

      function onCancel() {
        if (!dragging) return;
        dragging = false;
        cleanup();
        self.cancelSelection();
        self.setStatus('', 'Ready');
      }

      function onKey(e) {
        if (e.key === 'Escape') {
          dragging = false;
          cleanup();
          self.cancelSelection();
          self.setStatus('', 'Ready');
        }
      }

      function cleanup() {
        overlay.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onCancel, true);
        window.removeEventListener('scroll', onScroll, true);
        document.removeEventListener('keydown', onKey, true);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (hint.parentNode) hint.parentNode.removeChild(hint);
      }

      overlay.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onCancel, true);
      window.addEventListener('scroll', onScroll, true);
      document.addEventListener('keydown', onKey, true);

      this.overlay = overlay;
      this._cleanupOverlay = cleanup;
      this.render();
    },

    cancelSelection: function () {
      if (this._cleanupOverlay) { try { this._cleanupOverlay(); } catch (e) {} this._cleanupOverlay = null; }
      this.overlay = null;
      if (this.state === 'SELECTING') { this.state = 'READY'; this.render(); }
    },

    /* ---------- capture + OCR ---------- */
    processRegion: async function (rect) {
      var self = this;
      this.state = 'PROCESSING';
      this.setStatus('busy', 'Reading text…');
      this.render();
      try {
        var dpr = window.devicePixelRatio || 1;
        var isDocCoords = !!rect.docCoords;
        // Check if rect fits in current viewport
        var vx = isDocCoords ? rect.x - window.scrollX : rect.x;
        var vy = isDocCoords ? rect.y - window.scrollY : rect.y;
        var fitsInViewport = vx >= 0 && vy >= 0 &&
          (vx + rect.w) <= window.innerWidth && (vy + rect.h) <= window.innerHeight;

        var img, cx, cy, cw, ch;
        if (fitsInViewport) {
          // Fast path: capture visible and crop
          var dataUrl = await new Promise(function (resolve, reject) {
            try {
              chrome.runtime.sendMessage({ type: 'CSB_CAPTURE_VISIBLE' }, function (res) {
                if (res && res.ok) resolve(res.dataUrl);
                else reject(new Error((res && res.error) || 'Unable to capture this page. Please try again.'));
              });
            } catch (e) { reject(e); }
          });
          img = await U.loadImage(dataUrl);
          cw = Math.round(rect.w * dpr); ch = Math.round(rect.h * dpr);
          cx = Math.round(vx * dpr); cy = Math.round(vy * dpr);
        } else {
          // Full-page path: capture via screenshot module and crop to document rect
          self.setStatus('busy', 'Capturing page for text…');
          self.render();
          // Use the screenshot module's full-page capture
          var fullShot = await CSB.screenshot.debugCapture({ format: 'png' });
          if (!fullShot) throw new Error('Unable to capture this page.');
          img = await U.loadImage(fullShot);
          cw = Math.round(rect.w * dpr); ch = Math.round(rect.h * dpr);
          cx = Math.round(rect.x * dpr); cy = Math.round(rect.y * dpr);
        }
        // Clamp to the captured image.
        cx = U.clamp(cx, 0, img.width - 1); cy = U.clamp(cy, 0, img.height - 1);
        cw = Math.min(cw, img.width - cx); ch = Math.min(ch, img.height - cy);
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, cw); canvas.height = Math.max(1, ch);
        canvas.getContext('2d').drawImage(img, cx, cy, cw, ch, 0, 0, canvas.width, canvas.height);

        // Upscale tiny regions — Tesseract reads better at higher DPI.
        var scaleUp = 1;
        if (canvas.width < 600) scaleUp = Math.min(3, 900 / canvas.width);
        var work = canvas;
        if (scaleUp > 1.2) {
          work = document.createElement('canvas');
          work.width = Math.round(canvas.width * scaleUp);
          work.height = Math.round(canvas.height * scaleUp);
          var wctx = work.getContext('2d');
          wctx.imageSmoothingEnabled = true;
          wctx.drawImage(canvas, 0, 0, work.width, work.height);
        }

        // Send the captured image to the panel for OCR.
        // (Panel runs in extension context with our CSP, avoiding page CSP issues.)
        var imageDataUrl = work.toDataURL('image/png');
        this.state = 'PROCESSING';
        this.setStatus('busy', 'Extracting text…');
        if (CSB.bridge) { try { CSB.bridge.emit('ocr.image', { image: imageDataUrl }); } catch (e) {} }
        // The panel will do OCR and send back 'ocr.result' with the text.
      } catch (e) {
        this.state = 'ERROR';
        this.setStatus('err', (e && e.message) || 'No readable text was detected.');
      } finally {
        this.render();
      }
    },

    ensureEngine: async function () {
      if (typeof Tesseract !== 'undefined' && Tesseract.createWorker) return;
      // 8-2: dedupe concurrent loads — two recognize() calls must not race.
      if (this._enginePromise) return this._enginePromise;
      var self = this;
      this._enginePromise = (async function () {
        var ok = await new Promise(function (resolve) {
          try {
            chrome.runtime.sendMessage({ type: 'CSB_LOAD_TESSERACT' }, function (res) {
            resolve(!!(res && res.ok));
          });
        } catch (e) { resolve(false); }
      });
      // Wait for Tesseract to become available (injection is async).
      // Retry up to 5 times with 500ms delay.
      for (var i = 0; i < 5; i++) {
        if (typeof Tesseract !== 'undefined' && Tesseract.createWorker) {
          return;
        }
        await new Promise(function (r) { setTimeout(r, 500); });
      }
      if (!ok || typeof Tesseract === 'undefined') {
        self._enginePromise = null; // allow retry on failure
        throw new Error('OCR engine failed to load.');
      }
      })();
      return this._enginePromise;
    },

    getWorker: async function (lang) {
      var accuracy = CSB.settings.get('ocr.accuracy', 'standard');
      var key = lang + '|' + accuracy;
      if (this.worker && this.workerKey === key) return this.worker;
      if (this.worker) { try { await this.worker.terminate(); } catch (e) {} this.worker = null; }
      var base = chrome.runtime.getURL('src/lib/tesseract');
      var isBundled = !!BUNDLED_TESS[lang];
      var langPath = isBundled ? base + '/lang' : CDN_LANG_PATH;
      if (!isBundled) {
        this.setStatus('busy', 'Downloading ' + (OCR_LANG_LABEL[lang] || lang) + ' language pack…');
      }
      try {
        this.worker = await Tesseract.createWorker(lang, Tesseract.OEM.LSTM_ONLY, {
          workerPath: base + '/worker.min.js',
          corePath: base + '/tesseract-core.wasm.js',
          langPath: langPath,
          workerBlobURL: false,
          logger: function () {}
        });
      } catch (e) {
        throw new Error(isBundled
          ? 'OCR engine failed to load.'
          : 'Could not download the ' + (OCR_LANG_LABEL[lang] || lang) + ' language pack. Check your connection and try again.');
      }
      // High accuracy: LSTM only is already the best engine; keep single worker.
      this.workerKey = key;
      return this.worker;
    },

    recognize: async function (canvas) {
      await this.ensureEngine();
      var worker = await this.getWorker(this.tessLang());
      // 8-1: never hang forever — 60s timeout, terminate the worker on stall.
      var self = this;
      var res = await Promise.race([
        worker.recognize(canvas),
        new Promise(function (_, reject) {
          setTimeout(function () { reject(new Error('OCR timed out. Please try a smaller area.')); }, 60000);
        })
      ]).catch(async function (e) {
        try { await worker.terminate(); } catch (te) {}
        self.worker = null;
        throw e;
      });
      return res && res.data ? res.data.text : '';
    },

    copy: async function (silent) {
      var text = this.resultText || '';
      if (!text) { if (!silent) this.setStatus('err', 'Nothing to copy yet.'); return false; }
      try {
        await navigator.clipboard.writeText(text);
        if (!silent) CSB.panel.toast('OCR text copied');
        return true;
      } catch (e) {
        if (!silent) this.setStatus('err', 'Clipboard access is unavailable.');
        return false;
      }
    },

    setStatus: function (kind, msg) {
      if (CSB.bridge) { try { CSB.bridge.emit('ocr.status', { kind: kind, msg: msg }); } catch (e) {} }
      if (!this.ui) return;
      this.ui.status.className = 'csb-status' + (kind ? ' csb-' + kind : '');
      this.ui.statusText.innerHTML =
        (kind === 'busy' ? '<span class="csb-spinner"></span>' : '<span class="csb-dot"></span>') +
        '<span>' + U.esc(msg) + '</span>';
    },

    render: function () {
      if (!this.ui) return;
      var busy = this.state === 'SELECTING' || this.state === 'PROCESSING';
      this.ui.startBtn.disabled = busy;
      this.ui.startBtn.innerHTML = this.state === 'SELECTING' ? 'SELECTING… (Esc to cancel)' : '🔤 START SELECTION';
    }
  };

  CSB.ocr = ocr;

  /* ---------------- UI ---------------- */
  CSB.ocrUI = {
    build: function (pane) {
      var U2 = CSB.util;
      pane.appendChild(U2.el('div', 'csb-title', '🔤 Screen Text Select'));

      var card = U2.el('div', 'csb-card');
      card.innerHTML =
        '<h3>Extract text from any visible region</h3>' +
        '<p class="csb-hint" style="margin:0 0 10px">Works on images, canvas text, and non-selectable content.</p>' +
        '<button class="csb-btn csb-btn-primary csb-btn-block" id="csb-ocr-go" type="button">🔤 START SELECTION</button>' +
        '<div class="csb-status" id="csb-ocr-status"><span class="csb-dot"></span><span>Ready</span></div>' +
        '<h3 style="margin-top:12px">Detected text</h3>' +
        '<div class="csb-result" id="csb-ocr-result" aria-live="polite"></div>' +
        '<div class="csb-row" style="margin-top:10px">' +
          '<button class="csb-btn csb-btn-ghost" id="csb-ocr-copy" type="button" style="flex:1">COPY TEXT</button>' +
          '<button class="csb-btn csb-btn-ghost" id="csb-ocr-clear" type="button" style="flex:1">CLEAR</button>' +
        '</div>';
      pane.appendChild(card);

      var q = function (sel) { return pane.querySelector(sel); };
      ocr.ui = {
        startBtn: q('#csb-ocr-go'),
        copyBtn: q('#csb-ocr-copy'),
        clearBtn: q('#csb-ocr-clear'),
        status: q('#csb-ocr-status'),
        statusText: q('#csb-ocr-status'),
        result: q('#csb-ocr-result')
      };
      ocr.ui.statusText = ocr.ui.status;

      q('#csb-ocr-go').addEventListener('click', function () { ocr.startSelection(); });
      q('#csb-ocr-copy').addEventListener('click', function () { ocr.copy(); });
      q('#csb-ocr-clear').addEventListener('click', function () { ocr.clearResult(); });
      ocr.render();
    }
  };
})();
