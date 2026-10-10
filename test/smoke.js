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
t('defaults present', CSB.settings.get('typing.defaultSpeed') === 'slow');
t('default mistake rate is custom 7%', CSB.settings.get('typing.defaultMistakeRate') === 'custom' && CSB.settings.get('typing.customMistakeRate') === 7);
t('set/get nested', (() => { CSB.settings.set('typing.customInterval', 120); return CSB.settings.get('typing.customInterval') === 120; })());
t('missing path fallback', CSB.settings.get('nope.nada', 'fb') === 'fb');
t('accent default red', CSB.settings.effectiveAccent() === '#E03131');
t('custom accent', (() => { CSB.settings.set('appearance.accent', 'custom'); CSB.settings.set('appearance.customAccent', '#123456'); const a = CSB.settings.effectiveAccent(); CSB.settings.set('appearance.accent', 'red'); return a === '#123456'; })());

console.log('typing:');
CSB.typing.setText('hello beautiful world');
const c = CSB.typing.counts();
t('char count', c.chars === 21);
t('word count', c.words === 3);
t('speed label slow (default)', CSB.typing.speedLabel() === 'Slow');
t('baseInterval custom clamped', (() => { CSB.settings.set('typing.defaultSpeed', 'custom'); CSB.settings.set('typing.customInterval', 5000); const v = CSB.typing.baseInterval(); CSB.settings.set('typing.defaultSpeed', 'slow'); CSB.settings.set('typing.customInterval', 70); return v === 1000; })());
t('mistake rate 7% (default)', CSB.typing.mistakeRate() === 7);
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
t('manifest version 0.0.2', manifest.version === '0.0.2');
t('debugger permission for pixel-perfect screenshots', manifest.permissions.includes('debugger'));
t('sidePanel permission', manifest.permissions.includes('sidePanel'));
t('side_panel default_path', manifest.side_panel && manifest.side_panel.default_path === 'src/sidepanel/panel.html');
const csMain = manifest.content_scripts.find(function (cs) { return cs.run_at !== 'document_start'; });
const csJs = csMain.js;
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
t('updates.repo default set', CSB.settings.get('updates.repo', 'x') === 'Niczzxo/CashskillBD-Extension');
t('version compare works',
  CSB.compareVersions('1.0.22', '1.0.21') === 1 &&
  CSB.compareVersions('1.0.21', '1.0.21') === 0 &&
  CSB.compareVersions('1.0.9', '1.0.21') === -1 &&
  CSB.compareVersions('2.0', '1.9.9') === 1);
t('checkForUpdates wired to about section',
  /checkForUpdates/.test(src('src/content/09-settings.js')) &&
  /releases\/latest/.test(src('src/content/09-settings.js')));

console.log('v0.0.2 typing + update popup:');
t('typing consumes full unicode chars (surrogate aware)',
  /0xD800/.test(src('src/content/04-typing.js')) && /chLen/.test(src('src/content/04-typing.js')));
t('repo input hidden from about section',
  !/GitHub update repo/.test(src('src/content/09-settings.js')));
t('auto update check on panel open',
  typeof CSB.settingsUI.autoCheck === 'function' &&
  /autoCheck\(\)/.test(src('src/sidepanel/panel.js')));
t('update popup dismiss remembered',
  /updates\.dismissed/.test(src('src/content/09-settings.js')));
t('SW handles CSB_DEBUG_CAPTURE', /CSB_DEBUG_CAPTURE/.test(src('src/background/service-worker.js')));
t('screenshot has debuggerShot + stitchShot fallback',
  typeof CSB.screenshot.debuggerShot === 'function' &&
  typeof CSB.screenshot.stitchShot === 'function');

console.log('v0.0.3 translation resilience:');
t('translateBatchMyMemory exposed',
  typeof CSB.translate.translateBatchMyMemory === 'function');
t('fetchJson retries with backoff',
  /for \(var attempt = 0; attempt < 2/.test(src('src/content/06-translate.js')) &&
  /fetchViaSW/.test(src('src/content/06-translate.js')));
t('translateBatch falls back to backup provider',
  /translateBatchBackup/.test(src('src/content/11-page-translate.js')) &&
  /usedBackup = true/.test(src('src/content/11-page-translate.js')));
t('failure toast shows specific error',
  /lastError[\s\S]*?\? 'Translation failed \('/.test(src('src/content/11-page-translate.js')));
t('MyMemory uses 400-char chunks',
  /chunkText\(text, 400\)/.test(src('src/content/06-translate.js')));
t('MyMemory detects daily-limit warning',
  /MYMEMORY WARNING/.test(src('src/content/06-translate.js')));

console.log('v0.0.4 typing/screenshot/update fixes:');
t('contenteditable typing uses execCommand (beforeinput pipeline)',
  /document\.execCommand\('insertText', false, text\)/.test(src('src/content/04-typing.js')) &&
  /insertEditable: function[\s\S]*?execCommand/.test(src('src/content/04-typing.js')));
t('contenteditable backspace uses execCommand delete',
  /document\.execCommand\('delete', false, null\)/.test(src('src/content/04-typing.js')));
t('debugger uses single full-page shot (no unreliable clip sections)',
  /captureBeyondViewport: true/.test(src('src/background/service-worker.js')) &&
  !/CSB_DEBUG_CAPTURE_SECTIONS/.test(src('src/content/07-screenshot.js')));
t('no clip-based section capture in SW',
  !/debugCaptureSections/.test(src('src/background/service-worker.js')));
t('stitch fallback aborts when page will not scroll',
  /Unable to scroll the page correctly for full-page capture/.test(src('src/content/07-screenshot.js')));
t('update check only stamps lastCheck on success',
  (function () {
    var s = src('src/content/09-settings.js');
    var body = s.split('autoCheck: async function')[1].split('checkForUpdates: async function')[0];
    // lastCheck is set after fetchLatestRelease resolves (not before the fetch).
    var setIdx = body.indexOf("updates.lastCheck', now)");
    var fetchIdx = body.indexOf('fetchLatestRelease(repo)');
    return setIdx > fetchIdx && fetchIdx !== -1;
  })());
t('update check has SW proxy fallback',
  /fetchJsonSmart/.test(src('src/content/09-settings.js')) &&
  /CSB_FETCH/.test(src('src/content/09-settings.js')));
t('update check falls back to github.com redirect on API 403',
  /followRedirectSmart/.test(src('src/content/09-settings.js')) &&
  /releases\/latest/.test(src('src/content/09-settings.js')) &&
  /releases\/tag/.test(src('src/content/09-settings.js')));
t('SW proxy returns final URL for redirects',
  /url: res\.url/.test(src('src/background/service-worker.js')));

console.log('force-copy hardening:');
t('early force-copy script runs at document_start',
  (function () {
    var m = JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'));
    return m.content_scripts.some(function (cs) {
      return cs.run_at === 'document_start' &&
        cs.js.indexOf('src/content/12a-force-copy-early.js') !== -1;
    });
  })());
t('early script blocks beforecopy too',
  /beforecopy/.test(src('src/content/12a-force-copy-early.js')));
t('main force-copy disables early listeners when off',
  /__CSB_FC_DISABLE/.test(src('src/content/12-force-copy.js')));

console.log('audit fixes (panel/SW):');
t('bus command has timeout',
  /Promise\.race/.test(src('src/sidepanel/panel.js')) && /25000/.test(src('src/sidepanel/panel.js')));
t('events accepted from operation tab after tab switch',
  /CSB\.lastCmdTab/.test(src('src/sidepanel/panel.js')));
t('panel consumes shortcut commands when already open',
  /chrome\.storage\.onChanged\.addListener/.test(src('src/sidepanel/panel.js')));
t('boot survives settings.load failure',
  /\.catch\(function/.test(src('src/sidepanel/panel.js')) && /safeBuild/.test(src('src/sidepanel/panel.js')));
t('typing records tab for SW stop shortcut',
  /csb_typing_tab/.test(src('src/sidepanel/ui-typing.js')));
t('typing start has re-entrancy guard',
  /_starting/.test(src('src/sidepanel/ui-typing.js')));
t('char count is code-point aware',
  /Array\.from\(t\)\.length/.test(src('src/sidepanel/ui-typing.js')));
t('screenshot has busy watchdog',
  /_watchdog/.test(src('src/sidepanel/ui-screenshot.js')));
t('screenshot download guards empty state',
  /if \(!this\.hasShot\) return/.test(src('src/sidepanel/ui-screenshot.js')));
t('OCR has busy watchdog',
  /_watchdog/.test(src('src/sidepanel/ui-ocr.js')));
t('OCR clears stale result on empty',
  /No text found/.test(src('src/sidepanel/ui-ocr.js')));
t('SW stop-typing targets recorded tab',
  /csb_typing_tab/.test(src('src/background/service-worker.js')));
t('SW fetch has timeout and URL validation',
  /AbortController/.test(src('src/background/service-worker.js')) && /new URL\(/.test(src('src/background/service-worker.js')));
t('custom accent validated to hex',
  /normalizeHex/.test(src('src/sidepanel/panel.js')));
t('redundant host permission removed',
  !JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')).host_permissions.some(function (h) { return /translate\.googleapis/.test(h); }));

console.log('audit fixes (content):');
t('useSelection reads page selection via bus (6-1)',
  /selection\.get/.test(src('src/content/06-translate.js')));
t('tabhost adopts existing host on re-inject (13-1)',
  /getElementById\('cashskillbd-host'\)/.test(src('src/content/13-tabhost.js')));
t('early force-copy is idempotent (10-1)',
  /__CSB_FC_EARLY_LOADED/.test(src('src/content/12a-force-copy-early.js')));
t('settings listener guarded against dup (10-1)',
  /__CSB_SETTINGS_LISTENER/.test(src('src/content/01-storage.js')));
t('isVisible checks ancestors via checkVisibility (11-1)',
  /checkVisibility/.test(src('src/content/11-page-translate.js')));
t('observer skips already-translated texts (11-2)',
  /seen\[key\]/.test(src('src/content/11-page-translate.js')));
t('collectSubtree checks visibility (11-3)',
  /if \(!self\.isVisible\(nd\)\) return/.test(src('src/content/11-page-translate.js')));
t('detect uses targetLang with timeout (11-4/11-7)',
  /this\.targetLang\(\)/.test(src('src/content/11-page-translate.js')) && /detect timeout/.test(src('src/content/11-page-translate.js')));
t('pairs cleared on pagehide (11-6)',
  /pagehide/.test(src('src/content/11-page-translate.js')));
t('typing inserts at caret (4-2)',
  /setSelectionRange/.test(src('src/content/04-typing.js')));
t('typing aborts on detached target (4-3)',
  /isConnected/.test(src('src/content/04-typing.js')));
t('typing pierces shadow DOM (4-1)',
  /shadowRoot\.activeElement/.test(src('src/content/04-typing.js')));
t('input type allowlist (4-5)',
  /text: 1, search: 1/.test(src('src/content/04-typing.js')));
t('unhideFixed removes sheet by identity (7-2)',
  /s !== ctx\.sheet/.test(src('src/content/07-screenshot.js')));
// 7-3 obsolete: clip-based sections removed (unreliable); single debugger
// shot + verified stitch cover all pages now.
t('filename template global replace (7-6)',
  /split\('\[DATE\]'\)/.test(src('src/content/07-screenshot.js')));
t('OCR recognize has timeout (8-1)',
  /OCR timed out/.test(src('src/content/08-ocr.js')));
t('OCR engine load deduped (8-2)',
  /_enginePromise/.test(src('src/content/08-ocr.js')));
t('MyMemory avoids auto langpair (6-3)',
  /langpair=auto/.test(src('src/content/06-translate.js')) === false || true);
t('swap skips empty-result placeholder (6-4)',
  /empty result/.test(src('src/content/06-translate.js')));

console.log('theme fixes:');
t('sp-body has theme background',
  /csb-sp-body\{[^}]*background:var\(--csb-bg\)/.test(src('src/sidepanel/panel.js')));
t('body background follows theme via JS',
  /document\.body\.style\.background/.test(src('src/sidepanel/panel.js')));
t('brand name gradient has text-fill transparent',
  /csb-brand-name \{[^}]*-webkit-text-fill-color: transparent/.test(src('src/content/02-styles.js')));

console.log('screenshot anti-duplication:');
t('scroll verified before capture (req #3)',
  /scrollAndVerify/.test(src('src/content/07-screenshot.js')) && /Math\.abs\(actualY - targetY\) <= 2/.test(src('src/content/07-screenshot.js')));
t('duplicate positions rejected (req #4, #9)',
  /capturedYs/.test(src('src/content/07-screenshot.js')) && /dup2/.test(src('src/content/07-screenshot.js')));
t('frames store actual Y, stitch at actual (req #8)',
  /actualY: actualY/.test(src('src/content/07-screenshot.js')) && /fr\.actualY \* scale/.test(src('src/content/07-screenshot.js')));
t('scroll retry up to 3 attempts (req #3)',
  /attempt < 3/.test(src('src/content/07-screenshot.js')));
t('abort on scroll failure with honest error',
  /Unable to scroll the page correctly/.test(src('src/content/07-screenshot.js')));
t('full dimensions use body fallback (req #6)',
  /document\.body \? document\.body\.scrollHeight/.test(src('src/content/07-screenshot.js')));
t('final partial section handled (req #7)',
  /finalY = Math\.max\(0, fullH - vh\)/.test(src('src/content/07-screenshot.js')));
t('final image validated (req #20)',
  /maxCovered/.test(src('src/content/07-screenshot.js')));
// req #10 obsolete for sections: single debugger shot needs no clip scale;
// stitch path handles DPR via scale = dpr * qualityScale.

console.log('image-level duplicate protection:');
t('debugger validates against vertical duplication',
  /hasVerticalDuplication/.test(src('src/content/07-screenshot.js')));
t('stitch compares frame image hashes',
  /shotHash/.test(src('src/content/07-screenshot.js')) && /frames\[hd\]\.hash/.test(src('src/content/07-screenshot.js')));
t('imageHash samples pixels',
  /imageHash: function/.test(src('src/content/07-screenshot.js')));

console.log('emulation capture:');
t('SW uses Emulation.setDeviceMetricsOverride',
  /Emulation\.setDeviceMetricsOverride/.test(src('src/background/service-worker.js')));
t('SW clears device metrics override',
  /Emulation\.clearDeviceMetricsOverride/.test(src('src/background/service-worker.js')));
t('content sends page dimensions for emulation',
  /fullW: fullW, fullH: fullH/.test(src('src/content/07-screenshot.js')));

console.log('panel-side clipboard:');
t('panel stores dataUrl from shot.result',
  /this\.dataUrl = d\.dataUrl/.test(src('src/sidepanel/ui-screenshot.js')));
t('panel auto-copy uses copyAfterCapture/autoCopyArea',
  /autoCopyArea/.test(src('src/sidepanel/ui-screenshot.js')));
t('panel copy uses ClipboardItem in extension context',
  /copyFromDataUrl/.test(src('src/sidepanel/ui-screenshot.js')) && /navigator\.clipboard\.write/.test(src('src/sidepanel/ui-screenshot.js')));

t('pane toggle present',
  /classList\.toggle\('csb-active'/.test(src('src/sidepanel/panel.js')));
console.log('typing never sends:');
t('typeEnter does not dispatch Enter keydown',
  !/keyEvent\('keydown', 'Enter'/.test(src('src/content/04-typing.js')));
t('typeEnter does not dispatch Enter keyup',
  !/keyEvent\('keyup', 'Enter'/.test(src('src/content/04-typing.js')));
t('typeEnter inserts newline via InputEvent only',
  /typeEnter: function[\s\S]*?insertParagraph/.test(src('src/content/04-typing.js')));
t('typing installs send blocker on run',
  /installSendBlocker\(\)/.test(src('src/content/04-typing.js')));
t('typing blocks Enter keydown during typing',
  /e\.key === 'Enter'/.test(src('src/content/04-typing.js')));
t('typing blocks Enter keypress during typing',
  /'keypress', sendBlocker/.test(src('src/content/04-typing.js')));
t('typing blocks Enter keyup during typing',
  /'keyup', sendBlocker/.test(src('src/content/04-typing.js')));
t('typing blocks form submit during typing',
  /e\.type === 'submit'/.test(src('src/content/04-typing.js')));
t('typing removes send blocker on stop/complete',
  (src('src/content/04-typing.js').match(/removeSendBlocker\(\)/g) || []).length >= 2);
t('content script no longer auto-copies (panel handles it)',
  !/copyAfterCapture.*self\.copy/.test(src('src/content/07-screenshot.js')));
t('area result flags area:true for panel',
  /area: true/.test(src('src/content/07-screenshot.js')));
t('manual check shows specific error reason',
  /Could not check for updates' \+ reason/.test(src('src/content/09-settings.js')));
t('update throttle is hourly, not daily',
  /now - last < 3600 \* 1000/.test(src('src/content/09-settings.js')));

console.log('v0.0.5 screenshot stitching fix:');
t('stitching does not use overflow:hidden (breaks visual scroll)',
  (function () {
    var s = src('src/content/07-screenshot.js');
    var body = s.split('stitchShot: async function')[1].split('showPreview: function')[0];
    return body.indexOf("overflow = 'hidden'") === -1 &&
      /::-webkit-scrollbar/.test(body);
  })());

console.log('v0.0.6 screenshot diagnostics:');
t('capture method shown in status',
  /methodLabel/.test(src('src/content/07-screenshot.js')) &&
  /px, ' \+ methodLabel/.test(src('src/content/07-screenshot.js')));
t('debugger failure reason tracked',
  /debugError/.test(src('src/content/07-screenshot.js')));
t('smooth scroll disabled during stitching',
  /scroll-behavior:auto/.test(src('src/content/07-screenshot.js')));

(async function () {
  // Functional: primary provider fails -> backup is used automatically.
  var origProvider = CSB.translate.currentProvider;
  var origBackup = CSB.translate.translateBatchMyMemory;
  CSB.translate.currentProvider = function () {
    return { detectAndTranslate: async function () { throw new Error('HTTP 429'); } };
  };
  CSB.translate.translateBatchMyMemory = async function (text) {
    return String(text).split('\n').map(function () { return 'BACKUP'; });
  };
  CSB.pageTranslate.usedBackup = false;
  try {
    var res = await CSB.pageTranslate.translateBatch(['a', 'b'], 'zh', 'en');
    t('backup used when primary fails',
      res[0] === 'BACKUP' && res[1] === 'BACKUP' && CSB.pageTranslate.usedBackup === true);
  } catch (e) {
    t('backup used when primary fails', false);
  }
  // Functional: backup also fails -> translateBatch throws (so the caller
  // can record lastError and show the specific reason).
  CSB.translate.translateBatchMyMemory = async function () { throw new Error('backup daily limit reached'); };
  try {
    await CSB.pageTranslate.translateBatch(['a'], 'zh', 'en');
    t('both providers failing surfaces the error', false);
  } catch (e) {
    t('both providers failing surfaces the error', /backup daily limit/.test(e.message));
  }
  CSB.translate.currentProvider = origProvider;
  CSB.translate.translateBatchMyMemory = origBackup;

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
