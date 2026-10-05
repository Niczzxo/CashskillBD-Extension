# CashSkillBD — Learn • Earn • Grow

A professional Chrome/Chromium (Manifest V3) browser extension: a productivity
assistant with four main tools — **human-like auto typing**, **auto language
detection + English translation**, **full-page screenshot**, and **screen text
selection + OCR**.

Clicking the CashSkillBD toolbar icon opens the extension as **Chrome's native
side panel** docked to the right of the browser — the website stays visible
and usable on the left, and the panel stays open as you switch tabs.

![CashSkillBD logo](icons/icon-128.png)

## Features

| Tab | What it does |
|-----|--------------|
| ⌨️ Typing | Human-like auto typing into any page input/textarea/contenteditable field. Configurable speed (Slow/Normal/Fast/Custom 20–1000ms), mistake simulation with self-correction (0–5% + custom), correction delay, natural timing variation, live progress shown inside the panel. |
| 🌐 Translate | Google-Translate-style: source/target language dropdowns with ⇄ swap, auto-translates as you type, detected-language label, copy button. **Full-website translation:** detects a foreign-language page and shows a Google-style translate bar to translate the entire page (with Show original + Never for this site). Provider is replaceable. |
| 📸 Screenshot | **Pixel-perfect full-page capture** in one shot via Chrome's debugger (no stitching), with preview, copy-to-clipboard, and PNG/JPG download (`CashSkillBD_FullPage_YYYY-MM-DD_HH-MM-SS.png`). |
| 🔤 Text Select | Drag a rectangle over any visible region (images, canvas, non-selectable text) and extract text with on-device OCR (Tesseract.js). **21 languages**: English, Bangla, Hindi bundled; Chinese (Simplified/Traditional), Arabic, Spanish, French, German, Russian, Japanese, Korean and more download on first use. Copy or clear the result. |
| ⚙️ Settings | 10 categories: Appearance, Panel, Auto Typing, Translation, Screenshot, OCR, Shortcuts, Notifications, Privacy, About. |

### Keyboard shortcuts (defaults — changeable in `chrome://extensions/shortcuts`)

| Action | Shortcut |
|--------|----------|
| Open CashSkillBD | Ctrl + Shift + C |
| Start typing | Ctrl + Shift + S |
| Stop typing | Ctrl + Shift + X |
| Full-page screenshot | Ctrl + Shift + P |
| Screen text select (OCR) | *(not set by default — Chrome allows max 4 default shortcuts; assign it yourself below)* |

Open `chrome://extensions/shortcuts` to change any shortcut or to assign one
for *Screen text select (OCR)* (e.g. Ctrl + Shift + T). The Settings →
Shortcuts tab inside the extension has a direct button for this page.

## Requirements

- Chrome 109+ / Chromium 109+ / Edge 109+ / Brave (Manifest V3 support)
- Internet access for the translation endpoint (OCR works fully offline)

## Installation (developer / unpacked mode)

1. Download or clone this folder, e.g. `cashskillbd/`.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (toggle, top-right).
4. Click **Load unpacked** and select the `cashskillbd/` folder.
5. Pin CashSkillBD to the toolbar (puzzle icon → pin), then click the
   CashSkillBD logo to open the side panel.

No build step is required — the extension is dependency-free vanilla JS
(the OCR engine, Tesseract.js 5, is vendored under `src/lib/tesseract/`).

## Project structure

```
cashskillbd/
├── manifest.json                  # Manifest V3, permissions, commands
├── icons/                         # Official CashSkillBD logo (16/32/48/128)
├── src/
│   ├── background/
│   │   └── service-worker.js      # Icon click, commands, captureVisibleTab,
│   │                              #   lazy OCR injection, notifications
│   ├── content/                   # Auto-injected into every tab (engines)
│   │   ├── 00-util.js             # Shared helpers
│   │   ├── 01-storage.js          # Settings defaults + storage manager
│   │   ├── 02-styles.js           # Full UI stylesheet
│   │   ├── 13-tabhost.js          # Bare in-tab host (overlays, toasts)
│   │   ├── 04-typing.js           # Human-like typing engine
│   │   ├── 06-translate.js        # Translation providers (+ panel UI)
│   │   ├── 09-settings.js         # Settings UI (10 categories; used by the side panel)
│   │   ├── 07-screenshot.js       # Full-page stitch engine
│   │   ├── 08-ocr.js              # Selection overlay + OCR engine
│   │   ├── 11-page-translate.js   # Full-website translation engine + bar
│   │   ├── 12-force-copy.js       # Copy-block bypass
│   │   └── 10-content.js          # Bootstrap + side panel <-> tab bus
│   ├── sidepanel/                 # Native side panel UI (extension page)
│   │   ├── panel.html             # Panel page
│   │   ├── panel.js               # Frame, tabs, theme, bus, event routing
│   │   ├── ui-typing.js           # Typing tab (progress inside the panel)
│   │   ├── ui-screenshot.js       # Screenshot tab
│   │   └── ui-ocr.js              # Text Select tab
│   └── lib/
│       └── tesseract/             # Vendored Tesseract.js 5 (offline OCR)
│           ├── tesseract.min.js / worker.min.js
│           ├── tesseract-core.wasm.js / .wasm
│           └── lang/eng|ben|hin.traineddata.gz
└── test/smoke.js                  # Node smoke tests (pure logic)
```

## Development

Edit files under `src/`, then reload the extension at `chrome://extensions`
(the ⟳ button on the CashSkillBD card). Content scripts are injected
programmatically, so a page refresh picks up changes after the extension reload.

Run the smoke tests (syntax + pure-logic checks):

```bash
node test/smoke.js
```

## Permissions — why each is needed

| Permission | Used for |
|------------|----------|
| `activeTab` | Interact with the current page when you invoke the extension |
| `scripting` | Inject the panel/typing/OCR scripts into tabs |
| `storage` | Save your settings locally (`chrome.storage.local`) |
| `notifications` | Subtle completion notices (typing/screenshot/OCR/translation — each toggleable) |
| `clipboardWrite` | Copy screenshots and text to the clipboard |
| `sidePanel` | Show the UI in Chrome's native side panel |
| `<all_urls>` (Site access: On all sites) | Run on every website: auto page-language detection, force text selection, and keeping the panel open across tabs — no click needed per site |
| `https://translate.googleapis.com/*` | Translation endpoint (default provider) |

CashSkillBD does **not** request history, bookmarks, or any account access.

## Configuration

- All settings live in the in-app Settings tab (⚙️) and persist in
  `chrome.storage.local`. Turn off *Privacy → Save preferences locally* for
  session-only settings.
- To swap the translation backend, implement the provider interface in
  `src/content/06-translate.js` (`{ id, name, detectAndTranslate }`),
  register it in `CSB.translate.providers`, and select it in Settings.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Panel doesn't open on a page | `chrome://` pages, the Chrome Web Store, and `chrome-extension://` pages block extensions — try a normal website. |
| "Please click inside a supported input field first" | Click into a text field on the page, then press START (or enable *Auto focus detection* and click the field when prompted). |
| Typing doesn't register in a web app | The engine dispatches native `input`/`beforeinput`/keyboard events; if a site still ignores it, try the *Slow* speed. |
| Screenshot shows repeated/duplicated headers | Fixed/sticky elements are auto-hidden during capture; the debugger capture path (v1.0.19+) avoids stitching artifacts entirely — some exotic layouts may still duplicate, report the site. |
| OCR finds no text | Try the *High* accuracy setting, select a larger region, or switch OCR language to match the text. |
| Translation fails | Check internet access; the free endpoint is rate-limited — wait a moment and retry. |
| Shortcut conflicts | Change them at `chrome://extensions/shortcuts` (Settings → Shortcuts has a direct button). |

## Privacy

- Preferences stay in your browser. No account, no analytics, no tracking.
- **OCR is 100% on-device** — selections never leave the browser.
- **Translation** sends only the text you explicitly translate to the selected
  provider (disclosed in Settings → Translation).
- CashSkillBD **never reads password fields, never logs private page text,
  never uploads screenshots**, and the typing simulator is a productivity /
  testing aid — it is not designed to bypass CAPTCHAs, bot detection, or
  website security controls.

## Version

**0.0.1** — renumbered from 1.0.22 (fresh versioning). GitHub: omarfaruque90/cashskillbd.

**1.0.22** — "Check for updates" now really works: set your GitHub repo (Settings → About → GitHub update repo), push the extension, and create a Release per version tagged like v1.0.22 with the zip attached — the button compares with the latest release and offers the download.

**1.0.21** — full-extension audit: fixed (1) settings changes (e.g. force-copy toggle) now re-apply live in every tab, (2) OCR/area-select no longer crash if triggered before page boot finishes, (3) turning the translate prompt OFF no longer kills auto-translate, (4) the "customize shortcuts" button now handles Chrome's chrome:// block gracefully; updated OCR/privacy docs.

**1.0.20** — fixed 2 real bugs: (1) **settings sync** — a language picked in Settings now reaches the tab instantly (OCR was using the old language); (2) **page translation on strict sites** (e.g. Taobao) — translate requests now fall back through the service worker when the page's CSP blocks them, and the bar only claims "Translated" when text was actually translated.

**1.0.19** — full-page screenshot rebuilt on Chrome's debugger capture (one pixel-perfect shot, no more stitching glitches or half-page stops); legacy stitching kept as automatic fallback.

**1.0.18** — Text Select now supports **21 OCR languages**: pick any language in Settings → OCR and text is extracted in that language. English/Bangla/Hindi are bundled; other packs (Chinese, Arabic, Japanese…) download automatically on first use.

**1.0.17** — **full-auto page translation**: foreign page detect হলেই এখন click ছাড়াই নিজে থেকে translate হয়ে যাবে (default ON — Settings → Translation → "Auto-translate pages" থেকে বন্ধ করা যায়; "Never for this site" list আগের মতোই সম্মান করা হয়)।

**1.0.16** — bug fixes from your screenshots: (1) full-page screenshot no longer hits Chrome's `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND` quota — captures are throttled with automatic retry; (2) stale tabs (opened before install/update) no longer show a confusing error — the panel now detects them and injects fresh scripts automatically, retrying your command, and only asks for a page reload if that fails.

**1.0.15** — Migrated to **Chrome's native side panel** (like the reference screenshot): the UI now docks as a real browser side panel instead of an in-tab overlay, so it stays open across tabs natively. Typing progress now shows **inside the panel** (the separate floating controller window is removed, per your feedback). Engines (typing, screenshot, OCR, page translation, force copy) still run in the tab and talk to the panel through a message bus.

**1.0.14** — Site access is now “On all sites”: the extension runs on every website automatically (auto page-language detection, force text selection, panel persistence across tabs) — no per-site click needed. Chrome will show the standard “read and change all your data on websites” notice at install.

**1.0.13** — fixed auto page-translate detection on slow/heavy sites (Taobao etc.): if the page has no text yet at injection time, detection now retries a few times instead of silently giving up.

**1.0.12** — the panel now follows you: once opened it auto-opens in every tab you switch to and survives page reloads, until you explicitly press ×.

**1.0.11** — toolbar icon click never closes the panel anymore (only the × button does — the split view stays until you close it); full-page translation is ~6x faster via parallel batch requests.

**1.0.10** — Select-area screenshot (drag a rectangle; auto-copies to clipboard, toggle in Settings → Screenshot); Force text selection — copy works even on sites that block it (Settings → Text Select / OCR); motion animations across the panel (tab/card entrances, tactile buttons, reduced-motion support).

**1.0.9** — full-website translation: foreign-language pages are detected and a Google-style translate bar offers one-click page translation (batches, progress, cancel, Show original, Never for this site); manual control in the Translate tab’s “This page” card; toggle in Settings → Translation.

**1.0.8** — header tagline removed (logo shows "CashSkill BD" only).

**1.0.7** — Text Select now auto-copies the extracted text to clipboard
(with a toast confirmation); toggleable in Settings → OCR.

**1.0.6** — Translate tab rebuilt Google-Translate-style: language dropdowns
with ⇄ swap, automatic translation as you type (no button needed),
detected-language label and character count.

**1.0.5** — minimize now collapses to a small round floating logo button at
the top of the screen (click it to restore).

**1.0.4** — video-like animated split view: the page smoothly squeezes left
while the panel slides in (and reverse on close/minimize); settings gear
removed from the top header (Settings tab remains in the nav).

**1.0.3** — tab bar rebuilt on CSS grid (tabs can never overlap; icon-only
mode on narrow panels), text-select drag rewritten (rect always measured
from the release point — no more false "Selection too small"), OCR worker
uses upstream defaults.

**1.0.2** — default panel width 35% → 30% to match the reference layout
(website left, extension right, slimmer panel).

**1.0.1** — fixed Text Select overlay being click-through (also fixed floating
controller STOP button and settings popups), screenshots now hide the panel
during capture.

**1.0.0** — initial release.
