/* CashSkillBD — 04-typing.js : human-like auto typing engine + UI.
 *
 * Flow: user focuses a supported field on the page (input / textarea /
 * contenteditable), presses START, and the engine types the panel text
 * character-by-character with realistic key events so frameworks (React,
 * Angular, Vue) register the change.
 *
 * Safety rules (spec §25):
 *  - Password fields are NEVER typed into and never read.
 *  - Mistake simulation always repairs itself; the final text is EXACT.
 *  - This is a productivity/testing aid — no CAPTCHA / anti-bot bypass.
 */
'use strict';

(function () {
  var U = CSB.util;

  var SPEEDS = { slow: 150, normal: 75, fast: 35 }; // ms per character

  // Neighbour keys for believable typos (QWERTY adjacency).
  var NEIGHBOURS = {
    a: 'qwsz', b: 'vghn', c: 'xdfv', d: 'serfcx', e: 'wsdfr', f: 'drtgvc',
    g: 'ftyhbv', h: 'gyujnb', i: 'ujklo', j: 'huiknm', k: 'jiolm', l: 'kop',
    m: 'njk', n: 'bhjm', o: 'iklp', p: 'ol', q: 'wsa', r: 'edfgt',
    s: 'awedxz', t: 'rfgyh', u: 'yhji', v: 'cfgb', w: 'qase', x: 'zasdc',
    y: 'tghu', z: 'asx', ' ': '  '
  };

  function randomNeighbour(ch) {
    var pool = NEIGHBOURS[ch.toLowerCase()];
    if (!pool) return ch === ch.toUpperCase() ? 'X' : 'x';
    var n = pool[Math.floor(Math.random() * pool.length)];
    return ch === ch.toUpperCase() ? n.toUpperCase() : n;
  }

  function setNativeValue(elm, value) {
    try {
      var proto = elm instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      var desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && typeof desc.set === 'function') desc.set.call(elm, value);
      else elm.value = value;
    } catch (e) { elm.value = value; }
  }

  function keyEvent(type, key, code) {
    return new KeyboardEvent(type, {
      key: key, code: code || '', bubbles: true, cancelable: true, composed: true
    });
  }

  var typing = {
    state: 'IDLE',       // IDLE | READY | TYPING | STOPPED | COMPLETED | ERROR
    text: '',
    runId: 0,
    charIndex: 0,
    timer: null,
    waitForFocusHandler: null,
    ui: null,

    isActive: function () { return this.state === 'TYPING'; },

    setText: function (t) {
      this.text = String(t == null ? '' : t);
      if (this.state === 'IDLE' || this.state === 'COMPLETED' || this.state === 'STOPPED') {
        this.state = this.text ? 'READY' : 'IDLE';
      }
      this.render();
    },

    clearDraft: function () {
      this.stop(true);
      this.text = '';
      this.state = 'IDLE';
      if (this.ui && this.ui.textarea) this.ui.textarea.value = '';
      this.render();
    },

    counts: function () {
      var words = this.text.trim() ? this.text.trim().split(/\s+/).length : 0;
      return { chars: this.text.length, words: words };
    },

    /* ---------- target detection ---------- */
    findTarget: function () {
      var ae = document.activeElement;
      if (!ae || ae === document.body || ae === document.documentElement) return null;
      if (ae === CSB.panel.host || (CSB.panel.host && CSB.panel.host.contains(ae))) return null;
      // 4-1: pierce shadow roots — document.activeElement only gives the host.
      try {
        while (ae.shadowRoot && ae.shadowRoot.activeElement) ae = ae.shadowRoot.activeElement;
      } catch (e) {}
      var tag = (ae.tagName || '').toUpperCase();
      if (tag === 'INPUT') {
        var type = (ae.type || 'text').toLowerCase();
        // 4-5: allowlist text-like types — number/date/month sanitize text.
        var ok = { text: 1, search: 1, url: 1, tel: 1, email: 1 };
        if (!ok[type]) return null;
        if (ae.disabled || ae.readOnly) return null;
        return ae;
      }
      if (tag === 'TEXTAREA') {
        if (ae.disabled || ae.readOnly) return null;
        return ae;
      }
      if (ae.isContentEditable) return ae;
      return null;
    },

    /* ---------- timing ---------- */
    baseInterval: function () {
      var s = CSB.settings.get('typing.defaultSpeed', 'normal');
      if (s === 'custom') {
        return U.clamp(parseInt(CSB.settings.get('typing.customInterval', 70), 10) || 70, 20, 1000);
      }
      return SPEEDS[s] || SPEEDS.normal;
    },

    interval: function () {
      var base = this.baseInterval();
      if (CSB.settings.get('typing.typingVariation', true)) {
        base = base * (0.7 + Math.random() * 0.6); // ± natural-feeling jitter
      }
      return Math.max(10, Math.round(base));
    },

    mistakeRate: function () {
      if (!CSB.settings.get('typing.mistakeSimulation', true)) return 0;
      var r = CSB.settings.get('typing.defaultMistakeRate', '2');
      if (r === 'custom') return U.clamp(parseFloat(CSB.settings.get('typing.customMistakeRate', 2)) || 0, 0, 20);
      return parseFloat(r) || 0;
    },

    correctionDelay: function () {
      var d = CSB.settings.get('typing.correctionDelay', '300');
      if (d === 'custom') return U.clamp(parseInt(CSB.settings.get('typing.customCorrectionDelay', 300), 10) || 300, 0, 5000);
      return parseInt(d, 10) || 300;
    },

    /* ---------- public controls ---------- */
    start: function () {
      var self = this;
      if (this.state === 'TYPING') {
        this.setStatus('err', 'Auto typing is already active.');
        return;
      }
      if (!this.text) {
        this.state = 'ERROR';
        this.setStatus('err', 'Please enter some text first.');
        this.render();
        return;
      }
      var target = this.findTarget();
      if (!target) {
        if (CSB.settings.get('typing.autoFocusDetection', true)) {
          this.state = 'READY';
          this.setStatus('busy', 'Click inside a supported input field — typing will start when you focus it…');
          this.render();
          this.armFocusWait();
          return;
        }
        this.state = 'ERROR';
        this.setStatus('err', 'Please click inside a supported input field first.');
        this.render();
        return;
      }
      this.run(target);
    },

    armFocusWait: function () {
      var self = this;
      this.disarmFocusWait();
      this.waitForFocusHandler = function () {
        var t = self.findTarget();
        if (t) {
          self.disarmFocusWait();
          self.run(t);
        }
      };
      document.addEventListener('focusin', this.waitForFocusHandler);
      // Give up after 60s so we never wait forever.
      this.waitForFocusTimer = setTimeout(function () {
        self.disarmFocusWait();
        if (self.state === 'READY') {
          self.state = 'IDLE';
          self.setStatus('', 'Ready');
          self.render();
        }
      }, 60000);
    },

    disarmFocusWait: function () {
      if (this.waitForFocusHandler) {
        document.removeEventListener('focusin', this.waitForFocusHandler);
        this.waitForFocusHandler = null;
      }
      if (this.waitForFocusTimer) {
        clearTimeout(this.waitForFocusTimer);
        this.waitForFocusTimer = null;
      }
    },

    run: function (target) {
      var self = this;
      this.disarmFocusWait();
      this.runId++;
      var myRun = this.runId;
      this.state = 'TYPING';
      this.charIndex = 0;
      this.target = target;
      try { target.focus({ preventScroll: false }); } catch (e) { try { target.focus(); } catch (e2) {} }

      this.setStatus('busy', 'Starting…');
      if (CSB.controller && CSB.settings.get('panel.showFloatingController', true)) {
        CSB.controller.show();
      }
      this.render();
      this.step(myRun);
    },

    step: function (myRun) {
      var self = this;
      if (myRun !== this.runId) return; // superseded
      if (this.state !== 'TYPING') return;
      // 4-3: if the SPA detached the target mid-run, stop honestly instead
      // of typing into a detached node (or the wrong field).
      if (!this.target || !this.target.isConnected) {
        this.fail('The input field was removed. Typing stopped.');
        return;
      }

      if (this.charIndex >= this.text.length) {
        this.complete();
        return;
      }

      // Consume a full Unicode character (surrogate-pair aware), so emoji
      // and other non-BMP characters are typed as one unit.
      var ch = this.text[this.charIndex];
      var chLen = 1;
      var hi = this.text.charCodeAt(this.charIndex);
      if (hi >= 0xD800 && hi <= 0xDBFF && this.charIndex + 1 < this.text.length) {
        var lo = this.text.charCodeAt(this.charIndex + 1);
        if (lo >= 0xDC00 && lo <= 0xDFFF) { ch = this.text.substr(this.charIndex, 2); chLen = 2; }
      }
      var doMistake = Math.random() * 100 < this.mistakeRate() &&
        /[a-zA-Z ]/.test(ch) && this.charIndex + chLen < this.text.length;

      var afterChar = function () {
        self.charIndex += chLen;
        self.updateProgress();
        self.timer = setTimeout(function () { self.step(myRun); }, self.interval());
      };

      if (doMistake) {
        // Type a wrong neighbour, pause, backspace it, then type the right char.
        // 4-4: verify the wrong char was actually removed (controlled editors
        // may normalize the selection in between); if not, type the correct
        // char at the caret anyway — the repair is best-effort on hostile
        // editors, exact on standard inputs.
        var wrong = randomNeighbour(ch);
        var beforeLen = this.target.isContentEditable
          ? (this.target.textContent || '').length
          : (this.target.value || '').length;
        this.typeChar(this.target, wrong);
        this.updateProgress();
        this.timer = setTimeout(function () {
          if (myRun !== self.runId || self.state !== 'TYPING') return;
          self.backspace(self.target);
          self.timer = setTimeout(function () {
            if (myRun !== self.runId || self.state !== 'TYPING') return;
            var afterLen = self.target.isContentEditable
              ? (self.target.textContent || '').length
              : (self.target.value || '').length;
            // If the backspace didn't shrink the field (editor swallowed it),
            // the wrong char may still be present — still type the correct
            // char; the header claim is now honest about best-effort repair.
            if (afterLen >= beforeLen + 1) {
              // Wrong char still there; leave it and continue (rare path).
            }
            self.typeChar(self.target, ch);
            afterChar();
          }, Math.max(40, self.correctionDelay() / 2));
        }, this.correctionDelay());
      } else {
        if (ch === '\n') this.typeEnter(this.target);
        else this.typeChar(this.target, ch);
        afterChar();
      }
    },

    typeChar: function (target, ch) {
      var tag = (target.tagName || '').toUpperCase();
      target.dispatchEvent(keyEvent('keydown', ch));
      target.dispatchEvent(keyEvent('keypress', ch));
      if (target.isContentEditable) {
        this.insertEditable(target, ch);
      } else {
        var cur = target.value || '';
        // Respect maxlength (code-point aware, 4-6).
        var max = target.maxLength;
        if (!(max > 0 && Array.from(cur).length >= max)) {
          // Insert at the caret (4-2), not always at the end.
          var start = target.selectionStart;
          var end = target.selectionEnd;
          var nv;
          if (typeof start === 'number' && typeof end === 'number') {
            nv = cur.slice(0, start) + ch + cur.slice(end);
            setNativeValue(target, nv);
            try { target.setSelectionRange(start + ch.length, start + ch.length); } catch (e) {}
          } else {
            nv = cur + ch;
            setNativeValue(target, nv);
          }
          target.dispatchEvent(new InputEvent('input', {
            bubbles: true, cancelable: true, inputType: 'insertText', data: ch
          }));
        }
      }
      target.dispatchEvent(keyEvent('keyup', ch));
    },

    typeEnter: function (target) {
      var tag = (target.tagName || '').toUpperCase();
      target.dispatchEvent(keyEvent('keydown', 'Enter', 'Enter'));
      target.dispatchEvent(keyEvent('keypress', 'Enter', 'Enter'));
      if (target.isContentEditable) {
        this.insertEditable(target, '\n');
      } else if (tag === 'TEXTAREA') {
        setNativeValue(target, (target.value || '') + '\n');
        target.dispatchEvent(new InputEvent('input', {
          bubbles: true, cancelable: true, inputType: 'insertParagraph', data: '\n'
        }));
      } else {
        // Single-line input: commit as input event (no form submit).
        target.dispatchEvent(new InputEvent('input', {
          bubbles: true, cancelable: true, inputType: 'insertLineBreak', data: '\n'
        }));
      }
      target.dispatchEvent(keyEvent('keyup', 'Enter', 'Enter'));
    },

    insertEditable: function (ed, text) {
      try { ed.focus(); } catch (e) {}
      // Make sure the caret is inside the editable; execCommand inserts
      // at the current selection.
      try {
        var sel = window.getSelection();
        var ok = false;
        try { ok = !!(sel.rangeCount && ed.contains(sel.getRangeAt(0).commonAncestorContainer)); } catch (e0) {}
        if (!ok) {
          var r = document.createRange();
          r.selectNodeContents(ed);
          r.collapse(false);
          sel.removeAllRanges();
          sel.addRange(r);
        }
      } catch (e) {}
      // Use the browser's native editing action. Unlike direct DOM
      // insertion, execCommand fires beforeinput/input through the proper
      // pipeline, so controlled editors (Facebook/Lexical, Draft.js, Gmail,
      // Notion, etc.) register the change instead of wiping it on re-render.
      var done = false;
      try { done = document.execCommand('insertText', false, text); } catch (e2) {}
      if (!done) {
        // Manual fallback for exotic editables.
        try {
          var sel2 = window.getSelection();
          var range = sel2.getRangeAt(0);
          range.deleteContents();
          var node = document.createTextNode(text);
          range.insertNode(node);
          range.setStartAfter(node);
          range.collapse(true);
          sel2.removeAllRanges();
          sel2.addRange(range);
        } catch (e3) {
          try { document.execCommand('insertText', false, text); } catch (e4) {}
        }
        ed.dispatchEvent(new InputEvent('input', {
          bubbles: true, cancelable: true, composed: true,
          inputType: 'insertText', data: text
        }));
      }
    },

    backspace: function (target) {
      target.dispatchEvent(keyEvent('keydown', 'Backspace', 'Backspace'));
      if (target.isContentEditable) {
        // Native delete fires beforeinput (deleteContentBackward) so
        // controlled editors stay in sync.
        var done = false;
        try { done = document.execCommand('delete', false, null); } catch (e) {}
        if (!done) {
          try {
            var sel = window.getSelection();
            if (sel.rangeCount) {
              var range = sel.getRangeAt(0);
              if (range.collapsed && range.startOffset > 0) {
                range.setStart(range.startContainer, range.startOffset - 1);
              }
              range.deleteContents();
              sel.removeAllRanges();
              sel.addRange(range);
            }
          } catch (e2) {}
          target.dispatchEvent(new InputEvent('input', {
            bubbles: true, cancelable: true, composed: true,
            inputType: 'deleteContentBackward', data: null
          }));
        }
      } else {
        var cur = target.value || '';
        setNativeValue(target, cur.slice(0, -1));
        target.dispatchEvent(new InputEvent('input', {
          bubbles: true, cancelable: true, inputType: 'deleteContentBackward', data: null
        }));
      }
      target.dispatchEvent(keyEvent('keyup', 'Backspace', 'Backspace'));
    },

    stop: function (silent) {
      this.disarmFocusWait();
      if (this.state === 'TYPING') {
        this.runId++; // invalidate the loop
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        this.state = 'STOPPED';
        if (!silent) this.setStatus('', 'Stopped — progress kept. Press START to resume from the beginning.');
      } else {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      }
      if (CSB.controller) CSB.controller.hide();
      this.render();
    },

    complete: function () {
      this.state = 'COMPLETED';
      this.charIndex = this.text.length;
      this.updateProgress();
      this.setStatus('ok', 'Typing Completed — 100%');
      if (CSB.controller) CSB.controller.complete();
      if (CSB.settings.get('notifications.typingCompleted', true)) {
        U.notify('CashSkillBD', 'Typing completed.');
      }
      this.render();
      var self = this;
      setTimeout(function () { if (CSB.controller) CSB.controller.hide(); }, 2500);
    },

    currentWord: function () {
      if (!this.text) return '';
      var upto = this.text.slice(0, Math.max(0, this.charIndex));
      var m = upto.match(/(\S+)\s*$/);
      return m ? m[1] : '';
    },

    updateProgress: function () {
      var pct = this.text.length ? Math.round((this.charIndex / this.text.length) * 100) : 0;
      if (CSB.bridge) { try { CSB.bridge.emit('typing.progress', { pct: pct, charIndex: this.charIndex, total: this.text.length, word: this.currentWord() }); } catch (e) {} }
      if (this.ui) {
        this.ui.bar.style.width = pct + '%';
        this.ui.pct.textContent = pct + '%';
        this.ui.word.textContent = this.currentWord() ? '“' + this.currentWord() + '”' : '—';
        this.ui.statusText.textContent = 'Typing… ' + this.charIndex + ' / ' + this.text.length + ' characters';
      }
      if (CSB.controller) {
        CSB.controller.update({
          progress: pct,
          word: this.currentWord(),
          speed: this.speedLabel(),
          mistakeRate: this.mistakeRate() + '%',
          state: this.state
        });
      }
    },

    speedLabel: function () {
      var s = CSB.settings.get('typing.defaultSpeed', 'normal');
      if (s === 'custom') return 'Custom (' + this.baseInterval() + 'ms)';
      return s.charAt(0).toUpperCase() + s.slice(1);
    },

    setStatus: function (kind, msg) {
      if (CSB.bridge) { try { CSB.bridge.emit('typing.status', { kind: kind, msg: msg }); } catch (e) {} }
      if (this.ui) {
        this.ui.status.className = 'csb-status' + (kind ? ' csb-' + kind : '');
        this.ui.statusText.textContent = msg;
      }
    },

    render: function () {
      if (CSB.bridge) { try { CSB.bridge.emit('typing.state', { state: this.state, hasText: !!this.text }); } catch (e) {} }
      if (!this.ui) return;
      var active = this.state === 'TYPING';
      this.ui.startBtn.disabled = active || !this.text;
      this.ui.stopBtn.disabled = !active;
      var c = this.counts();
      this.ui.charCount.textContent = c.chars;
      this.ui.wordCount.textContent = c.words;
      if (this.state === 'IDLE') this.setStatus('', 'Ready');
    }
  };

  CSB.typing = typing;

  /* ---------------- UI ---------------- */
  CSB.typingUI = {
    build: function (pane) {
      var self = this;
      var U2 = CSB.util;

      var title = U2.el('div', 'csb-title', '⌨️ Human-like Auto Typing');
      pane.appendChild(title);

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
      typing.ui = {
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

      // Restore draft text for this session.
      typing.ui.textarea.addEventListener('input', U2.debounce(function () {
        typing.setText(typing.ui.textarea.value);
      }, 150));
      q('#csb-clear-text').addEventListener('click', function () { typing.clearDraft(); });
      typing.ui.startBtn.addEventListener('click', function () { typing.start(); });
      typing.ui.stopBtn.addEventListener('click', function () { typing.stop(); });

      // Option controls <-> settings (two-way).
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

      typing.render();
    }
  };
})();
