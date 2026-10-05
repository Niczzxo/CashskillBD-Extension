/* CashSkillBD — side panel typing UI.
 *
 * Progress and status show INSIDE the panel (no floating controller).
 * The engine runs in the tab; commands go through CSB.bus and engine
 * events arrive via CSB.typingPanelUI.onEvent.
 */
'use strict';

(function () {
  var U = CSB.util;

  var ui = {
    state: 'IDLE',

    build: function (pane) {
      var U2 = CSB.util;
      pane.appendChild(U2.el('div', 'csb-title', '⌨️ Human-like Auto Typing'));

      var card = U2.el('div', 'csb-card');
      card.innerHTML =
        '<h3>Text to type</h3>' +
        '<textarea class="csb-textarea" id="csb-type-text" placeholder="Paste or type your text here…" aria-label="Text to type"></textarea>' +
        '<div class="csb-counts"><span>Characters: <b id="csb-count-chars">0</b></span>' +
        '<span>Words: <b id="csb-count-words">0</b></span>' +
        '<span style="flex:1"></span><button class="csb-btn csb-btn-ghost csb-btn-sm" id="csb-clear-text" type="button">Clear</button></div>';
      pane.appendChild(card);

      var opts = U2.el('div', 'csb-card');
      opts.innerHTML =
        '<h3>Typing options</h3>' +
        '<div class="csb-row">' +
          '<div class="csb-field"><label for="csb-speed">Typing speed</label>' +
          '<select class="csb-select" id="csb-speed">' +
          '<option value="slow">Slow</option><option value="normal">Normal</option>' +
          '<option value="fast">Fast</option><option value="custom">Custom…</option></select></div>' +
          '<div class="csb-field" id="csb-custom-speed-wrap" style="display:none"><label for="csb-custom-speed">Custom interval (ms)</label>' +
          '<input class="csb-input" id="csb-custom-speed" type="number" min="20" max="1000" step="5" value="70"></div>' +
        '</div>' +
        '<div class="csb-row">' +
          '<div class="csb-field"><label for="csb-mistake">Mistake rate</label>' +
          '<select class="csb-select" id="csb-mistake">' +
          '<option value="0">0%</option><option value="1">1%</option><option value="2">2%</option>' +
          '<option value="5">5%</option><option value="custom">Custom…</option></select></div>' +
          '<div class="csb-field" id="csb-custom-mistake-wrap" style="display:none"><label for="csb-custom-mistake">Custom rate (%)</label>' +
          '<input class="csb-input" id="csb-custom-mistake" type="number" min="0" max="20" step="0.5" value="2"></div>' +
        '</div>' +
        '<div class="csb-row">' +
          '<div class="csb-field"><label for="csb-correction">Correction delay</label>' +
          '<select class="csb-select" id="csb-correction">' +
          '<option value="100">100ms</option><option value="200">200ms</option><option value="300">300ms</option>' +
          '<option value="500">500ms</option><option value="custom">Custom…</option></select></div>' +
          '<div class="csb-field"><label>Typing variation</label>' +
          '<div class="csb-set-flex"><span class="csb-hint" style="margin:0">Natural timing</span>' +
          '<label class="csb-toggle"><input type="checkbox" id="csb-variation" checked><span class="csb-track"></span></label></div></div>' +
        '</div>' +
        '<p class="csb-hint">Tip: click inside the page’s input field first, then press START. Password fields are never touched.</p>';
      pane.appendChild(opts);

      var ctrls = U2.el('div', 'csb-card');
      ctrls.innerHTML =
        '<div class="csb-row">' +
        '<button class="csb-btn csb-btn-primary" id="csb-start" type="button" style="flex:1">▶ START</button>' +
        '<button class="csb-btn csb-btn-stop" id="csb-stop" type="button" style="flex:1">■ STOP</button>' +
        '</div>' +
        '<div class="csb-status" id="csb-type-status"><span class="csb-dot"></span><span id="csb-type-status-text">Ready</span></div>' +
        '<div class="csb-progress" role="progressbar" aria-label="Typing progress"><div id="csb-type-bar"></div></div>' +
        '<div class="csb-progress-label"><span id="csb-type-pct">0%</span><span id="csb-type-word">—</span></div>';
      pane.appendChild(ctrls);

      var q = function (sel) { return pane.querySelector(sel); };
      this.el = {
        textarea: q('#csb-type-text'),
        charCount: q('#csb-count-chars'),
        wordCount: q('#csb-count-words'),
        startBtn: q('#csb-start'),
        stopBtn: q('#csb-stop'),
        status: q('#csb-type-status'),
        statusText: q('#csb-type-status-text'),
        bar: q('#csb-type-bar'),
        pct: q('#csb-type-pct'),
        word: q('#csb-type-word')
      };

      var self = this;
      this.el.textarea.addEventListener('input', U2.debounce(function () {
        self.updateCounts();
        self.render();
      }, 150));
      q('#csb-clear-text').addEventListener('click', function () {
        self.el.textarea.value = '';
        self.updateCounts();
        self.setStatus('', 'Ready');
        self.setProgress(0, 0, 0, '');
        self.render();
      });
      this.el.startBtn.addEventListener('click', function () { self.start(); });
      this.el.stopBtn.addEventListener('click', function () { self.stop(); });

      var speed = q('#csb-speed'), cSpeedWrap = q('#csb-custom-speed-wrap'), cSpeed = q('#csb-custom-speed');
      var mistake = q('#csb-mistake'), cMistWrap = q('#csb-custom-mistake-wrap'), cMistake = q('#csb-custom-mistake');
      var correction = q('#csb-correction'), variation = q('#csb-variation');

      speed.value = CSB.settings.get('typing.defaultSpeed', 'normal');
      mistake.value = CSB.settings.get('typing.defaultMistakeRate', '2');
      correction.value = CSB.settings.get('typing.correctionDelay', '300');
      variation.checked = CSB.settings.get('typing.typingVariation', true);
      cSpeed.value = CSB.settings.get('typing.customInterval', 70);
      cMistake.value = CSB.settings.get('typing.customMistakeRate', 2);

      function syncCustom() {
        cSpeedWrap.style.display = speed.value === 'custom' ? '' : 'none';
        cMistWrap.style.display = mistake.value === 'custom' ? '' : 'none';
      }
      syncCustom();
      speed.addEventListener('change', function () { CSB.settings.set('typing.defaultSpeed', speed.value); syncCustom(); });
      mistake.addEventListener('change', function () { CSB.settings.set('typing.defaultMistakeRate', mistake.value); syncCustom(); });
      correction.addEventListener('change', function () { CSB.settings.set('typing.correctionDelay', correction.value); });
      variation.addEventListener('change', function () { CSB.settings.set('typing.typingVariation', variation.checked); });
      cSpeed.addEventListener('change', function () {
        var v = U2.clamp(parseInt(cSpeed.value, 10) || 70, 20, 1000);
        cSpeed.value = v;
        CSB.settings.set('typing.customInterval', v);
      });
      cMistake.addEventListener('change', function () {
        var v = U2.clamp(parseFloat(cMistake.value) || 0, 0, 20);
        cMistake.value = v;
        CSB.settings.set('typing.customMistakeRate', v);
      });

      this.updateCounts();
      this.render();
    },

    updateCounts: function () {
      var t = this.el.textarea.value || '';
      var words = t.trim() ? t.trim().split(/\s+/).length : 0;
      // Count Unicode code points (not UTF-16 units) to match the engine.
      var chars = 0;
      try { chars = Array.from(t).length; } catch (e) { chars = t.length; }
      this.el.charCount.textContent = chars;
      this.el.wordCount.textContent = words;
    },

    setStatus: function (kind, msg) {
      if (!this.el) return;
      this.el.status.className = 'csb-status' + (kind ? ' csb-' + kind : '');
      this.el.statusText.textContent = msg;
    },

    setProgress: function (pct, charIndex, total, word) {
      if (!this.el) return;
      pct = Math.max(0, Math.min(100, Math.round(pct) || 0));
      this.el.bar.style.width = pct + '%';
      this.el.pct.textContent = pct + '%';
      this.el.word.textContent = word ? '“' + word + '”' : '—';
      if (total > 0) this.el.statusText.textContent = 'Typing… ' + charIndex + ' / ' + total + ' characters';
    },

    render: function () {
      if (!this.el) return;
      var active = this.state === 'TYPING';
      var hasText = !!(this.el.textarea.value || '').trim();
      this.el.startBtn.disabled = active || !hasText;
      this.el.stopBtn.disabled = !active;
      if (this.state === 'IDLE') this.setStatus('', 'Ready');
    },

    start: async function () {
      var text = (this.el.textarea.value || '');
      if (!text.trim()) { this.setStatus('err', 'Please enter some text first.'); return; }
      // Re-entrancy guard: ignore double-clicks while a start is in flight.
      if (this._starting) return;
      this._starting = true;
      this.el.startBtn.disabled = true;
      try {
        await CSB.bus.cmd('typing.start', { text: text });
        // Record which tab is typing so the SW stop-typing shortcut (and
        // cross-tab progress events) target the right tab.
        try {
          var tabId = CSB.bus.tabId();
          if (tabId != null) await chrome.storage.session.set({ csb_typing_tab: tabId });
        } catch (e) {}
      } catch (e) {
        this.setStatus('err', (e && e.message) || 'Could not start typing.');
      } finally {
        this._starting = false;
        this.render();
      }
    },

    stop: function () {
      var self = this;
      CSB.bus.cmd('typing.stop').catch(function (e) {
        self.setStatus('err', (e && e.message) || 'Could not stop typing.');
      });
    },

    onEvent: function (evt, d) {
      if (evt === 'typing.status') {
        this.setStatus(d.kind, d.msg);
      } else if (evt === 'typing.progress') {
        this.setProgress(d.pct || 0, d.charIndex || 0, d.total || 0, d.word || '');
      } else if (evt === 'typing.state') {
        this.state = d.state || 'IDLE';
        // Typing finished — clear the recorded tab.
        if (this.state !== 'TYPING') {
          try { chrome.storage.session.remove('csb_typing_tab'); } catch (e) {}
        }
        this.render();
      }
    }
  };

  CSB.typingPanelUI = ui;
})();
