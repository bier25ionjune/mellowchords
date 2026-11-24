#!/usr/bin/env node
/**
 * Automated E2E & <5s Chordtabs Image Latency Verification Suite for mellowchords
 * Usage: node tests/e2e.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqPath = (req.url || '/').split('?')[0];
      const safeRel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
      const absPath = path.resolve(ROOT_DIR, safeRel);
      if (!absPath.startsWith(ROOT_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      fs.readFile(absPath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(absPath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

async function loadPlaywright() {
  const candidates = ['playwright', 'playwright-core'];
  for (const mod of candidates) {
    try {
      return await import(mod);
    } catch {}
  }
  const require = createRequire(import.meta.url);
  const envPaths = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
  const globalPaths = [
    ...envPaths,
    '/usr/lib/node_modules',
    '/usr/local/lib/node_modules',
    path.join(process.env.HOME || '', '.npm-global/lib/node_modules')
  ];
  for (const base of globalPaths) {
    for (const mod of candidates) {
      const full = path.join(base, mod);
      if (fs.existsSync(full)) {
        return require(full);
      }
    }
  }
  throw new Error('Playwright not found. Install with: npm i -D playwright');
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function waitForLoadedGalleryImg(page, timeoutMs = 8000) {
  return page.waitForFunction(() => {
    const imgs = Array.from(document.querySelectorAll('#gallery img.sheetImg'));
    return imgs.some(im => im.complete && im.naturalWidth > 0 && !im.hidden);
  }, undefined, { timeout: timeoutMs });
}


// ---------------------------------------------------------------------------
// Mocked-Supabase helpers (NEVER touches the real project: every *.supabase.co
// request is intercepted and fulfilled locally).
// ---------------------------------------------------------------------------
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': 'content-range'
};

function fakeSession(email, id) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, email, role: 'authenticated', exp })}.sig`;
  return {
    access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'rt-' + id,
    user: { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
  };
}

async function newMockedPage(browser, url, scenario) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 } });
  const page = await ctx.newPage();
  const log = { rest: [], patches: [] };
  const pageErrs = [];
  page.on('pageerror', e => pageErrs.push(String(e)));
  await ctx.route(/\.supabase\.co\//, async route => {
    const req = route.request();
    const u = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const json = (status, body, extra = {}) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });
    if (u.pathname.startsWith('/auth/v1/token')) {
      return json(200, fakeSession(scenario.email, scenario.uid));
    }
    if (u.pathname.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, headers: CORS });
    if (u.pathname.startsWith('/rest/v1/')) {
      const table = u.pathname.replace('/rest/v1/', '');
      log.rest.push(`${req.method()} ${table}`);
      if (table === 'profiles') {
        if (scenario.profilesMissing) {
          return json(404, { code: 'PGRST205', message: "Could not find the table 'public.profiles' in the schema cache" });
        }
        if (req.method() === 'PATCH') {
          log.patches.push({ url: u.search, body: req.postDataJSON() });
          return json(200, []);
        }
        const q = u.searchParams;
        const wantObj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
        if (q.get('id') && q.get('id').startsWith('eq.')) {
          return wantObj ? json(200, scenario.profile) : json(200, [scenario.profile]);
        }
        const rows = (scenario.pendingRows || []).filter(r => q.get('status') === 'eq.' + r.status);
        if (req.method() === 'HEAD') {
          return route.fulfill({ status: 200, headers: { ...CORS, 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` } });
        }
        return json(200, rows, { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
      }
      return json(200, []);
    }
    return json(200, {});
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.supabase && typeof initClient === 'function', undefined, { timeout: 15000 });
  await page.waitForSelector('#songbook', { timeout: 5000 });
  return { ctx, page, log, pageErrs };
}

async function uiLogin(page, name) {
  await page.click('#acct');
  await page.waitForSelector('.modal input[type=email]');
  await page.fill('.modal input[type=email]', name);
  await page.fill('.modal input[type=password]', 'secret123');
  await page.click('.modal button:has-text("เข้าสู่ระบบ / เริ่มใช้งาน")');
}

async function run() {
  const { server, url } = await startStaticServer();
  const pw = await loadPlaywright();
  const launchOpts = { headless: true };
  if (fs.existsSync('/usr/bin/google-chrome')) {
    launchOpts.executablePath = '/usr/bin/google-chrome';
  }
  const browser = await pw.chromium.launch(launchOpts);
  const pageErrors = [];
  const consoleErrors = [];

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    page.on('pageerror', err => pageErrors.push(String(err)));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore expected network errors during deliberate offline/abort fallback tests
        if (!text.includes('ERR_FAILED') && !text.includes('ERR_INTERNET_DISCONNECTED') && !text.includes('Failed to load resource')) {
          consoleErrors.push(text);
        }
      }
    });

    console.log(`[E2E] Serving mellowchords at ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#songbook', { timeout: 5000 });

    // -------------------------------------------------------------------------
    // Test 1: Save song via Editor, reload page -> renderSongbook() no crash
    // -------------------------------------------------------------------------
    console.log('[Test 1] Editor save, renderSongbook() reload & favorite toggle...');
    await page.click('#addBtn');
    await page.waitForSelector('#editorView:not([hidden])');
    await page.fill('#fTitle', 'ทดสอบคอร์ดกลางคืน');
    await page.fill('#fArtist', 'Mellow Band');
    await page.fill('#fKey', 'G');
    await page.fill('#fText', '[Intro]\nG   Em   C   D\n\n[Chorus]\nG        Em\nทดสอบเสียงดนตรี\nC        D\nเล่นสดไม่มีสะดุด');
    await page.click('#tabSectionsBtn');
    await page.waitForSelector('#sectionEditorBox:not([hidden])');
    await page.click('#autoExtractSectionsBtn');
    await page.click('#topSaveEditorBtn');
    await page.waitForSelector('#songView:not([hidden])');

    // Reload to trigger startup renderSongbook() with saved songs
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#songbook .item', { timeout: 5000 });
    const savedCount = await page.locator('#songbook .item').count();
    assert(savedCount >= 1, `Expected >= 1 saved song in #songbook, got ${savedCount}`);
    assert(pageErrors.length === 0, `Uncaught page errors after renderSongbook: ${pageErrors.join('; ')}`);
    console.log(`  PASS: renderSongbook() rendered ${savedCount} saved song(s) with 0 pageerrors.`);

    // -------------------------------------------------------------------------
    // Test 2: Key Picker Trigger & Save Button Preserving Sections
    // -------------------------------------------------------------------------
    console.log('[Test 2] #keyPickerTrigger modal & #saveBtn preserving sections...');
    await page.click('#songbook .item .open');
    await page.waitForSelector('#songView:not([hidden])');
    await page.click('#keyPickerTrigger');
    await page.waitForSelector('.keyGrid button', { timeout: 3000 });
    await page.click('.keyGrid button:nth-child(3)'); // Jump to key D
    await page.click('#saveBtn');

    const preservedSectionsCount = await page.evaluate(() => {
      const book = JSON.parse(localStorage.getItem('nightChordbook.v1') || '[]');
      return book[0] && Array.isArray(book[0].sections) ? book[0].sections.length : 0;
    });
    assert(preservedSectionsCount > 0, `Expected sections to be preserved on #saveBtn, got ${preservedSectionsCount}`);
    console.log(`  PASS: #keyPickerTrigger opened modal and #saveBtn preserved ${preservedSectionsCount} section(s).`);

    // -------------------------------------------------------------------------
    // Test 3: Setlist Creation & BPM Playback (updateSetlistQueueBar no crash)
    // -------------------------------------------------------------------------
    console.log('[Test 3] Setlist creation & BPM playback (updateMetroBtnLabel)...');
    await page.evaluate(() => {
      const book = JSON.parse(localStorage.getItem('nightChordbook.v1') || '[]');
      const songId = book[0].id;
      const pls = [{
        id: 'pl-e2e-1',
        name: 'E2E Live Set',
        songIds: [{ id: 'it-1', type: 'song', songId, targetKey: 'A', singer: 'Boy', bpm: 112, cue: '4-beat count in' }],
        updatedAt: Date.now()
      }];
      localStorage.setItem('nightChordbook.playlists', JSON.stringify(pls));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.evaluate(() => openPlaylist('pl-e2e-1'));
    await page.waitForSelector('#plView:not([hidden])');
    await page.click('#plPlayAll');
    await page.waitForSelector('#songView:not([hidden])');
    const metroText = await page.locator('#metroBtn').textContent();
    assert(metroText && metroText.includes('112 BPM'), `Expected #metroBtn to show 112 BPM, got "${metroText}"`);
    assert(pageErrors.length === 0, `Uncaught page errors during setlist BPM playback: ${pageErrors.join('; ')}`);
    console.log(`  PASS: Setlist BPM playback updated #metroBtn to "${metroText.trim()}" with 0 errors.`);

    // -------------------------------------------------------------------------
    // Test 4: Live Chordtabs Modern Numeric ID (69998) < 5000ms + Lightbox + Editor
    // -------------------------------------------------------------------------
    console.log('[Test 4] Live Chordtabs modern ID (69998) cold fetch (< 5000ms)...');
    const t0Modern = Date.now();
    await page.evaluate(async () => {
      localStorage.removeItem('nightChordbook.ctImgMap.v1');
      await idbDel('ct-img-69998').catch(() => {});
      const loaded = await loadRealWebChordResult({
        url: 'https://chordtabs.in.th/69998/',
        title: 'ซมซาน',
        artist: 'Loso',
        id: 'web-test-69998'
      }, []);
      openSong(loaded, 0);
    });
    await waitForLoadedGalleryImg(page, 6000);
    const modernMs = Date.now() - t0Modern;
    const modernImgInfo = await page.evaluate(() => {
      const im = document.querySelector('#gallery img.sheetImg');
      return { src: im?.src, w: im?.naturalWidth, h: im?.naturalHeight };
    });
    console.log(`  Modern ID 69998 loaded in ${modernMs}ms (${modernImgInfo.w}x${modernImgInfo.h}, src=${modernImgInfo.src})`);
    assert(modernMs < 5000, `Modern Chordtabs ID 69998 took ${modernMs}ms (must be < 5000ms)`);

    // Verify Lightbox works on URL-backed image
    await page.click('#openImgLightboxBtn');
    const lbVisible = await page.evaluate(() => !document.querySelector('#lightbox').hidden && !!document.querySelector('#lbImg').src);
    assert(lbVisible, 'Lightbox did not open for URL-backed Chordtabs image');
    await page.click('#lbClose');
    console.log('  PASS: Lightbox opened cleanly for URL-backed image.');

    // Verify openEditor() preserves URL-backed image for unsaved web song
    await page.click('#editBtn');
    await page.waitForSelector('#editorView:not([hidden])');
    await page.waitForSelector('#thumbs .thumb img', { timeout: 3000 });
    const edThumbCount = await page.locator('#thumbs .thumb img').count();
    assert(edThumbCount === 1, `Expected openEditor() to preserve 1 URL image, got ${edThumbCount}`);
    console.log('  PASS: openEditor() preserved URL-backed image for unsaved web song.');

    // -------------------------------------------------------------------------
    // Test 5: Live Chordtabs Legacy ID (620 -> c0013003.png) < 5000ms
    // -------------------------------------------------------------------------
    const softFailures = [];
    console.log('[Test 5] Live Chordtabs legacy ID (620, soft-404 on /620.png) cold fetch (< 5000ms)...');
    const jinaLegacyUrl = 'https://r.jina.ai/https://chordtabs.in.th/620/';
    let routedJina = false;
    try {
      let jinaProbeStatus = 0;
      try {
        const probeRes = await fetch(jinaLegacyUrl, {
          headers: { 'X-Engine': 'direct' },
          signal: AbortSignal.timeout(4000)
        });
        jinaProbeStatus = probeRes.status;
      } catch (probeErr) {
        console.log(`  [Test 5] Live r.jina.ai probe error (${probeErr.message}); proceeding live.`);
      }

      if (jinaProbeStatus === 401) {
        console.log(`  [Test 5] Live r.jina.ai probe returned HTTP 401 (cloud VM IP-reputation block); intercepting ONLY ${jinaLegacyUrl} while fetching c0013003.png 100% LIVE.`);
        routedJina = true;
        await page.route(jinaLegacyUrl, route => route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          body: 'Title: ซมซาน - โลโซ\n\n![chord](https://chordtabs.in.th/img/nm/c0013003.png)\n'
        }));
      } else if (jinaProbeStatus === 200) {
        console.log('  [Test 5] Live r.jina.ai probe returned HTTP 200; running Test 5 100% live with zero interception.');
      }

      const t0Legacy = Date.now();
      await page.evaluate(async () => {
        localStorage.removeItem('nightChordbook.ctImgMap.v1');
        await idbDel('ct-img-620').catch(() => {});
        const loaded = await loadRealWebChordResult({
          url: 'https://chordtabs.in.th/620/',
          title: 'ซมซาน (Legacy)',
          artist: 'Loso',
          id: 'web-test-620'
        }, []);
        openSong(loaded, 0);
      });
      await waitForLoadedGalleryImg(page, 6000);
      const legacyMs = Date.now() - t0Legacy;
      const legacyImgInfo = await page.evaluate(() => {
        const im = document.querySelector('#gallery img.sheetImg');
        return { src: im?.src, complete: !!im?.complete, w: im?.naturalWidth || 0, h: im?.naturalHeight || 0 };
      });
      console.log(`  Legacy ID 620 loaded in ${legacyMs}ms (${legacyImgInfo.w}x${legacyImgInfo.h}, complete=${legacyImgInfo.complete}, src=${legacyImgInfo.src})`);
      assert(legacyMs < 5000, `Legacy Chordtabs ID 620 took ${legacyMs}ms (must be < 5000ms)`);
      assert(legacyImgInfo.complete && legacyImgInfo.w > 0, `Expected loaded legacy image (complete && naturalWidth > 0), got complete=${legacyImgInfo.complete}, w=${legacyImgInfo.w}`);
    } catch (err) {
      console.log(`  FAIL [Test 5]: ${err.message}`);
      softFailures.push(`Test 5 (Legacy ID 620): ${err.message}`);
    } finally {
      if (routedJina) {
        await page.unroute(jinaLegacyUrl);
      }
    }

    // -------------------------------------------------------------------------
    // Test 6: Repeat / Cached Open from IndexedDB (< 500ms) & Offline Playback
    // -------------------------------------------------------------------------
    console.log('[Test 6] Repeat/cached IndexedDB open (< 500ms) & offline playback...');
    // Wait up to 7s for background wsrv.nl -> IDB cache of 69998 to complete
    await page.waitForFunction(async () => {
      const b = await idbGet('ct-img-69998').catch(() => null);
      return !!b;
    }, undefined, { timeout: 7000 });

    await context.setOffline(true);
    const t0Offline = Date.now();
    await page.evaluate(async () => {
      const loaded = await loadRealWebChordResult({
        url: 'https://chordtabs.in.th/69998/',
        title: 'ซมซาน (Offline)',
        artist: 'Loso',
        id: 'web-test-69998-offline'
      }, []);
      openSong(loaded, 0);
    });
    await waitForLoadedGalleryImg(page, 2000);
    const offlineMs = Date.now() - t0Offline;
    const offlineImgSrc = await page.evaluate(() => document.querySelector('#gallery img.sheetImg')?.src || '');
    await context.setOffline(false);
    console.log(`  Offline/IDB repeat open loaded in ${offlineMs}ms (src=${offlineImgSrc.slice(0, 40)}...)`);
    assert(offlineMs < 500, `Expected cached/offline open < 500ms, got ${offlineMs}ms`);
    assert(offlineImgSrc.startsWith('blob:'), `Expected blob: URL from IndexedDB, got ${offlineImgSrc}`);

    // -------------------------------------------------------------------------
    // Test 7: Fallback Resilience When Primary Direct URL Is Blocked
    // -------------------------------------------------------------------------
    console.log('[Test 7] Fallback resilience when primary direct URL is aborted...');
    await page.route('https://chordtabs.in.th/img/nm/69998.png', route => route.abort('failed'));
    const t0Fallback = Date.now();
    await page.evaluate(async () => {
      localStorage.removeItem('nightChordbook.ctImgMap.v1');
      await idbDel('ct-img-69998').catch(() => {});
      const loaded = await loadRealWebChordResult({
        url: 'https://chordtabs.in.th/69998/',
        title: 'Fallback Test 69998',
        artist: 'Loso',
        id: 'web-test-69998-fb'
      }, []);
      openSong(loaded, 0);
    });
    await waitForLoadedGalleryImg(page, 6000);
    const fallbackMs = Date.now() - t0Fallback;
    const fallbackSrc = await page.evaluate(() => document.querySelector('#gallery img.sheetImg')?.src || '');
    await page.unroute('https://chordtabs.in.th/img/nm/69998.png');
    console.log(`  Fallback image loaded in ${fallbackMs}ms via ${fallbackSrc}`);
    assert(fallbackMs < 5000, `Fallback image load took ${fallbackMs}ms (must be < 5000ms)`);
    assert(fallbackSrc.includes('wsrv.nl') || fallbackSrc.includes('weserv.nl'), `Expected proxy fallback URL, got ${fallbackSrc}`);

    // -------------------------------------------------------------------------
    // Test 8: Quick Switcher XSS Escape & Online Search Clear Recovery
    // -------------------------------------------------------------------------
    console.log('[Test 8] Quick Switcher XSS escape & #onlineSearchBtn clear recovery...');
    const xssResult = await page.evaluate(() => {
      window.__xss = undefined;
      activeSetlistContext = {
        plId: 'pl-xss',
        name: 'XSS Test Set',
        index: 0,
        songs: [
          { id: 's-cur', title: 'Current Song', key: 'C', text: 'C G Am F' },
          { id: 's-next', title: 'Next Song', key: 'G', targetKey: '<img src=x onerror="window.__xss=1">', text: 'G D Em C' }
        ]
      };
      openQuickSongSwitcherModal();
      const modalText = document.querySelector('.modal')?.textContent || '';
      const closeBtn = document.querySelector('.modal .box .iconBtn');
      if (closeBtn) closeBtn.click();
      return {
        xssTriggered: window.__xss,
        hasEscapedPayload: modalText.includes('<img src=x'),
        modalClosed: document.querySelector('.modal') === null
      };
    });
    assert(xssResult.xssTriggered === undefined, `XSS payload executed in Quick Switcher! window.__xss=${xssResult.xssTriggered}`);
    assert(xssResult.hasEscapedPayload, 'Expected escaped targetKey payload to render as inert text in Quick Switcher');
    assert(xssResult.modalClosed === true, 'Expected Quick Switcher modal to be closed (document.querySelector(".modal") === null)');

    // Verify #onlineSearchBtn is not stuck disabled when an in-flight search is cleared
    await page.evaluate(() => show('home'));
    await page.waitForSelector('#q');
    await page.fill('#q', 'ซมซาน');
    await page.click('#onlineSearchBtn');
    await page.click('#clearSearchBtn');
    const searchBtnDisabled = await page.evaluate(() => document.querySelector('#onlineSearchBtn').disabled);
    assert(searchBtnDisabled === false, 'Expected #onlineSearchBtn.disabled === false after #clearSearchBtn click');
    console.log('  PASS: Quick Switcher escaped targetKey safely and #onlineSearchBtn recovered on clear.');


    // -------------------------------------------------------------------------
    // Test 9: Approval system (mocked Supabase; never hits production)
    // -------------------------------------------------------------------------
    console.log('[Test 9a] Pending user sees pending screen and no cloud sync...');
    {
      const m = await newMockedPage(browser, url, { email: 'newbie@mellowchords.local', uid: 'u-pending',
        profile: { id: 'u-pending', email: 'newbie@mellowchords.local', username: 'newbie', status: 'pending', is_admin: false } });
      await uiLogin(m.page, 'newbie');
      await m.page.waitForSelector('#pendingGate', { timeout: 5000 });
      const txt = await m.page.textContent('#pendingGate');
      assert(txt.includes('รอแอดมินอนุมัติ'), `Pending screen text missing: ${txt}`);
      await m.page.evaluate(() => syncAll());
      await m.page.waitForTimeout(300);
      assert(!m.log.rest.some(r => /songs|playlists/.test(r)), `Pending user must not sync, saw: ${m.log.rest.join(', ')}`);
      const acct = await m.page.textContent('#acct');
      assert(acct.includes('⏳'), `Expected pending badge on #acct, got ${acct}`);
      const h = await m.page.evaluate(() => document.querySelector('#pendingGate button').getBoundingClientRect().height);
      assert(h >= 44, `Pending-screen button must be >= 44px tall, got ${h}`);
      assert(m.pageErrs.length === 0, `Page errors (9a): ${m.pageErrs.join('; ')}`);
      await m.ctx.close();
      console.log('  PASS: pending screen shown, no songs/playlists requests.');
    }

    console.log('[Test 9b] Missing profiles table degrades gracefully (behaves as before)...');
    {
      const m = await newMockedPage(browser, url, { email: 'old@mellowchords.local', uid: 'u-old', profilesMissing: true });
      await uiLogin(m.page, 'old');
      await m.page.waitForFunction(() => user && !user.isLocal && approval === 'none', undefined, { timeout: 5000 });
      await m.page.waitForFunction(() => document.querySelectorAll('#pendingGate').length === 0);
      await m.page.evaluate(() => syncAll());
      await m.page.waitForTimeout(500);
      assert(m.log.rest.some(r => /GET songs/.test(r)), `Expected cloud sync (GET songs) when profiles table missing, saw: ${m.log.rest.join(', ')}`);
      assert(m.pageErrs.length === 0, `Page errors (9b): ${m.pageErrs.join('; ')}`);
      await m.ctx.close();
      console.log('  PASS: no approval screen and sync proceeds.');
    }

    console.log('[Test 9c] Admin sees pending badge, approvals modal, approve/reject...');
    {
      const rows = [
        { id: 'p1', email: 'alice@mellowchords.local', username: 'alice', status: 'pending', created_at: '2026-11-20T10:00:00Z' },
        { id: 'p2', email: 'bob@mellowchords.local', username: 'bob', status: 'pending', created_at: '2026-11-21T10:00:00Z' }
      ];
      const m = await newMockedPage(browser, url, { email: 'bierbebad@mellowchords.local', uid: 'u-admin', pendingRows: rows,
        profile: { id: 'u-admin', email: 'bierbebad@mellowchords.local', username: 'bierbebad', status: 'approved', is_admin: true } });
      await uiLogin(m.page, 'bierbebad');
      await m.page.waitForFunction(() => document.querySelector('#acct').textContent.includes('🛡️2'), undefined, { timeout: 5000 });
      assert((await m.page.locator('#pendingGate').count()) === 0, 'Admin must not see pending gate');
      // login modal stays open and redraws to the account card
      await m.page.click('.modal button:has-text("อนุมัติผู้สมัคร")');
      await m.page.waitForSelector('.approvalItem', { timeout: 5000 });
      assert((await m.page.locator('.approvalItem').count()) === 2, 'Expected 2 pending rows in approvals modal');
      const bh = await m.page.evaluate(() => document.querySelector('.approveBtn').getBoundingClientRect().height);
      assert(bh >= 44, `Approve button must be >= 44px, got ${bh}`);
      await m.page.click('.approvalItem:has-text("alice") .approveBtn');
      await m.page.waitForTimeout(400);
      const patch = m.log.patches.find(p => p.url.includes('id=eq.p1'));
      assert(patch && patch.body.status === 'approved' && patch.body.approved_by === 'u-admin', `Expected approve PATCH for p1, got ${JSON.stringify(m.log.patches)}`);
      await m.page.click('.approvalItem:has-text("bob") .rejectBtn');
      await m.page.waitForTimeout(400);
      const patch2 = m.log.patches.find(p => p.url.includes('id=eq.p2'));
      assert(patch2 && patch2.body.status === 'rejected', `Expected reject PATCH for p2, got ${JSON.stringify(m.log.patches)}`);
      assert(m.pageErrs.length === 0, `Page errors (9c): ${m.pageErrs.join('; ')}`);
      await m.ctx.close();
      console.log('  PASS: admin badge, modal list, approve & reject PATCHes.');
    }

    console.log('[Test 9d] Non-admin approved user has no approvals entry...');
    {
      const m = await newMockedPage(browser, url, { email: 'carol@mellowchords.local', uid: 'u-carol',
        profile: { id: 'u-carol', email: 'carol@mellowchords.local', username: 'carol', status: 'approved', is_admin: false } });
      await uiLogin(m.page, 'carol');
      await m.page.waitForFunction(() => approval === 'approved', undefined, { timeout: 5000 });
      await m.page.waitForSelector('.modal .card');
      const has = await m.page.evaluate(() => [...document.querySelectorAll('.modal button')].some(b => b.textContent.includes('อนุมัติผู้สมัคร')));
      assert(!has, 'Non-admin must not see approvals button');
      await m.ctx.close();
      console.log('  PASS.');
    }

    assert(pageErrors.length === 0, `Page errors occurred: ${pageErrors.join('; ')}`);
    assert(consoleErrors.length === 0, `Console errors occurred: ${consoleErrors.join('; ')}`);
    assert(softFailures.length === 0, `Subtest failures: ${softFailures.join('; ')}`);

    console.log('\n✅ ALL 9 E2E & <5s LATENCY TESTS PASSED!');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch(err => {
  console.error('\n❌ E2E FAILED:', err);
  process.exit(1);
});
