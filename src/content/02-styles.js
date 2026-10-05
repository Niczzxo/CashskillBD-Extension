/* CashSkillBD — 02-styles.js : full UI stylesheet.
 * Injected as a constructed stylesheet into the shadow root, so page CSP
 * (style-src) cannot block it and page styles cannot leak in.
 */
'use strict';

CSB.CSS = `
/* ============ base ============ */
.csb-root, .csb-root * { box-sizing: border-box; }
.csb-root {
  --csb-accent: #E03131;
  --csb-accent-soft: rgba(224,49,49,.12);
  --csb-bg: #161616;
  --csb-bg-2: #1e1e1e;
  --csb-card: #222222;
  --csb-border: #333333;
  --csb-fg: #f2f2f2;
  --csb-fg-dim: #b9b9b9;
  --csb-fg-faint: #8a8a8a;
  --csb-input-bg: #101010;
  --csb-shadow: 0 8px 28px rgba(0,0,0,.45);
  --csb-radius: 12px;
  --csb-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-family: var(--csb-font);
  color: var(--csb-fg);
  font-size: 14px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
.csb-root[data-theme="light"] {
  --csb-bg: #ffffff;
  --csb-bg-2: #f6f6f6;
  --csb-card: #ffffff;
  --csb-border: #e3e3e3;
  --csb-fg: #1b1b1b;
  --csb-fg-dim: #555555;
  --csb-fg-faint: #8f8f8f;
  --csb-input-bg: #f4f4f4;
  --csb-shadow: 0 8px 24px rgba(0,0,0,.12);
}

/* ============ panel frame ============ */
.csb-panel {
  position: fixed; top: 0; right: 0;
  height: 100vh; height: 100dvh;
  width: 380px; min-width: 300px; max-width: 640px;
  display: flex; flex-direction: column;
  background: var(--csb-bg);
  border-left: 1px solid var(--csb-border);
  box-shadow: var(--csb-shadow);
  z-index: 2147483646;
  overflow: hidden;
  animation: csb-slide-in .3s ease-out;
  container-type: inline-size;
}
@keyframes csb-slide-in { from { transform: translateX(24px); opacity: .4; } to { transform: none; opacity: 1; } }
/* Minimized state: small round floating logo button at the top of the screen */
.csb-minbtn {
  position: fixed; top: 12px; right: 12px; z-index: 2147483647;
  width: 46px; height: 46px; border-radius: 50%;
  border: 2px solid var(--csb-accent);
  background: var(--csb-bg-2);
  padding: 0; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--csb-shadow);
  pointer-events: auto;
  transition: transform .15s ease;
  animation: csb-fade .2s ease-out;
}
.csb-minbtn:hover { transform: scale(1.1); }
.csb-minbtn:focus-visible { outline: 2px solid var(--csb-accent); outline-offset: 2px; }
.csb-minbtn img { width: 32px; height: 32px; border-radius: 50%; display: block; }

.csb-resizer {
  position: absolute; left: -4px; top: 0; bottom: 0; width: 9px;
  cursor: ew-resize; z-index: 5;
}
.csb-resizer::after {
  content: ""; position: absolute; left: 3px; top: 0; bottom: 0; width: 3px;
  border-radius: 3px; background: transparent; transition: background .15s;
}
.csb-resizer:hover::after, .csb-resizer.csb-dragging::after { background: var(--csb-accent); }

/* ============ header ============ */
.csb-head {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--csb-border);
  background: var(--csb-bg-2);
  flex: 0 0 auto;
}
.csb-logo { width: 34px; height: 34px; border-radius: 9px; flex: 0 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
.csb-brand { flex: 1 1 auto; min-width: 0; }
.csb-brand-name { font-weight: 700; font-size: 16px; letter-spacing: .2px; white-space: nowrap; }
.csb-brand-name .csb-bd { color: var(--csb-accent); }
.csb-head-actions { display: flex; gap: 4px; }
.csb-icon-btn {
  width: 30px; height: 30px; border-radius: 8px; border: 1px solid transparent;
  background: transparent; color: var(--csb-fg-dim); font-size: 15px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
  transition: background .15s, color .15s, border-color .15s;
}
.csb-icon-btn:hover { background: var(--csb-accent-soft); color: var(--csb-fg); border-color: var(--csb-border); }
.csb-icon-btn:focus-visible { outline: 2px solid var(--csb-accent); outline-offset: 1px; }

/* ============ nav tabs ============ */
.csb-nav {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px; padding: 10px 12px;
  border-bottom: 1px solid var(--csb-border);
  flex: 0 0 auto;
}
.csb-tab {
  min-width: 0;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 4px; border-radius: 10px;
  border: 1px solid var(--csb-border); background: var(--csb-card);
  color: var(--csb-fg-dim); font-size: 12.5px; font-weight: 600; cursor: pointer;
  transition: background .15s, color .15s, border-color .15s, box-shadow .15s;
  white-space: nowrap; overflow: hidden;
}
.csb-tab .csb-ico { font-size: 15px; flex: 0 0 auto; }
.csb-tab .csb-tab-label { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
/* Narrow panel: icon-only tabs, never overlapping */
@container (max-width: 440px) {
  .csb-tab { padding: 9px 2px; }
  .csb-tab .csb-tab-label { display: none; }
  .csb-tab .csb-ico { font-size: 17px; }
}
.csb-tab:hover { color: var(--csb-fg); border-color: var(--csb-fg-faint); }
.csb-tab.csb-active {
  background: var(--csb-accent); border-color: var(--csb-accent); color: #fff;
  box-shadow: 0 3px 12px rgba(224,49,49,.35);
}
.csb-tab:focus-visible { outline: 2px solid var(--csb-accent); outline-offset: 2px; }

/* ============ body / cards ============ */
.csb-body { flex: 1 1 auto; overflow-y: auto; padding: 14px 12px 20px; scrollbar-width: thin; }
.csb-body::-webkit-scrollbar { width: 8px; }
.csb-body::-webkit-scrollbar-thumb { background: var(--csb-border); border-radius: 8px; }
.csb-pane { display: none; }
.csb-pane.csb-pane-active { display: block; } /* entrance animation lives in the motion section */
@keyframes csb-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.csb-card {
  background: var(--csb-card); border: 1px solid var(--csb-border);
  border-radius: var(--csb-radius); padding: 14px; margin-bottom: 12px;
  box-shadow: 0 2px 10px rgba(0,0,0,.12);
}
.csb-card h3 { margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: .8px; color: var(--csb-fg-dim); }
.csb-title { font-size: 15px; font-weight: 700; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; }
.csb-hint { font-size: 12px; color: var(--csb-fg-faint); margin: 6px 0 0; }
.csb-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.csb-row + .csb-row { margin-top: 10px; }
.csb-field { flex: 1 1 140px; min-width: 0; }
.csb-field label { display: block; font-size: 11.5px; font-weight: 600; color: var(--csb-fg-dim); margin-bottom: 5px; }
.csb-input, .csb-select, .csb-textarea {
  width: 100%; background: var(--csb-input-bg); color: var(--csb-fg);
  border: 1px solid var(--csb-border); border-radius: 9px;
  padding: 9px 10px; font-size: 13.5px; font-family: inherit;
  transition: border-color .15s, box-shadow .15s;
}
.csb-input:focus, .csb-select:focus, .csb-textarea:focus {
  outline: none; border-color: var(--csb-accent); box-shadow: 0 0 0 3px var(--csb-accent-soft);
}
.csb-textarea { min-height: 130px; resize: vertical; }
.csb-select { appearance: none; cursor: pointer; }
.csb-counts { display: flex; gap: 14px; font-size: 11.5px; color: var(--csb-fg-faint); margin-top: 6px; }
.csb-counts b { color: var(--csb-fg-dim); font-weight: 700; }

/* ============ buttons ============ */
.csb-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  padding: 10px 16px; border-radius: 10px; font-size: 13.5px; font-weight: 700;
  border: 1px solid transparent; cursor: pointer; transition: all .15s;
  font-family: inherit; white-space: nowrap;
}
.csb-btn:focus-visible { outline: 2px solid var(--csb-accent); outline-offset: 2px; }
.csb-btn:disabled { opacity: .45; cursor: not-allowed; }
.csb-btn-primary { background: var(--csb-accent); color: #fff; box-shadow: 0 3px 12px rgba(224,49,49,.3); }
.csb-btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
.csb-btn-stop { background: #3a3a3a; color: #fff; }
.csb-root[data-theme="light"] .csb-btn-stop { background: #e8e8e8; color: #333; }
.csb-btn-stop:hover:not(:disabled) { background: #c92a2a; color: #fff; }
.csb-btn-ghost { background: transparent; border-color: var(--csb-border); color: var(--csb-fg-dim); }
.csb-btn-ghost:hover:not(:disabled) { border-color: var(--csb-accent); color: var(--csb-fg); }
.csb-btn-block { width: 100%; }
.csb-btn-sm { padding: 7px 12px; font-size: 12.5px; border-radius: 8px; }

/* ============ status / progress ============ */
.csb-status {
  display: flex; align-items: center; gap: 8px;
  font-size: 12.5px; font-weight: 600; color: var(--csb-fg-dim);
  background: var(--csb-bg-2); border: 1px solid var(--csb-border);
  padding: 9px 12px; border-radius: 9px; margin-top: 10px;
}
.csb-status .csb-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--csb-fg-faint); flex: 0 0 auto; }
.csb-status.csb-ok .csb-dot { background: #2f9e44; }
.csb-status.csb-busy .csb-dot { background: var(--csb-accent); animation: csb-pulse 1s infinite; }
.csb-status.csb-err .csb-dot { background: #e03131; }
.csb-status.csb-err { color: #ff8787; }
.csb-root[data-theme="light"] .csb-status.csb-err { color: #c92a2a; }
@keyframes csb-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
.csb-progress { height: 8px; background: var(--csb-input-bg); border: 1px solid var(--csb-border); border-radius: 6px; overflow: hidden; margin-top: 10px; }
.csb-progress > div { height: 100%; width: 0%; background: linear-gradient(90deg, var(--csb-accent), #ff6b6b); border-radius: 6px; transition: width .2s; }
.csb-progress-label { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--csb-fg-faint); margin-top: 5px; }
.csb-result {
  background: var(--csb-input-bg); border: 1px solid var(--csb-border); border-radius: 9px;
  padding: 10px 12px; font-size: 13px; margin-top: 10px; max-height: 220px; overflow-y: auto;
  white-space: pre-wrap; word-break: break-word;
}
.csb-result:empty { display: none; }
.csb-preview-img { width: 100%; border-radius: 9px; border: 1px solid var(--csb-border); margin-top: 10px; display: block; }

/* ============ floating controller ============ */
.csb-controller {
  position: fixed; z-index: 2147483647; width: 264px;
  background: var(--csb-bg-2); border: 1px solid var(--csb-border); border-radius: 14px;
  box-shadow: var(--csb-shadow); overflow: hidden;
  font-size: 13px;
  pointer-events: auto;
}
.csb-controller.csb-pos-right { right: 16px; top: 50%; transform: translateY(-50%); }
.csb-controller.csb-pos-left { left: 16px; top: 50%; transform: translateY(-50%); }
.csb-controller.csb-pos-top-right { right: 16px; top: 16px; }
.csb-controller.csb-pos-bottom-right { right: 16px; bottom: 16px; }
.csb-ctl-head {
  display: flex; align-items: center; gap: 8px; padding: 9px 10px;
  background: var(--csb-accent); color: #fff; cursor: grab; user-select: none;
  font-weight: 700; font-size: 13px;
}
.csb-ctl-head:active { cursor: grabbing; }
.csb-ctl-head img { width: 20px; height: 20px; border-radius: 5px; }
.csb-ctl-head .csb-sp { flex: 1; }
.csb-ctl-min { background: rgba(255,255,255,.18); border: none; color: #fff; width: 24px; height: 24px; border-radius: 6px; cursor: pointer; font-size: 14px; line-height: 1; }
.csb-ctl-body { padding: 10px 12px 12px; }
.csb-ctl-state { display: flex; align-items: center; gap: 7px; font-weight: 700; font-size: 12.5px; margin-bottom: 8px; }
.csb-ctl-state .csb-dot { width: 9px; height: 9px; border-radius: 50%; background: #2f9e44; animation: csb-pulse 1.2s infinite; }
.csb-ctl-meta { font-size: 12px; color: var(--csb-fg-dim); margin-top: 6px; }
.csb-ctl-meta b { color: var(--csb-fg); }
.csb-ctl-word { font-size: 12px; color: var(--csb-fg-faint); margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.csb-controller.csb-min .csb-ctl-body { display: none; }

/* ============ selection overlay (OCR) ============ */
.csb-select-overlay {
  position: fixed; inset: 0; z-index: 2147483647; cursor: crosshair;
  background: rgba(0,0,0,.35);
  pointer-events: auto;
}
.csb-select-box {
  position: absolute; border: 2px solid var(--csb-accent); background: rgba(224,49,49,.08);
  box-shadow: 0 0 0 9999px rgba(0,0,0,.35); pointer-events: none;
}
.csb-select-hint {
  position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
  background: var(--csb-bg-2); color: var(--csb-fg); border: 1px solid var(--csb-border);
  padding: 8px 16px; border-radius: 20px; font-size: 12.5px; font-weight: 600;
  box-shadow: var(--csb-shadow); z-index: 2147483647; pointer-events: none; white-space: nowrap;
}

/* ============ settings ============ */
.csb-set-layout { display: flex; gap: 10px; }
.csb-set-nav { flex: 0 0 118px; display: flex; flex-direction: column; gap: 4px; }
.csb-set-nav button {
  text-align: left; padding: 8px 10px; border-radius: 8px; border: 1px solid transparent;
  background: transparent; color: var(--csb-fg-dim); font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: inherit; transition: all .13s;
}
.csb-set-nav button:hover { background: var(--csb-accent-soft); color: var(--csb-fg); }
.csb-set-nav button.csb-active { background: var(--csb-accent); color: #fff; }
.csb-set-pages { flex: 1 1 auto; min-width: 0; }
.csb-set-page { display: none; }
.csb-set-page.csb-active { display: block; animation: csb-fade .16s ease-out; }
.csb-set-item { padding: 10px 0; border-bottom: 1px solid var(--csb-border); }
.csb-set-item:last-child { border-bottom: none; }
.csb-set-item .csb-set-label { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
.csb-set-item .csb-set-desc { font-size: 11.5px; color: var(--csb-fg-faint); margin-bottom: 8px; }
.csb-toggle { position: relative; width: 40px; height: 22px; flex: 0 0 auto; cursor: pointer; }
.csb-toggle input { opacity: 0; width: 100%; height: 100%; position: absolute; margin: 0; cursor: pointer; }
.csb-toggle .csb-track { position: absolute; inset: 0; background: var(--csb-border); border-radius: 20px; transition: background .15s; pointer-events: none; }
.csb-toggle .csb-track::after {
  content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px;
  background: #fff; border-radius: 50%; transition: transform .15s; box-shadow: 0 1px 4px rgba(0,0,0,.35);
}
.csb-toggle input:checked + .csb-track { background: var(--csb-accent); }
.csb-toggle input:checked + .csb-track::after { transform: translateX(18px); }
.csb-toggle input:focus-visible + .csb-track { outline: 2px solid var(--csb-accent); outline-offset: 2px; }
.csb-set-flex { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.csb-seg { display: flex; flex-wrap: wrap; gap: 6px; }
.csb-seg button {
  padding: 7px 12px; border-radius: 8px; border: 1px solid var(--csb-border);
  background: var(--csb-input-bg); color: var(--csb-fg-dim); font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: inherit; transition: all .13s;
}
.csb-seg button.csb-on { background: var(--csb-accent); border-color: var(--csb-accent); color: #fff; }
.csb-seg button:focus-visible { outline: 2px solid var(--csb-accent); outline-offset: 1px; }
.csb-about-logo { width: 64px; height: 64px; border-radius: 16px; margin-bottom: 8px; }
.csb-about-ver { font-size: 12px; color: var(--csb-fg-faint); }
.csb-modal-back {
  position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 2147483647;
  display: flex; align-items: center; justify-content: center; padding: 20px;
  pointer-events: auto;
}
.csb-modal {
  background: var(--csb-bg-2); border: 1px solid var(--csb-border); border-radius: 14px;
  max-width: 420px; width: 100%; max-height: 80vh; overflow-y: auto; padding: 18px;
  box-shadow: var(--csb-shadow);
}
.csb-modal h4 { margin: 0 0 10px; font-size: 15px; }
.csb-modal p, .csb-modal li { font-size: 13px; color: var(--csb-fg-dim); }
.csb-modal ul { padding-left: 18px; margin: 8px 0; }

/* ============ translate language bar (Google-style) ============ */
.csb-tr-langbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
.csb-tr-langbar .csb-select { flex: 1 1 0; min-width: 0; }
.csb-tr-swap {
  flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%;
  border: 1px solid var(--csb-border); background: var(--csb-input-bg);
  color: var(--csb-fg-dim); font-size: 16px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: transform .25s ease, border-color .15s, color .15s;
  font-family: inherit; padding: 0;
}
.csb-tr-swap:hover:not(:disabled) { border-color: var(--csb-accent); color: var(--csb-accent); transform: rotate(180deg); }
.csb-tr-swap:disabled { opacity: .35; cursor: not-allowed; }
.csb-tr-swap:focus-visible { outline: 2px solid var(--csb-accent); outline-offset: 2px; }
.csb-tr-meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; font-size: 11.5px; color: var(--csb-fg-faint); }

/* ============ page translate bar (own shadow host, Google-style) ============ */
.csb-pt-bar {
  position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
  background: var(--csb-bg); color: var(--csb-fg);
  border: 1px solid var(--csb-border); border-radius: 14px;
  padding: 8px 10px 8px 14px; box-shadow: var(--csb-shadow);
  font-family: var(--csb-font); font-size: 13px; line-height: 1.4;
  max-width: min(94vw, 640px); pointer-events: auto; white-space: nowrap;
  animation: csb-fade .2s ease-out;
}
.csb-pt-bar .csb-pt-text { overflow: hidden; text-overflow: ellipsis; }
.csb-pt-bar .csb-pt-text b { font-weight: 700; }
.csb-pt-globe { font-size: 16px; flex: 0 0 auto; }
.csb-pt-x {
  border: none; background: transparent; color: var(--csb-fg-faint);
  font-size: 18px; cursor: pointer; padding: 2px 8px; border-radius: 8px; line-height: 1;
  flex: 0 0 auto; font-family: inherit;
}
.csb-pt-x:hover { color: var(--csb-fg); background: var(--csb-bg-2); }
.csb-pt-x:focus-visible { outline: 2px solid var(--csb-accent); outline-offset: 1px; }
.csb-pt-bar .csb-btn { flex: 0 0 auto; }

/* ============ motion (smooth, physics-feeling responses) ============ */
.csb-pane.csb-pane-active { animation: csb-pane-in .24s cubic-bezier(.2,.7,.3,1); }
@keyframes csb-pane-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
/* Cards rise in with a soft stagger when a tab opens */
.csb-pane.csb-pane-active .csb-card { animation: csb-card-in .3s cubic-bezier(.2,.7,.3,1) backwards; }
.csb-pane.csb-pane-active .csb-card:nth-of-type(2) { animation-delay: .05s; }
.csb-pane.csb-pane-active .csb-card:nth-of-type(3) { animation-delay: .1s; }
.csb-pane.csb-pane-active .csb-card:nth-of-type(4) { animation-delay: .15s; }
@keyframes csb-card-in { from { opacity: 0; transform: translateY(12px) scale(.99); } to { opacity: 1; transform: none; } }
/* Tactile buttons */
.csb-btn { transition: transform .12s ease, filter .15s, background .15s, color .15s, border-color .15s, box-shadow .15s; will-change: transform; }
.csb-btn:active:not(:disabled) { transform: scale(.95); transition-duration: .06s; }
.csb-tab { transition: transform .12s ease, background .18s, color .18s, border-color .18s, box-shadow .18s; }
.csb-tab:active:not(.csb-active) { transform: scale(.94); }
/* Floating elements glide, not jump */
.csb-minbtn, .csb-pt-bar { transition: transform .18s ease, box-shadow .18s ease; }
/* Respect users who prefer no motion */
@media (prefers-reduced-motion: reduce) {
  .csb-root *, .csb-root *::before, .csb-root *::after {
    animation-duration: .01ms !important; animation-delay: 0ms !important;
    transition-duration: .01ms !important;
  }
}

/* ============ misc ============ */
.csb-spinner {
  width: 15px; height: 15px; border-radius: 50%; flex: 0 0 auto;
  border: 2px solid var(--csb-border); border-top-color: var(--csb-accent);
  animation: csb-spin .7s linear infinite;
}
@keyframes csb-spin { to { transform: rotate(360deg); } }
.csb-kbd {
  font-family: monospace; font-size: 11.5px; background: var(--csb-input-bg);
  border: 1px solid var(--csb-border); border-bottom-width: 2px; border-radius: 6px;
  padding: 2px 7px; white-space: nowrap;
}
.csb-empty { text-align: center; color: var(--csb-fg-faint); font-size: 12.5px; padding: 18px 8px; }
.csb-toast {
  position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
  background: var(--csb-bg-2); color: var(--csb-fg); border: 1px solid var(--csb-border);
  padding: 9px 18px; border-radius: 24px; font-size: 13px; font-weight: 600;
  box-shadow: var(--csb-shadow); z-index: 2147483647; animation: csb-fade .18s ease-out;
  pointer-events: none; white-space: nowrap; max-width: 90vw;
}
@media (max-width: 340px) {
  .csb-set-layout { flex-direction: column; }
  .csb-set-nav { flex: none; flex-direction: row; flex-wrap: wrap; }
}
`;
