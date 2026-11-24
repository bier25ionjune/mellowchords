# Project: mellowchords (คลังคอร์ดกลางคืน)

## Architecture
- **Type**: 100% static, zero-build vanilla HTML5/CSS3/ES6+ Progressive Web App (PWA) with offline-first Service Worker (`sw.js`), client-side `localStorage` + `IndexedDB` persistence, optional Supabase BaaS cloud sync, and client-side external web search / chord sheet image fetching (`chordtabs.in.th`, `r.jina.ai`, `wsrv.nl` / `images.weserv.nl`).
- **Views**: `home` (unified local + online search & personal songbook), `playlists`/`playlist` (live setlist/gig script manager), `editor` (manual & URL/ID import, arrangement sections, multi-image upload, Tesseract.js OCR), `song` (performer sheet with gallery, lightbox, transpose/capo, metronome, auto-scroll, stage focus).
- **Data Flow (Target < 5s Image Pipeline)**:
  1. Search (`searchRealWebChords`) uses in-memory + `sessionStorage` cache (5–10 min TTL), in-flight promise deduplication (shared by main search & Quick Switcher), `AbortController` cancellation for stale queries, and tight 4.5s timeouts.
  2. Opening a Chordtabs song (`loadRealWebChordResult` / `importFromUrl`):
     - Extracts `songId` from both `/chordtabs\.in\.th\/(\d+)/i` and `/[?&]song_id=(\d+)/i`.
     - Checks deterministic IndexedDB key `ct-img-<songId>` first (**< 50ms** offline/repeat open).
     - On cold open: immediately returns song with direct image URL `https://chordtabs.in.th/img/nm/<songId>.png` (renders in **~0.7–1.3s** with `referrerPolicy="no-referrer"`, `fetchPriority="high"`, `decoding="async"`) while racing `r.jina.ai` with `X-Engine: direct` (4.0s timeout) to resolve legacy non-numeric filenames (e.g., `620 -> c0013003.png` in **~0.8–1.5s**) and enrich metadata.
     - Multi-step `onerror` fallback chain in `loadGallery()` (resolved `X-Engine: direct` URL -> `wsrv.nl` WebP -> `images.weserv.nl` WebP -> `.jpg`/`.webp` -> retry button) prevents broken images and handles Chordtabs HTML soft-404s.
     - Non-blocking background task fetches image blob via `wsrv.nl`/`images.weserv.nl` (4.0s timeout) and caches into IndexedDB under `ct-img-<songId>` for offline playback.

## Code Layout
- `index.html` — Single-page PWA shell, views, modals, preconnect hints (`chordtabs.in.th`, `wsrv.nl`), script/style links.
- `app.css` — Dark glassmorphism UI styles, responsive layout, gallery loading skeleton & error/retry UI styles.
- `app.js` — Main client application (music theory, chord parser, web search & <5s image pipeline, OCR, localStorage/IndexedDB, song viewer, editor, Supabase sync, playlists/setlists, Quick Switcher, PWA controller).
- `sw.js` — Service Worker (`CACHE_NAME = 'mellowchords-v15'`), app shell caching, capped Cache-First image cache for `wsrv.nl`/`images.weserv.nl`, network pass-through for dynamic APIs.
- `manifest.webmanifest`, `icon*.png`, `icon.svg`, `README.md` — PWA manifest, icons, documentation.
- `tests/e2e.mjs` — Automated Node + Playwright headless browser E2E & <5s image latency verification script.

## Feature Inventory
Every Survey feature assigned a milestone (none unassigned):
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Fix `renderSongbook` crash (`app.js:1718`) | Fix `ReferenceError: isSaved is not defined` so saved songs render, save, favorite, and trigger sync without crashing. | M1 | explorer_survey_1, explorer_survey_2, explorer_survey_3 |
| 2 | Fix `updateSetlistQueueBar` crash (`app.js:1970`) | Implement `updateMetroBtnLabel()` (or safe metro label update) so setlist songs with BPM (default 100) open without `ReferenceError`. | M1 | explorer_survey_1 |
| 3 | < 5s Chordtabs Image Fetch Pipeline (`app.js:947-1086`, `2650-2711`) | Extract ID (`/(\d+)/` and `song_id=(\d+)`), deterministic IDB key `ct-img-<id>`, instant direct `<img>` render (`referrerPolicy="no-referrer"`), parallel `X-Engine: direct` Jina resolution (4s timeout) for legacy IDs & metadata, non-blocking background `wsrv.nl` -> IDB cache, timeout on `musicatm.com` fallback (`app.js:1051`), parallel `Promise.any` in `fetchPageWithFallbacks`. | M1 | explorer_survey_1, explorer_survey_2, explorer_survey_3 |
| 4 | Fast Cached & Deduplicated Search (`app.js:778-904`, `1599-1609`, `4272-4385`) | Add in-memory + `sessionStorage` search cache (TTL 5–10m), share in-flight promises (fixing Quick Switcher duplicate search), abort stale `#q` searches via `AbortController`, tighten search timeouts to ~4.5s. | M1 | explorer_survey_1, explorer_survey_2, explorer_survey_3 |
| 5 | Gallery UX, Fallback Chain, Lightbox & Preconnect (`index.html`, `app.css`, `app.js:2121-2160`) | Add `preconnect` for `chordtabs.in.th` & `wsrv.nl`; parallel `Promise.all` IDB loads; shimmer loading skeleton; `fetchPriority="high"`, `decoding="async"`, `referrerPolicy="no-referrer"`; multi-step `onerror` fallback + retry button; populate `galUrls` for both IDB & HTTP(S) URLs so Lightbox always works. | M1 | explorer_survey_1, explorer_survey_2, explorer_survey_3 |
| 6 | Service Worker Update & Image Caching (`sw.js`) | Bump `CACHE_NAME` to `'mellowchords-v15'`; handle `wsrv.nl`/`images.weserv.nl` with capped Cache-First image cache (only `res.ok` image responses) and clean bypass for dynamic APIs. | M1 | explorer_survey_1, explorer_survey_2, explorer_survey_3 |
| 7 | Key Picker Trigger & Save Sections (`index.html:279`, `app.js:2172-2182`) | Wire `#keyPickerTrigger` to `openDirectKeyPickerModal()`; preserve `sections: song.sections || []` in `#saveBtn.onclick`. | M1 | explorer_survey_1 |
| 8 | Editor Image Preservation, OCR on URL Images & Object URL Cleanup (`app.js:1201`, `2403-2460`, `2681`) | Preserve both IDB & HTTP(S) URL images in `openEditor()` (including unsaved web songs); fetch blob via proxy in OCR when `im.blob` is missing; revoke Object URLs on close/delete; reduce `shrinkImage` default max to 2048 & parallelize `addImageFiles`. | M1 | explorer_survey_1, explorer_survey_2 |
| 9 | Data Integrity, Sync & Code Hygiene (`app.js:1070`, `2692`, `2871`, `2990`, `3046`, `3064`, `3198`, `3225-3261`, `3646-3659`) | Fix `parseTitleAndArtist` arg order; fix `syncAll()` `playlist_items` object/break mapping; preserve `blob.type` in `pushImages()` & add timeout to Supabase `getImg()`; update stale "502 Paused" copy; remove duplicate `encode/decodePlaylistSharePayload`; escape user strings in `innerHTML`. | M1 | explorer_survey_1, explorer_survey_2, explorer_survey_3 |
| 10 | Automated Playwright E2E & < 5s Latency Verification (`tests/e2e.mjs`) | Verify syntax, zero console/page errors, saved songbook rendering, setlist BPM playback, key picker, lightbox, editor image/section preservation, offline IDB cache, fallback resilience, and live Chordtabs image loading strictly `< 5000ms` (`img.complete && img.naturalWidth > 0`). | M1 | explorer_survey_1, explorer_survey_2, explorer_survey_3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Full App Reliability Fixes, < 5s Image Pipeline & E2E Verification | Features #1–#10 across `index.html`, `app.css`, `app.js`, `sw.js`, and `tests/e2e.mjs` (fits single Iteration Loop). | none | DONE (`node --check` exit 0; 8/8 Playwright E2E passed exit 0: modern ID 1.41s, legacy ID 0.93s–1.61s live, offline IDB 28–51ms, `wsrv.nl` fallback 412–502ms; Auditor CLEAN) |

## Interface Contracts
- **Static Entry Point**: Served as static files (`python3 -m http.server <port>`), zero build step, `index.html` loads `app.css`, Supabase CDN, and `app.js`; registers `sw.js`.
- **Image Cache Key Contract**: Deterministic IndexedDB key `ct-img-<songId>` for Chordtabs images; `song.images` supports both IDB keys (`ct-img-*`, `img-*`) and `http(s)://`/`data:` URLs seamlessly across Viewer (`loadGallery`), Lightbox (`galUrls`), Editor (`openEditor`), and OCR.
- **Verification Command**:
  - Syntax: `node --check app.js && node --check sw.js && node --check tests/e2e.mjs`
  - E2E & Latency: `NODE_PATH=/home/antigravity/.gemini/jetski/scratch/teamwork_tmp/5d4f861861098fa6902e7c5245bf2500/node_modules node tests/e2e.mjs` (exits 0; asserts zero uncaught errors and live Chordtabs image load `< 5000ms`).
