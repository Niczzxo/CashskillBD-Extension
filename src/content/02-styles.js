/* CashSkillBD — 02-styles.js : PREMIUM UI stylesheet.
 * Injected as a constructed stylesheet into the shadow root, so page CSP
 * (style-src) cannot block it and page styles cannot leak in.
 *
 * Premium design language:
 * - Deep obsidian surfaces with subtle blue undertone
 * - Signature crimson→amber gradient accents with soft glow
 * - Layered depth: inner highlights, soft shadows, glassy header
 * - Refined typography: tight headings, generous whitespace
 * - Buttery micro-interactions throughout
 */
'use strict';

CSB.CSS = `
/* ============ base ============ */
.csb-root, .csb-root * { box-sizing: border-box; }
.csb-root {
  --csb-accent: #ff3d3d;
  --csb-accent-2: #ff8a3d;
  --csb-accent-grad: linear-gradient(135deg, #ff3d3d 0%, #ff6a3d 55%, #ff8a3d 100%);
  --csb-accent-soft: rgba(255,61,61,.12);
  --csb-accent-glow: rgba(255,61,61,.35);
  --csb-bg: #0c0c11;
  --csb-bg-2: #121218;
  --csb-card: #15151d;
  --csb-card-hi: rgba(255,255,255,.035);
  --csb-border: rgba(255,255,255,.08);
  --csb-border-hi: rgba(255,255,255,.14);
  --csb-fg: #f4f4f6;
  --csb-fg-dim: #b8b8c2;
  --csb-fg-faint: #7c7c88;
  --csb-input-bg: #0e0e13;
  --csb-shadow: 0 12px 40px rgba(0,0,0,.5);
  --csb-shadow-sm: 0 4px 16px rgba(0,0,0,.35);
  --csb-radius: 14px;
  --csb-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-family: var(--csb-font);
  color: var(--csb-fg);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.csb-root[data-theme="light"] {
  --csb-accent-soft: rgba(255,61,61,.08);
  --csb-accent-glow: rgba(255,61,61,.22);
  --csb-bg: #fafafc;
  --csb-bg-2: #f1f1f5;
  --csb-card: #ffffff;
  --csb-card-hi: rgba(255,255,255,.6);
  --csb-border: rgba(20,20,40,.09);
  --csb-border-hi: rgba(20,20,40,.16);
  --csb-fg: #17171c;
  --csb-fg-dim: #4c4c58;
  --csb-fg-faint: #8e8e99;
  --csb-input-bg: #f4f4f7;
  --csb-shadow: 0 12px 32px rgba(30,30,60,.14);
  --csb-shadow-sm: 0 4px 14px rgba(30,30,60,.1);
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
  animation: csb-slide-in .35s cubic-bezier(.2,.8,.25,1);
  container-type: inline-size;
}
@keyframes csb-slide-in { from { transform: translateX(32px); opacity: 0; } to { transform: none; opacity: 1; } }
/* Minimized state: small round floating logo button at the top of the screen */
.csb-minbtn {
  position: fixed; top: 12px; right: 12px; z-index: 2147483647;
  width: 48px; height: 48px; border-radius: 50%;
  border: 2px solid transparent;
  background: var(--csb-accent-grad) border-box;
  -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
  padding: 0; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 20px var(--csb-accent-glow);
  pointer-events: auto;
  transition: transform .18s cubic-bezier(.2,.8,.3,1.2), box-shadow .18s;
  animation: csb-fade .25s ease-out;
}
.csb-minbtn:hover { transform: scale(1.12); box-shadow: 0 6px 28px var(--csb-accent-glow); }
.csb-minbtn:focus-visible { outline: 2px solid var(--csb-accent); outline-offset: 3px; }
.csb-minbtn img { width: 34px; height: 34px; border-radius: 50%; display: block; }

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
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--csb-border);
  background: linear-gradient(180deg, var(--csb-card-hi), transparent), var(--csb-bg-2);
  flex: 0 0 auto;
  position: relative;
}
.csb-head::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 1px;
  background: linear-gradient(90deg, transparent, var(--csb-accent-glow), transparent);
  opacity: .5; pointer-events: none;
}
.csb-logo {
  width: 38px; height: 38px; border-radius: 12px; flex: 0 0 auto;
  box-shadow: 0 4px 16px rgba(0,0,0,.4), 0 0 0 1px var(--csb-border-hi);
}
.csb-brand { flex: 1 1 auto; min-width: 0; }
.csb-brand-name {
  font-weight: 800; font-size: 17px; letter-spacing: -.3px;
  white-space: nowrap;
  background: linear-gradient(120deg, var(--csb-fg) 60%, var(--csb-fg-dim));
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.csb-brand-name .csb-bd {
  background: var(--csb-accent-grad);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.csb-head-actions { display: flex; gap: 6px; }
.csb-icon-btn {
  width: 32px; height: 32px; border-radius: 10px; border: 1px solid transparent;
  background: transparent; color: var(--csb-fg-dim); font-size: 15px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
  transition: background .16s, color .16s, border-color .16s, transform .16s;
}
.csb-icon-btn:hover { background: var(--csb-accent-soft); color: var(--csb-fg); border-color: var(--csb-border); transform: translateY(-1px); }
.csb-icon-btn:active { transform: translateY(0) scale(.94); }
.csb-icon-btn:focus-visible { outline: 2px solid var(--csb-accent); outline-offset: 2px; }

/* ============ nav tabs ============ */
.csb-nav {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px; padding: 12px 14px;
  border-bottom: 1px solid var(--csb-border);
  background: var(--csb-bg);
  flex: 0 0 auto;
}
.csb-tab {
  min-width: 0;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px 4px; border-radius: 12px;
  border: 1px solid var(--csb-border);
  background: linear-gradient(180deg, var(--csb-card-hi), transparent), var(--csb-card);
  color: var(--csb-fg-dim); font-size: 12.5px; font-weight: 650; cursor: pointer;
  transition: transform .14s, background .18s, color .18s, border-color .18s, box-shadow .18s;
  white-space: nowrap; overflow: hidden;
  letter-spacing: .1px;
}
.csb-tab .csb-ico { font-size: 16px; flex: 0 0 auto; filter: saturate(.9); }
.csb-tab .csb-tab-label { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
/* Narrow panel: icon-only tabs, never overlapping */
@container (max-width: 440px) {
  .csb-tab { padding: 10px 2px; }
  .csb-tab .csb-tab-label { display: none; }
  .csb-tab .csb-ico { font-size: 18px; }
}
.csb-tab:hover { color: var(--csb-fg); border-color: var(--csb-border-hi); transform: translateY(-1px); box-shadow: var(--csb-shadow-sm); }
.csb-tab.csb-active {
  background: var(--csb-accent-grad); border-color: transparent; color: #fff;
  box-shadow: 0 4px 18px var(--csb-accent-glow), inset 0 1px 0 rgba(255,255,255,.25);
  text-shadow: 0 1px 2px rgba(0,0,0,.25);
}
.csb-tab.csb-active .csb-ico { filter: none; }
.csb-tab:focus-visible { outline: 2px solid var(--csb-accent); outline-offset: 2px; }

/* ============ body / cards ============ */
/* Scrollbars are hidden for a clean premium look — scrolling still works
   via mouse wheel, trackpad, touch, and keyboard. */
.csb-body { flex: 1 1 auto; overflow-y: auto; padding: 16px 14px 24px; scrollbar-width: none; -ms-overflow-style: none; }
.csb-body::-webkit-scrollbar { width: 0; height: 0; display: none; }
.csb-sp-root *::-webkit-scrollbar { width: 0; height: 0; display: none; }
.csb-sp-root * { scrollbar-width: none; -ms-overflow-style: none; }
.csb-pane { display: none; }
.csb-pane.csb-pane-active { display: block; }
@keyframes csb-fade { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
.csb-card {
  background: linear-gradient(180deg, var(--csb-card-hi), transparent 40%), var(--csb-card);
  border: 1px solid var(--csb-border);
  border-radius: var(--csb-radius); padding: 16px; margin-bottom: 14px;
  box-shadow: var(--csb-shadow-sm), inset 0 1px 0 rgba(255,255,255,.04);
  position: relative;
  overflow: hidden;
}
.csb-card::before {
  content: ""; position: absolute; top: 0; left: 16px; right: 16px; height: 1px;
  background: linear-gradient(90deg, transparent, var(--csb-border-hi), transparent);
  opacity: .6; pointer-events: none;
}
.csb-card h3 {
  margin: 0 0 12px; font-size: 11.5px; font-weight: 750;
  text-transform: uppercase; letter-spacing: 1.2px; color: var(--csb-fg-faint);
}
.csb-title { font-size: 15.5px; font-weight: 750; margin: 0 0 14px; display: flex; align-items: center; gap: 9px; letter-spacing: -.2px; }
.csb-hint { font-size: 12px; color: var(--csb-fg-faint); margin: 7px 0 0; line-height: 1.55; }
.csb-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.csb-row + .csb-row { margin-top: 12px; }
.csb-field { flex: 1 1 140px; min-width: 0; }
.csb-field label { display: block; font-size: 11.5px; font-weight: 650; color: var(--csb-fg-dim); margin-bottom: 6px; letter-spacing: .2px; }
.csb-input, .csb-select, .csb-textarea {
  width: 100%; background: var(--csb-input-bg); color: var(--csb-fg);
  border: 1px solid var(--csb-border); border-radius: 10px;
  padding: 10px 12px; font-size: 13.5px; font-family: inherit;
  transition: border-color .16s, box-shadow .16s, background .16s;
}
.csb-input:hover, .csb-select:hover, .csb-textarea:hover { border-color: var(--csb-border-hi); }
.csb-input:focus, .csb-select:focus, .csb-textarea:focus {
  outline: none; border-color: var(--csb-accent);
  box-shadow: 0 0 0 3px var(--csb-accent-soft), 0 2px 12px rgba(0,0,0,.2);
  background: var(--csb-bg-2);
}
.csb-textarea { min-height: 130px; resize: vertical; line-height: 1.6; }
.csb-select {
  appearance: none; cursor: pointer; padding-right: 32px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 12px center;
}
.csb-counts { display: flex; gap: 16px; font-size: 11.5px; color: var(--csb-fg-faint); margin-top: 8px; }
.csb-counts b { color: var(--csb-fg-dim); font-weight: 700; }

/* ============ buttons ============ */
.csb-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 18px; border-radius: 12px; font-size: 13.5px; font-weight: 700;
  border: 1px solid transparent; cursor: pointer;
  font-family: inherit; white-space: nowrap; letter-spacing: .15px;
  transition: transform .13s cubic-bezier(.2,.8,.3,1.2), filter .16s, box-shadow .18s, background .16s, border-color .16s;
  will-change: transform;
  position: relative; overflow: hidden;
}
.csb-btn::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,.18), transparent 55%);
  opacity: 0; transition: opacity .16s; pointer-events: none;
}
.csb-btn:hover:not(:disabled)::after { opacity: 1; }
.csb-btn:focus-visible { outline: 2px solid var(--csb-accent); outline-offset: 2px; }
.csb-btn:disabled { opacity: .45; cursor: not-allowed; }
.csb-btn-primary {
  background: var(--csb-accent-grad); color: #fff;
  box-shadow: 0 4px 18px var(--csb-accent-glow), inset 0 1px 0 rgba(255,255,255,.28);
  text-shadow: 0 1px 2px rgba(0,0,0,.22);
}
.csb-btn-primary:hover:not(:disabled) { filter: brightness(1.07); box-shadow: 0 6px 24px var(--csb-accent-glow), inset 0 1px 0 rgba(255,255,255,.28); transform: translateY(-1px); }
.csb-btn-stop { background: rgba(255,255,255,.07); color: var(--csb-fg); border-color: var(--csb-border); }
.csb-btn-stop:hover:not(:disabled) { background: linear-gradient(135deg, #e03131, #c92a2a); border-color: transparent; color: #fff; box-shadow: 0 4px 16px rgba(224,49,49,.4); }
.csb-btn-ghost { background: transparent; border-color: var(--csb-border); color: var(--csb-fg-dim); }
.csb-btn-ghost:hover:not(:disabled) { border-color: var(--csb-accent); color: var(--csb-fg); background: var(--csb-accent-soft); transform: translateY(-1px); }
.csb-btn-block { width: 100%; }
.csb-btn-sm { padding: 8px 14px; font-size: 12.5px; border-radius: 10px; }

/* ============ status / progress ============ */
.csb-status {
  display: flex; align-items: center; gap: 9px;
  font-size: 12.5px; font-weight: 600; color: var(--csb-fg-dim);
  background: var(--csb-bg-2); border: 1px solid var(--csb-border);
  padding: 10px 13px; border-radius: 11px; margin-top: 12px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
}
.csb-status .csb-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--csb-fg-faint); flex: 0 0 auto; box-shadow: 0 0 8px currentColor; }
.csb-status.csb-ok { border-color: rgba(47,158,68,.35); }
.csb-status.csb-ok .csb-dot { background: #40c057; color: #40c057; }
.csb-status.csb-busy .csb-dot { background: var(--csb-accent); color: var(--csb-accent); animation: csb-pulse 1.1s ease-in-out infinite; }
.csb-status.csb-err { border-color: rgba(224,49,49,.4); }
.csb-status.csb-err .csb-dot { background: #ff6b6b; color: #ff6b6b; }
.csb-status.csb-err { color: #ff8787; }
.csb-root[data-theme="light"] .csb-status.csb-err { color: #c92a2a; }
@keyframes csb-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(.8); } }
.csb-progress {
  height: 9px; background: var(--csb-input-bg); border: 1px solid var(--csb-border);
  border-radius: 7px; overflow: hidden; margin-top: 12px;
  box-shadow: inset 0 2px 4px rgba(0,0,0,.25);
}
.csb-progress > div {
  height: 100%; width: 0%;
  background: var(--csb-accent-grad);
  border-radius: 7px; transition: width .25s cubic-bezier(.2,.8,.3,1);
  box-shadow: 0 0 12px var(--csb-accent-glow);
  position: relative; overflow: hidden;
}
.csb-progress > div::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,.35) 50%, transparent 80%);
  animation: csb-shimmer 1.6s linear infinite;
}
@keyframes csb-shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
.csb-progress-label { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--csb-fg-faint); margin-top: 6px; font-weight: 600; }
.csb-result {
  background: var(--csb-input-bg); border: 1px solid var(--csb-border); border-radius: 11px;
  padding: 12px 14px; font-size: 13px; margin-top: 12px; max-height: 230px; overflow-y: auto;
  white-space: pre-wrap; word-break: break-word; line-height: 1.6;
  box-shadow: inset 0 2px 8px rgba(0,0,0,.18);
}
.csb-result:empty { display: none; }
.csb-preview-img {
  width: 100%; border-radius: 11px; border: 1px solid var(--csb-border-hi);
  margin-top: 12px; display: block; box-shadow: var(--csb-shadow-sm);
}

/* ============ floating controller ============ */
.csb-controller {
  position: fixed; z-index: 2147483647; width: 270px;
  background: var(--csb-bg-2); border: 1px solid var(--csb-border-hi); border-radius: 16px;
  box-shadow: var(--csb-shadow); overflow: hidden;
  font-size: 13px;
  pointer-events: auto;
}
.csb-controller.csb-pos-right { right: 16px; top: 50%; transform: translateY(-50%); }
.csb-controller.csb-pos-left { left: 16px; top: 50%; transform: translateY(-50%); }
.csb-controller.csb-pos-top-right { right: 16px; top: 16px; }
.csb-controller.csb-pos-bottom-right { right: 16px; bottom: 16px; }
.csb-ctl-head {
  display: flex; align-items: center; gap: 9px; padding: 10px 12px;
  background: var(--csb-accent-grad); color: #fff; cursor: grab; user-select: none;
  font-weight: 750; font-size: 13px; letter-spacing: .2px;
  text-shadow: 0 1px 2px rgba(0,0,0,.25);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.25);
}
.csb-ctl-head:active { cursor: grabbing; }
.csb-ctl-head img { width: 22px; height: 22px; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,.3); }
.csb-ctl-head .csb-sp { flex: 1; }
.csb-ctl-min { background: rgba(255,255,255,.2); border: none; color: #fff; width: 26px; height: 26px; border-radius: 8px; cursor: pointer; font-size: 14px; line-height: 1; transition: background .15s, transform .15s; }
.csb-ctl-min:hover { background: rgba(255,255,255,.32); transform: scale(1.08); }
.csb-ctl-body { padding: 12px 14px 14px; }
.csb-ctl-state { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 12.5px; margin-bottom: 9px; }
.csb-ctl-state .csb-dot { width: 9px; height: 9px; border-radius: 50%; background: #40c057; color: #40c057; box-shadow: 0 0 8px currentColor; animation: csb-pulse 1.2s infinite; }
.csb-ctl-meta { font-size: 12px; color: var(--csb-fg-dim); margin-top: 7px; }
.csb-ctl-meta b { color: var(--csb-fg); }
.csb-ctl-word { font-size: 12px; color: var(--csb-fg-faint); margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.csb-controller.csb-min .csb-ctl-body { display: none; }

/* ============ selection overlay (OCR) ============ */
.csb-select-overlay {
  position: fixed; inset: 0; z-index: 2147483647; cursor: crosshair;
  background: rgba(5,5,10,.45);
  pointer-events: auto;
  animation: csb-fade .18s ease-out;
}
.csb-select-box {
  position: absolute; border: 2px solid var(--csb-accent); background: rgba(255,61,61,.07);
  box-shadow: 0 0 0 9999px rgba(5,5,10,.45), 0 0 24px var(--csb-accent-glow); pointer-events: none;
  border-radius: 3px;
}
.csb-select-hint {
  position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
  background: var(--csb-bg-2); color: var(--csb-fg); border: 1px solid var(--csb-border-hi);
  padding: 9px 18px; border-radius: 22px; font-size: 12.5px; font-weight: 650;
  box-shadow: var(--csb-shadow); z-index: 2147483647; pointer-events: none; white-space: nowrap;
  letter-spacing: .2px;
}

/* ============ settings ============ */
.csb-set-layout { display: flex; gap: 12px; }
.csb-set-nav { flex: 0 0 122px; display: flex; flex-direction: column; gap: 5px; }
.csb-set-nav button {
  text-align: left; padding: 9px 11px; border-radius: 10px; border: 1px solid transparent;
  background: transparent; color: var(--csb-fg-dim); font-size: 12px; font-weight: 650;
  cursor: pointer; font-family: inherit; transition: all .15s; letter-spacing: .15px;
}
.csb-set-nav button:hover { background: var(--csb-accent-soft); color: var(--csb-fg); transform: translateX(2px); }
.csb-set-nav button.csb-active {
  background: var(--csb-accent-grad); color: #fff; border-color: transparent;
  box-shadow: 0 3px 12px var(--csb-accent-glow), inset 0 1px 0 rgba(255,255,255,.25);
  text-shadow: 0 1px 2px rgba(0,0,0,.2);
}
.csb-set-pages { flex: 1 1 auto; min-width: 0; }
.csb-set-page { display: none; }
.csb-set-page.csb-active { display: block; animation: csb-fade .18s ease-out; }
.csb-set-item { padding: 12px 0; border-bottom: 1px solid var(--csb-border); }
.csb-set-item:last-child { border-bottom: none; }
.csb-set-item .csb-set-label { font-size: 13px; font-weight: 650; margin-bottom: 3px; letter-spacing: .1px; }
.csb-set-item .csb-set-desc { font-size: 11.5px; color: var(--csb-fg-faint); margin-bottom: 9px; line-height: 1.55; }
.csb-toggle { position: relative; width: 42px; height: 24px; flex: 0 0 auto; cursor: pointer; }
.csb-toggle input { opacity: 0; width: 100%; height: 100%; position: absolute; margin: 0; cursor: pointer; }
.csb-toggle .csb-track {
  position: absolute; inset: 0; background: rgba(255,255,255,.12); border-radius: 20px;
  transition: background .18s; pointer-events: none;
  border: 1px solid var(--csb-border);
}
.csb-root[data-theme="light"] .csb-toggle .csb-track { background: rgba(0,0,0,.1); }
.csb-toggle .csb-track::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px;
  background: linear-gradient(180deg, #fff, #e8e8ec); border-radius: 50%;
  transition: transform .2s cubic-bezier(.2,.8,.3,1.2); box-shadow: 0 2px 6px rgba(0,0,0,.4);
}
.csb-toggle input:checked + .csb-track { background: var(--csb-accent-grad); border-color: transparent; box-shadow: 0 2px 10px var(--csb-accent-glow); }
.csb-toggle input:checked + .csb-track::after { transform: translateX(18px); }
.csb-toggle input:focus-visible + .csb-track { outline: 2px solid var(--csb-accent); outline-offset: 2px; }
.csb-set-flex { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.csb-seg { display: flex; flex-wrap: wrap; gap: 7px; }
.csb-seg button {
  padding: 8px 13px; border-radius: 10px; border: 1px solid var(--csb-border);
  background: var(--csb-input-bg); color: var(--csb-fg-dim); font-size: 12px; font-weight: 650;
  cursor: pointer; font-family: inherit; transition: all .15s;
}
.csb-seg button:hover { border-color: var(--csb-border-hi); color: var(--csb-fg); transform: translateY(-1px); }
.csb-seg button.csb-on {
  background: var(--csb-accent-grad); border-color: transparent; color: #fff;
  box-shadow: 0 3px 12px var(--csb-accent-glow), inset 0 1px 0 rgba(255,255,255,.25);
  text-shadow: 0 1px 2px rgba(0,0,0,.2);
}
.csb-seg button:focus-visible { outline: 2px solid var(--csb-accent); outline-offset: 1px; }
.csb-about-logo {
  width: 68px; height: 68px; border-radius: 18px; margin-bottom: 10px;
  box-shadow: 0 6px 20px rgba(0,0,0,.35), 0 0 0 1px var(--csb-border-hi);
}
.csb-about-ver { font-size: 12px; color: var(--csb-fg-faint); font-weight: 600; letter-spacing: .3px; }
.csb-about-dev { font-size: 13px; color: var(--csb-fg); font-weight: 700; letter-spacing: .3px; margin-top: 6px; }
.csb-about-dev span { color: var(--csb-accent); }
.csb-modal-back {
  position: fixed; inset: 0; background: rgba(4,4,8,.62); z-index: 2147483647;
  display: flex; align-items: center; justify-content: center; padding: 20px;
  pointer-events: auto; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  animation: csb-fade .2s ease-out;
}
.csb-modal {
  background: linear-gradient(180deg, var(--csb-card-hi), transparent 30%), var(--csb-bg-2);
  border: 1px solid var(--csb-border-hi); border-radius: 18px;
  max-width: 430px; width: 100%; max-height: 82vh; overflow-y: auto; padding: 22px;
  box-shadow: var(--csb-shadow);
  animation: csb-modal-in .28s cubic-bezier(.2,.8,.3,1.1);
}
@keyframes csb-modal-in { from { opacity: 0; transform: translateY(14px) scale(.96); } to { opacity: 1; transform: none; } }
.csb-modal h4 { margin: 0 0 12px; font-size: 16px; font-weight: 750; letter-spacing: -.2px; }
.csb-modal p, .csb-modal li { font-size: 13px; color: var(--csb-fg-dim); line-height: 1.6; }
.csb-modal ul { padding-left: 18px; margin: 8px 0; }
.csb-modal a { color: var(--csb-accent); font-weight: 650; }

/* ============ translate language bar (Google-style) ============ */
.csb-tr-langbar { display: flex; gap: 9px; align-items: center; margin-bottom: 14px; }
.csb-tr-langbar .csb-select { flex: 1 1 0; min-width: 0; }
.csb-tr-swap {
  flex: 0 0 auto; width: 36px; height: 36px; border-radius: 50%;
  border: 1px solid var(--csb-border); background: var(--csb-input-bg);
  color: var(--csb-fg-dim); font-size: 16px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: transform .3s cubic-bezier(.2,.8,.3,1.2), border-color .16s, color .16s, box-shadow .16s;
  font-family: inherit; padding: 0;
}
.csb-tr-swap:hover:not(:disabled) { border-color: var(--csb-accent); color: var(--csb-accent); transform: rotate(180deg); box-shadow: 0 2px 12px var(--csb-accent-glow); }
.csb-tr-swap:disabled { opacity: .35; cursor: not-allowed; }
.csb-tr-swap:focus-visible { outline: 2px solid var(--csb-accent); outline-offset: 2px; }
.csb-tr-meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 9px; font-size: 11.5px; color: var(--csb-fg-faint); font-weight: 600; }

/* ============ page translate bar (own shadow host, Google-style) ============ */
.csb-pt-bar {
  position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 11px;
  background: var(--csb-bg-2); color: var(--csb-fg);
  border: 1px solid var(--csb-border-hi); border-radius: 16px;
  padding: 9px 11px 9px 15px;
  box-shadow: var(--csb-shadow), 0 0 0 1px rgba(255,255,255,.03);
  font-family: var(--csb-font); font-size: 13px; line-height: 1.4;
  max-width: min(94vw, 660px); pointer-events: auto; white-space: nowrap;
  animation: csb-pt-in .3s cubic-bezier(.2,.8,.3,1.1);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
}
@keyframes csb-pt-in { from { opacity: 0; transform: translate(-50%, -10px) scale(.97); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
.csb-pt-bar .csb-pt-text { overflow: hidden; text-overflow: ellipsis; }
.csb-pt-bar .csb-pt-text b { font-weight: 700; }
.csb-pt-globe { font-size: 17px; flex: 0 0 auto; filter: drop-shadow(0 2px 4px rgba(0,0,0,.3)); }
.csb-pt-x {
  border: none; background: transparent; color: var(--csb-fg-faint);
  font-size: 18px; cursor: pointer; padding: 3px 9px; border-radius: 9px; line-height: 1;
  flex: 0 0 auto; font-family: inherit; transition: background .15s, color .15s, transform .15s;
}
.csb-pt-x:hover { color: var(--csb-fg); background: rgba(255,255,255,.08); transform: scale(1.1); }
.csb-pt-x:focus-visible { outline: 2px solid var(--csb-accent); outline-offset: 1px; }
.csb-pt-bar .csb-btn { flex: 0 0 auto; }

/* ============ motion (smooth, physics-feeling responses) ============ */
.csb-pane.csb-pane-active { animation: csb-pane-in .26s cubic-bezier(.2,.75,.3,1); }
@keyframes csb-pane-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
/* Cards rise in with a soft stagger when a tab opens */
.csb-pane.csb-pane-active .csb-card { animation: csb-card-in .34s cubic-bezier(.2,.75,.3,1) backwards; }
.csb-pane.csb-pane-active .csb-card:nth-of-type(2) { animation-delay: .06s; }
.csb-pane.csb-pane-active .csb-card:nth-of-type(3) { animation-delay: .12s; }
.csb-pane.csb-pane-active .csb-card:nth-of-type(4) { animation-delay: .18s; }
.csb-pane.csb-pane-active .csb-card:nth-of-type(5) { animation-delay: .24s; }
@keyframes csb-card-in { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
/* Tactile buttons */
.csb-btn:active:not(:disabled) { transform: scale(.95); transition-duration: .07s; }
.csb-tab:active:not(.csb-active) { transform: scale(.93); }
/* Floating elements glide, not jump */
.csb-minbtn, .csb-pt-bar { transition: transform .2s ease, box-shadow .2s ease; }
/* Respect users who prefer no motion */
@media (prefers-reduced-motion: reduce) {
  .csb-root *, .csb-root *::before, .csb-root *::after {
    animation-duration: .01ms !important; animation-delay: 0ms !important;
    transition-duration: .01ms !important;
  }
}

/* ============ misc ============ */
.csb-spinner {
  width: 16px; height: 16px; border-radius: 50%; flex: 0 0 auto;
  border: 2px solid var(--csb-border); border-top-color: var(--csb-accent);
  animation: csb-spin .7s linear infinite;
  box-shadow: 0 0 8px var(--csb-accent-glow);
}
@keyframes csb-spin { to { transform: rotate(360deg); } }
.csb-kbd {
  font-family: ui-monospace, monospace; font-size: 11.5px; font-weight: 600;
  background: var(--csb-input-bg);
  border: 1px solid var(--csb-border); border-bottom-width: 2px; border-radius: 7px;
  padding: 2px 8px; white-space: nowrap; color: var(--csb-fg-dim);
}
.csb-empty { text-align: center; color: var(--csb-fg-faint); font-size: 12.5px; padding: 20px 10px; line-height: 1.6; }
.csb-toast {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  background: var(--csb-bg-2); color: var(--csb-fg); border: 1px solid var(--csb-border-hi);
  padding: 10px 20px; border-radius: 26px; font-size: 13px; font-weight: 650;
  box-shadow: var(--csb-shadow); z-index: 2147483647;
  animation: csb-toast-in .25s cubic-bezier(.2,.8,.3,1.2);
  pointer-events: none; white-space: nowrap; max-width: 92vw;
  letter-spacing: .15px;
}
@keyframes csb-toast-in { from { opacity: 0; transform: translate(-50%, 10px) scale(.94); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
@media (max-width: 340px) {
  .csb-set-layout { flex-direction: column; }
  .csb-set-nav { flex: none; flex-direction: row; flex-wrap: wrap; }
}
`;
