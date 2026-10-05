/* CashSkillBD — 00-util.js : shared helpers (loaded first) */
'use strict';

var CSB = window.CSB || {};
window.CSB = CSB;

CSB.util = (function () {
  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function fmtDate(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function fmtTime(d) {
    d = d || new Date();
    return pad2(d.getHours()) + '-' + pad2(d.getMinutes()) + '-' + pad2(d.getSeconds());
  }

  function uid(prefix) {
    return (prefix || 'csb') + '-' + Math.random().toString(36).slice(2, 10);
  }

  /** Ask the background worker to show a system notification. */
  function notify(title, message) {
    try {
      chrome.runtime.sendMessage({ type: 'CSB_NOTIFY', title: title, message: message }).catch(function () {});
    } catch (e) {}
  }

  function debounce(fn, wait) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  function loadImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Image decode failed')); };
      img.src = dataUrl;
    });
  }

  return {
    sleep: sleep,
    clamp: clamp,
    esc: esc,
    el: el,
    fmtDate: fmtDate,
    fmtTime: fmtTime,
    uid: uid,
    notify: notify,
    debounce: debounce,
    loadImage: loadImage
  };
})();
