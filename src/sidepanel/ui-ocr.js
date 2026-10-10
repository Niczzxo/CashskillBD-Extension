/* CashSkillBD — side panel OCR UI.
 *
 * The selection overlay + engine run in the tab; commands go through
 * CSB.bus and results arrive via CSB.ocrPanelUI.onEvent.
 */
'use strict';

(function () {
  var U = CSB.util;

  var ui = {
    busy: false,

    build: function (pane) {
      var U2 = CSB.util;
      var self = this;
      pane.appendChild(U2.el('div', 'csb-title', '🔤 Screen Text Select'));

      var card = U2.el('div', 'csb-card');
      card.innerHTML =
        '<h3>Extract text from any visible region</h3>' +
        '<p class="csb-hint" style="margin:0 0 10px">Select an area — the text is copied automatically. Works on images, canvas text, and non-selectable content.</p>' +
        '<button class="csb-btn csb-btn-primary csb-btn-block" id="csb-ocr-go" type="button">🔤 START SELECTION</button>' +
        '<div class="csb-status" id="csb-ocr-status"><span class="csb-dot"></span><span>Ready</span></div>' +
        '<h3 style="margin-top:12px">Detected text</h3>' +
        '<div class="csb-result" id="csb-ocr-result" aria-live="polite" style="min-height:60px;max-height:200px;overflow-y:auto;white-space:pre-wrap"></div>' +
        '<button class="csb-btn csb-btn-ghost csb-btn-block" id="csb-ocr-copy-last" type="button" style="margin-top:10px">📋 COPY TEXT</button>';
      pane.appendChild(card);

      var q = function (sel) { return pane.querySelector(sel); };
      this.el = {
        startBtn: q('#csb-ocr-go'),
        status: q('#csb-ocr-status'),
        result: q('#csb-ocr-result')
      };

      q('#csb-ocr-go').addEventListener('click', function () { self.select(); });
      q('#csb-ocr-copy-last').addEventListener('click', function () { self.copyLast(); });
      this.render();
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
      this.el.startBtn.disabled = this.busy;
      this.el.startBtn.textContent = this.busy ? 'WORKING… (Esc to cancel)' : '🔤 START SELECTION';
    },

    select: function () {
      var self = this;
      // Don't start a new selection if one is already in progress
      if (this.busy) return;
      this.busy = true;
      this.render();
      // Watchdog: Esc-cancel or a lost tab must not wedge the UI (O-1).
      if (this._watchdog) clearTimeout(this._watchdog);
      this._watchdog = setTimeout(function () {
        if (self.busy) {
          self.busy = false;
          self.setStatus('', 'Ready');
          self.render();
        }
      }, 120000);
      CSB.bus.cmd('ocr.select').catch(function (e) {
        if (self._watchdog) { clearTimeout(self._watchdog); self._watchdog = null; }
        self.busy = false;
        self.setStatus('err', (e && e.message) || 'Could not start selection.');
        self.render();
      });
    },

    copyLast: function () {
      var self = this;
      var text = this.resultText || '';
      if (!text) { self.setStatus('err', 'No text yet — select an area first.'); return; }
      // User clicked, so we have activation — panel clipboard works.
      navigator.clipboard.writeText(text).then(function () {
        CSB.panel.toast('Text copied');
        self.setStatus('ok', 'Text copied.');
      }).catch(function () {
        self.setStatus('err', 'Clipboard blocked.');
      });
    },


    clear: function () {
      CSB.bus.cmd('ocr.clear').catch(function () {});
      if (this.el) {
        this.setStatus('', 'Ready');
      }
    },

    onEvent: function (evt, d) {
      if (evt === 'ocr.status') {
        this.setStatus(d.kind, d.msg);
        if (d.kind === 'busy') this.busy = true;
        else {
          this.busy = false;
          if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
        }
        this.render();
      } else if (evt === 'ocr.image') {
        // Content script sent captured image; do OCR in panel (extension CSP).
        if (d && d.image) {
          this.doPanelOCR(d.image);
        }
      } else if (evt === 'ocr.result') {
        this.busy = false;
        if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
        if (d.text) {
          this.setStatus('ok', 'Text extracted and copied.');
          this.resultText = d.text;
          if (this.el.result) this.el.result.textContent = d.text;
        } else {
          this.setStatus('', 'No text found in the selected region.');
          if (this.el.result) this.el.result.textContent = '';
        }
        this.render();
      } else if (evt === 'ocr.text') {
        // OCR completed in panel
        this.busy = false;
        if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
        if (d.text) {
          this.setStatus('ok', 'Text extracted and copied.');
          this.resultText = d.text;
          if (this.el.result) this.el.result.textContent = d.text;
        } else {
          this.setStatus('', 'No text found in the selected region.');
          if (this.el.result) this.el.result.textContent = '';
        }
        this.render();
      }
    },

    doPanelOCR: async function (imageDataUrl) {
      this.setStatus('busy', 'Extracting text…');
      this.busy = true;
      this.render();
      try {
        if (typeof Tesseract === 'undefined' || !Tesseract.recognize) {
          throw new Error('OCR engine not loaded.');
        }
        var base = chrome.runtime.getURL('src/lib/tesseract');
        var res = await Promise.race([
          Tesseract.recognize(imageDataUrl, 'eng', {
            workerPath: base + '/worker.min.js',
            corePath: base + '/tesseract-core.wasm.js',
            langPath: base + '/lang/',
            workerBlobURL: false,
            logger: function () {}
          }),
          new Promise(function (_, reject) {
            setTimeout(function () { reject(new Error('OCR timed out.')); }, 60000);
          })
        ]);
        var text = (res && res.data && res.data.text || '').trim();
        this.busy = false;
        if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
        if (text) {
          this.resultText = text;
          if (this.el.result) this.el.result.textContent = text;
          // Auto-copy via service worker (has clipboardWrite permission).
          var self = this;
          if (CSB.settings.get('ocr.autoCopy', true)) {
            chrome.runtime.sendMessage(
              { type: 'CSB_CLIPBOARD_WRITE_TEXT', text: text },
              function (res) {
                if (res && res.ok) {
                  self.setStatus('ok', 'Text extracted and copied.');
                  CSB.panel.toast('Text copied');
                } else {
                  self.setStatus('ok', 'Text extracted. Click COPY TEXT to copy.');
                }
                self.render();
              }
            );
          } else {
            this.setStatus('ok', 'Text extracted.');
          }
        } else {
          this.setStatus('', 'No text found in the selected region.');
          if (this.el.result) this.el.result.textContent = '';
        }
      } catch (e) {
        this.busy = false;
        if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
        this.setStatus('err', 'OCR error: ' + ((e && e.message) || String(e)));
      }
      this.render();
    }
  };

  CSB.ocrPanelUI = ui;
})();
