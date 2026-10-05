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
      this.el = {
        startBtn: q('#csb-ocr-go'),
        copyBtn: q('#csb-ocr-copy'),
        clearBtn: q('#csb-ocr-clear'),
        status: q('#csb-ocr-status'),
        result: q('#csb-ocr-result')
      };

      q('#csb-ocr-go').addEventListener('click', function () { self.select(); });
      q('#csb-ocr-copy').addEventListener('click', function () { self.copy(); });
      q('#csb-ocr-clear').addEventListener('click', function () { self.clear(); });
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

    copy: function () {
      var self = this;
      CSB.bus.cmd('ocr.copy').then(function (r) {
        if (r && r.copied) CSB.panel.toast('OCR text copied');
        else self.setStatus('err', 'Nothing to copy yet.');
      }).catch(function (e) {
        self.setStatus('err', (e && e.message) || 'Copy failed.');
      });
    },

    clear: function () {
      CSB.bus.cmd('ocr.clear').catch(function () {});
      if (this.el) {
        this.el.result.textContent = '';
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
      } else if (evt === 'ocr.result') {
        this.busy = false;
        if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
        if (this.el) {
          // Empty result: clear stale text so the old result isn't mistaken
          // for the new one (O-2).
          this.el.result.textContent = d.text || '';
          if (!d.text) this.setStatus('', 'No text found in the selected region.');
        }
        this.render();
      }
    }
  };

  CSB.ocrPanelUI = ui;
})();
