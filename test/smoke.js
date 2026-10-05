/* CashSkillBD smoke tests — run with: node test/smoke.js
 * Stubs the browser environment and exercises the pure logic of each module,
 * plus static checks that the side-panel <-> tab bus/bridge stay in sync.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ---- browser stubs ----
const store = {};
const listeners = {};
const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  window: null, // set below (self-ref)
  document: {
    createElement: () => ({
      style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      appendChild() {}, addEventListener() {}, removeEventListener() {},
      setAttribute() {}, querySelector: () => null, querySelectorAll: () => [],
    }),
    addEventListener() {}, removeEventListener() {},
    documentElement: { style: {}, appendChild() {} },
    adoptedStyleSheets: [],
    activeElement: null,
  },
  CSSStyleSheet: function () { this.replaceSync = () => {}; },
  KeyboardEvent: function () {}, InputEvent: function () {},
  Image: function () {},
  ClipboardItem: function () {},
  fetch: async () => { throw new Error('no network in tests'); },
  navigator: { clipboard: { writeText: async () => {} } },
  chrome: {
    runtime: {
      getURL: (p) => 'chrome-extension://fake/' + p,
      getManifest: () => ({ version: '1.0.0' }),
      onMessage: { addListener: (fn) => { listeners.msg = fn; } },
      sendMessage: () => Promise.resolve({ ok: true }),
    },
    storage: {
      local: {
        get: async (k) => (typeof k === 'string' ? { [k]: store[k] } : {}),
        set: async (o) => Object.assign(store, o),
        remove: async (k) => { (Array.isArray(k) ? k : [k]).forEach((x) => delete store[x]); },
      },
    },
    tabs: { query: async () => [], sendMessage: async () => ({}), captureVisibleTab: async () => '', create: () => {} },
    scripting: { executeScript: async () => {} },
    action: { onClicked: { addListener: () => {} } },
    commands: { onCommand: { addListener: () => {} } },
    notifications: { create: () => {} },
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function load(rel) {
  vm.runInContext(src(rel), sandbox, { filename: rel });
}

// Tab-side modules (in manifest content_scripts order), plus the
// settings module (panel-only, but its pure logic is testable).
['src/content/00-util.js', 'src/content/01-storage.js', 'src/content/02-styles.js',
 'src/content/13-tabhost.js', 'src/content/04-typing.js', 'src/content/06-translate.js',
 'src/content/08-ocr.js', 'src/content/11-page-translate.js',
 'src/content/07-screenshot.js',
 'src/content/12-force-copy.js', 'src/content/09-settings.js',
].forEach(load);

const CSB = sandbox.window.CSB || sandbox.CSB;
let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

console.log('util:');
t('esc escapes HTML', CSB.util.esc('<b>"x"&') === '&lt;b&gt;&quot;x&quot;&amp;');
t('clamp', CSB.util.clamp(5, 20, 1000) === 20 && CSB.util.clamp(5000, 20, 1000) === 1000);
t('fmtDate shape', /^\d{4}-\d{2}-\d{2}$/.test(CSB.util.fmtDate(new Date(2026, 9, 5))));
t('fmtTime shape', /^\d{2}-\d{2}-\d{2}$/.test(CSB.util.fmtTime(new Date(2026, 9, 5, 9, 4, 7))));

console.log('storage:');
t('defaults present', CSB.settings.get('typing.defaultSpeed') === 'normal');
t('set/get nested', (() => { CSB.settings.set('typing.customInterval', 120); return CSB.settings.get('typing.customInterval') === 120; })());
t('missing path fallback', CSB.settings.get('nope.nada', 'fb') === 'fb');
t('accent default red', CSB.settings.effectiveAccent() === '#E03131');
t('custom accent', (() => { CSB.settings.set('appearance.accent', 'custom'); CSB.settings.set('appearance.customAccent', '#123456'); const a = CSB.settings.effectiveAccent(); CSB.settings.set('appearance.accent', 'red'); return a === '#123456'; })());

console.log('typing:');
CSB.typing.setText('hello beautiful world');
const c = CSB.typing.counts();
t('char count', c.chars === 21);
t('word count', c.words === 3);
t('speed label normal', CSB.typing.speedLabel() === 'Normal');
t('baseInterval custom clamped', (() => { CSB.settings.set('typing.defaultSpeed', 'custom'); CSB.settings.set('typing.customInterval', 5000); const v = CSB.typing.baseInterval(); CSB.settings.set('typing.defaultSpeed', 'normal'); CSB.settings.set('typing.customInterval', 70); return v === 1000; })());
t('mistake rate 2%', CSB.typing.mistakeRate() === 2);
t('correction delay 300', CSB.typing.correctionDelay() === 300);

console.log('translate:');
t('bn -> Bangla', CSB.translate.langName('bn') === 'Bangla');
t('fr -> French', CSB.translate.langName('fr') === 'French');
t('en -> English', CSB.translate.langName('en') === 'English');
t('provider registered', !!CSB.translate.providers.google && typeof CSB.translate.providers.google.detectAndTranslate === 'function');
t('ocr autoCopy default on', CSB.settings.get('ocr.autoCopy', 'x') === true);

console.log('pageTranslate:');
t('pageTranslate API surface',
  !!CSB.pageTranslate &&
  typeof CSB.pageTranslate.maybePrompt === 'function' &&
  typeof CSB.pageTranslate.translatePage === 'function' &&
  typeof CSB.pageTranslate.restorePage === 'function' &&
  typeof CSB.pageTranslate.renderBar === 'function');
t('promptEnabled default true', CSB.settings.get('pageTranslate.promptEnabled', 'x') === true);
t('autoTranslate default on', CSB.settings.get('pageTranslate.autoTranslate', 'x') === true);
console.log('ocr languages:');
t('OCR_LANGS has 21 entries', Array.isArray(CSB.OCR_LANGS) && CSB.OCR_LANGS.length === 21);
t('Chinese (Simplified) maps to chi_sim',
  CSB.OCR_LANGS.some(function (o) { return o[0] === 'zh-CN' && o[2] === 'chi_sim'; }));
t('all UI codes have tess mappings',
  CSB.OCR_LANGS.every(function (o) { return typeof o[2] === 'string' && o[2].length >= 3; }));
t('non-bundled langs use CDN langPath',
  /CDN_LANG_PATH/.test(src('src/content/08-ocr.js')) &&
  /cdn\.jsdelivr\.net\/gh\/naptha\/tessdata/.test(src('src/content/08-ocr.js')));
t('settings builds language dropdown from OCR_LANGS',
  /CSB\.OCR_LANGS/.test(src('src/content/09-settings.js')));
t('auto-translate toggle in settings', /Auto-translate pages/.test(src('src/content/09-settings.js')));
t('neverHosts default empty array',
  Array.isArray(CSB.settings.get('pageTranslate.neverHosts', 'x')) &&
  CSB.settings.get('pageTranslate.neverHosts').length === 0);
t('pt bar style present', /\.csb-pt-bar\s*\{[^}]*position:\s*fixed/.test(CSB.CSS));

console.log('screenshot area + forceCopy + motion:');
t('screenshot area API',
  typeof CSB.screenshot.startAreaSelect === 'function' &&
  typeof CSB.screenshot.setMode === 'function');
t('screenshot autoCopyArea default true', CSB.settings.get('screenshot.autoCopyArea', 'x') === true);
t('forceCopy API',
  !!CSB.forceCopy &&
  typeof CSB.forceCopy.enable === 'function' &&
  typeof CSB.forceCopy.disable === 'function' &&
  typeof CSB.forceCopy.apply === 'function');
t('forceCopy default enabled', CSB.settings.get('forceCopy.enabled', 'x') === true);
t('motion styles present',
  /@keyframes csb-pane-in/.test(CSB.CSS) &&
  /@keyframes csb-card-in/.test(CSB.CSS) &&
  /prefers-reduced-motion/.test(CSB.CSS));

console.log('screenshot:');
const fname = CSB.screenshot.filename();
t('filename pattern', /^CashSkillBD_FullPage_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.png$/.test(fname));
console.log('   e.g. ' + fname);

console.log('tabhost (CSB.panel stub):');
t('stub API present',
  typeof CSB.panel.ensureHost === 'function' &&
  typeof CSB.panel.toast === 'function' &&
  typeof CSB.panel.logoUrl === 'function');
t('open/close/toggle are safe no-ops',
  (() => { CSB.panel.open(); CSB.panel.close(); CSB.panel.toggle(); CSB.panel.shiftPage(); return true; })());
t('in-tab panel retired (no 03-panel.js)', !fs.existsSync(path.join(ROOT, 'src/content/03-panel.js')));
t('floating controller retired (no 05-controller.js)', !fs.existsSync(path.join(ROOT, 'src/content/05-controller.js')));

console.log('styles:');
t('CSS non-empty', typeof CSB.CSS === 'string' && CSB.CSS.length > 5000);
t('CSS has overlay + settings + tab styles', /csb-select-overlay/.test(CSB.CSS) && /csb-set-nav/.test(CSB.CSS) && /\.csb-tab\b/.test(CSB.CSS));
t('overlay/modal accept pointer events (no click-through)',
  /\.csb-select-overlay\s*\{[^}]*pointer-events:\s*auto/.test(CSB.CSS) &&
  /\.csb-modal-back\s*\{[^}]*pointer-events:\s*auto/.test(CSB.CSS));

console.log('sidepanel architecture:');
const manifest = JSON.parse(src('manifest.json'));
t('manifest version 0.0.1', manifest.version === '0.0.1');
t('debugger permission for pixel-perfect screenshots', manifest.permissions.includes('debugger'));
t('sidePanel permission', manifest.permissions.includes('sidePanel'));
t('side_panel default_path', manifest.side_panel && manifest.side_panel.default_path === 'src/sidepanel/panel.html');
const csJs = manifest.content_scripts[0].js;
t('content_scripts drop retired files',
  !csJs.some((f) => /03-panel|05-controller/.test(f)) && !csJs.includes('src/content/09-settings.js'));
t('content_scripts include tabhost', csJs.includes('src/content/13-tabhost.js'));
t('every content_script file exists', csJs.every((f) => fs.existsSync(path.join(ROOT, f))));
t('sidepanel files exist',
  ['src/sidepanel/panel.html', 'src/sidepanel/panel.js', 'src/sidepanel/ui-typing.js',
   'src/sidepanel/ui-screenshot.js', 'src/sidepanel/ui-ocr.js']
    .every((f) => fs.existsSync(path.join(ROOT, f))));

// Bus coverage: every CSB.bus.cmd('x') in the sidepanel must have a case 'x' in 10-content.js.
const panelSrc = ['src/sidepanel/panel.js', 'src/sidepanel/ui-typing.js',
  'src/sidepanel/ui-screenshot.js', 'src/sidepanel/ui-ocr.js'].map(src).join('\n');
const busSrc = src('src/content/10-content.js');
const cmds = new Set();
panelSrc.replace(/\.cmd\(\s*['"]([^'"]+)['"]/g, (m, g) => { cmds.add(g); return m; });
const missingCases = [...cmds].filter((cmd) => !new RegExp("case\\s+'" + cmd + "'\\s*:").test(busSrc));
t('bus commands all routed (' + cmds.size + ' cmds)', missingCases.length === 0);
if (missingCases.length) console.log('   missing: ' + missingCases.join(', '));

// Bridge coverage: every CSB.bridge.emit('y') must be routed in panel.js.
const tabSrc = ['src/content/04-typing.js', 'src/content/07-screenshot.js',
  'src/content/08-ocr.js', 'src/content/11-page-translate.js'].map(src).join('\n');
const emits = new Set();
tabSrc.replace(/\.emit\(\s*['"]([^'"]+)['"]/g, (m, g) => { emits.add(g); return m; });
const panelJs = src('src/sidepanel/panel.js');
const unrouted = [...emits].filter((e) => {
  const prefix = e.split('.')[0] + '.';
  return !(panelJs.includes("'" + prefix + "'") || panelJs.includes('"' + prefix + '"') || panelJs.includes("evt === '" + e + "'"));
});
t('bridge events all routed (' + emits.size + ' evts)', unrouted.length === 0);
if (unrouted.length) console.log('   unrouted: ' + unrouted.join(', '));

// Settings slim panel section for the native side panel.
t('settings panel section is native-aware', /Native side panel/.test(src('src/content/09-settings.js')));
// No floating-controller UI can be built anymore.
t('no controller build in tab boot', !/controller\.build/.test(src('src/content/10-content.js')));

console.log('v1.0.16 fixes:');
t('screenshot throttles captures (quota fix)', /captureVisibleThrottled/.test(src('src/content/07-screenshot.js')));
t('injection guard is version-aware', /__CSB_LOADED__ === CSB_VERSION/.test(src('src/content/10-content.js')));
t('SW handles CSB_ENSURE_CONTENT', /CSB_ENSURE_CONTENT/.test(src('src/background/service-worker.js')));
t('panel retries stale tabs with clear message',
  /CSB_ENSURE_CONTENT/.test(src('src/sidepanel/panel.js')) &&
  /Please reload this page/.test(src('src/sidepanel/panel.js')));

console.log('v1.0.20 csp + settings-sync fixes:');
t('SW handles CSB_FETCH proxy', /CSB_FETCH/.test(src('src/background/service-worker.js')));
t('settings sync via storage.onChanged',
  /storage\.onChanged\.addListener/.test(src('src/content/01-storage.js')));
t('translate falls back to SW fetch on CSP block',
  /fetchJson/.test(src('src/content/06-translate.js')) &&
  /CSB_FETCH/.test(src('src/content/06-translate.js')));
t('done bar only when text was actually translated',
  /else if \(!this\.pairs\.length\)/.test(src('src/content/11-page-translate.js')));

console.log('v1.0.21 full-audit fixes:');
t('settings sync re-applies forceCopy in tabs',
  /CSB\.forceCopy\) CSB\.forceCopy\.apply/.test(src('src/content/01-storage.js')));
t('ocr selection guards null panel root',
  /ensureHost\(\)[\s\S]*?if \(!root\)/.test(src('src/content/08-ocr.js')));
t('area select guards null panel root',
  /ensureHost\(\)[\s\S]*?if \(!root\)/.test(src('src/content/07-screenshot.js')));
t('detection runs even when prompt is off (auto-translate still works)',
  (function () {
    var s = src('src/content/11-page-translate.js');
    var tryDetectBody = s.split('tryDetect: function')[1].split('sampleText: function')[0];
    return tryDetectBody.indexOf("pageTranslate.promptEnabled', true)) return;") === -1 &&
      /promptEnabled.*return; \/\/ silent/.test(s);
  })());
t('shortcut settings button handles chrome:// block',
  /p\.catch\(done\)/.test(src('src/content/09-settings.js')));

console.log('v1.0.22 check-for-updates:');
t('updates.repo default set', CSB.settings.get('updates.repo', 'x') === 'omarfaruque90/cashskillbd');
t('version compare works',
  CSB.compareVersions('1.0.22', '1.0.21') === 1 &&
  CSB.compareVersions('1.0.21', '1.0.21') === 0 &&
  CSB.compareVersions('1.0.9', '1.0.21') === -1 &&
  CSB.compareVersions('2.0', '1.9.9') === 1);
t('checkForUpdates wired to about section',
  /checkForUpdates/.test(src('src/content/09-settings.js')) &&
  /releases\/latest/.test(src('src/content/09-settings.js')));
t('SW handles CSB_DEBUG_CAPTURE', /CSB_DEBUG_CAPTURE/.test(src('src/background/service-worker.js')));
t('screenshot has debuggerShot + stitchShot fallback',
  typeof CSB.screenshot.debuggerShot === 'function' &&
  typeof CSB.screenshot.stitchShot === 'function');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
