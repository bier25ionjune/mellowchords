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
          if (!path.extname(safeRel)) {
            fs.readFile(path.resolve(ROOT_DIR, 'index.html'), (err2, html) => {
              if (err2) { res.writeHead(404); res.end('Not found'); return; }
              res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
              res.end(html);
            });
            return;
          }
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
          const patchBody = req.postDataJSON();
          log.patches.push({ url: u.search, body: patchBody });
          const idParam = u.searchParams.get('id');
          if (idParam && idParam.startsWith('eq.') && Array.isArray(scenario.allProfiles)) {
            const targetId = idParam.slice(3);
            scenario.allProfiles = scenario.allProfiles.map(r => r.id === targetId ? { ...r, ...patchBody } : r);
          }
          return json(200, []);
        }
        const q = u.searchParams;
        const wantObj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
        if (q.get('id') && q.get('id').startsWith('eq.')) {
          return wantObj ? json(200, scenario.profile) : json(200, [scenario.profile]);
        }
        const sourceRows = scenario.allProfiles || scenario.pendingRows || [];
        const statusParam = q.get('status');
        const rows = statusParam && statusParam.startsWith('eq.')
          ? sourceRows.filter(r => 'eq.' + r.status === statusParam)
          : sourceRows;
        if (req.method() === 'HEAD') {
          return route.fulfill({ status: 200, headers: { ...CORS, 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` } });
        }
        return json(200, rows, { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
      }
      return json(200, []);
    }
    return json(200, {});
  });
  await page.goto(scenario.initialUrl || url, { waitUntil: 'domcontentloaded' });
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
    const addBtnCount = await page.locator('#addBtn, [data-nav="editor"]').count();
    assert(addBtnCount === 0, `Expected #addBtn and [data-nav="editor"] to be removed, found ${addBtnCount}`);
    await page.evaluate(() => window.__mellowModules.openEditor(null, ''));
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
    const deadlineIdb = Date.now() + 7000;
    let hasCachedIdb = false;
    while (Date.now() < deadlineIdb) {
      hasCachedIdb = await page.evaluate(async () => !!(await idbGet('ct-img-69998').catch(() => null)));
      if (hasCachedIdb) break;
      await page.waitForTimeout(150);
    }
    assert(hasCachedIdb, 'Expected background cache to store ct-img-69998 in IndexedDB within 7s');

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
      assert(patch && patch.body.status === 'approved' && (patch.body.approved_by === 'u-admin' || patch.body.approved_by === null), `Expected approve PATCH for p1, got ${JSON.stringify(m.log.patches)}`);
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

    // -------------------------------------------------------------------------
    // Test 10: RBAC Guards & Admin User Management
    // -------------------------------------------------------------------------
    console.log('[Test 10a] Guest & Regular user cannot see Admin menus and direct #/admin URL redirects to home...');
    {
      // Cold open at /#/admin as Guest
      const g = await newMockedPage(browser, url, { initialUrl: `${url}/#/admin` });
      await g.page.waitForFunction(() => !location.hash.includes('admin') && document.body.dataset.view === 'home', undefined, { timeout: 5000 });
      const guestState = await g.page.evaluate(() => ({
        hdrHidden: document.querySelector('#adminNavBtn').hidden,
        tabHidden: document.querySelector('#bottomAdminTab').hidden,
        viewHidden: document.querySelector('#adminView').hidden,
        bodyIsAdmin: document.body.classList.contains('is-admin')
      }));
      assert(guestState.hdrHidden && guestState.tabHidden && guestState.viewHidden && !guestState.bodyIsAdmin,
        `Guest must have all admin elements hidden: ${JSON.stringify(guestState)}`);
      await g.ctx.close();

      // Logged-in approved regular user (role: 'user', is_active: true)
      const u = await newMockedPage(browser, url, {
        email: 'member@mellowchords.local',
        uid: 'u-member',
        profile: { id: 'u-member', email: 'member@mellowchords.local', username: 'member', role: 'user', is_admin: false, is_active: true, status: 'approved' }
      });
      await uiLogin(u.page, 'member');
      await u.page.waitForFunction(() => approval === 'approved', undefined, { timeout: 5000 });
      await u.page.waitForSelector('.modal .card');
      const userMenuCheck = await u.page.evaluate(() => ({
        hdrHidden: document.querySelector('#adminNavBtn').hidden,
        tabHidden: document.querySelector('#bottomAdminTab').hidden,
        hasManageBtnInModal: [...document.querySelectorAll('.modal button')].some(b => b.textContent.includes('จัดการผู้ใช้'))
      }));
      assert(userMenuCheck.hdrHidden && userMenuCheck.tabHidden && !userMenuCheck.hasManageBtnInModal,
        `Regular user must not see any admin menu/button: ${JSON.stringify(userMenuCheck)}`);

      // Close modal and try direct URL hash navigation (#/admin) & direct show('admin')
      await u.page.click('.modal .box .iconBtn');
      await u.page.evaluate(() => { location.hash = '#/admin'; });
      await u.page.waitForFunction(() => !location.hash.includes('admin') && document.body.dataset.view === 'home', undefined, { timeout: 5000 });
      const afterHash = await u.page.evaluate(() => {
        show('admin');
        return {
          view: document.body.dataset.view,
          adminHidden: document.querySelector('#adminView').hidden,
          hash: location.hash
        };
      });
      assert(afterHash.view === 'home' && afterHash.adminHidden && !afterHash.hash.includes('admin'),
        `Regular user must be redirected to home on admin access: ${JSON.stringify(afterHash)}`);
      assert(u.pageErrs.length === 0, `Page errors (10a): ${u.pageErrs.join('; ')}`);
      await u.ctx.close();
      console.log('  PASS: Admin menus hidden & direct URL redirected to home.');
    }

    console.log('[Test 10b] Inactive user (is_active = false) is blocked from cloud sync and admin access...');
    {
      const m = await newMockedPage(browser, url, {
        email: 'suspended@mellowchords.local',
        uid: 'u-suspended',
        profile: { id: 'u-suspended', email: 'suspended@mellowchords.local', username: 'suspended', role: 'admin', is_admin: true, is_active: false, status: 'approved' }
      });
      await uiLogin(m.page, 'suspended');
      await m.page.waitForSelector('#pendingGate', { timeout: 5000 });
      const gateTxt = await m.page.textContent('#pendingGate');
      assert(gateTxt.includes('ถูกระงับการใช้งาน'), `Expected suspended account message, got: ${gateTxt}`);
      await m.page.evaluate(() => syncAll());
      await m.page.waitForTimeout(300);
      assert(!m.log.rest.some(r => /songs|playlists/.test(r)), `Inactive user must not sync cloud tables, saw: ${m.log.rest.join(', ')}`);
      const isAdm = await m.page.evaluate(() => isAdminUser());
      assert(isAdm === false, 'Inactive user must not have admin access even if role=admin');
      assert(m.pageErrs.length === 0, `Page errors (10b): ${m.pageErrs.join('; ')}`);
      await m.ctx.close();
      console.log('  PASS: Inactive user blocked from sync & admin privileges.');
    }

    console.log('[Test 10c] Admin User Management: list, search, filter, role switch (admin <-> user), activate/deactivate, self-protection & signout guard...');
    {
      const allUsers = [
        { id: 'u-admin', email: 'bierbebad@mellowchords.local', username: 'bierbebad', role: 'admin', is_admin: true, is_active: true, status: 'approved', created_at: '2026-11-18T10:00:00Z' },
        { id: 'u-alice', email: 'alice@band.com', username: 'alice', role: 'user', is_admin: false, is_active: true, status: 'approved', created_at: '2026-11-19T10:00:00Z' },
        { id: 'u-bob', email: 'bob@band.com', username: 'bob', role: 'user', is_admin: false, is_active: false, status: 'approved', created_at: '2026-11-20T10:00:00Z' },
        { id: 'u-new', email: 'rookie@band.com', username: 'rookie', role: 'user', is_admin: false, is_active: true, status: 'pending', created_at: '2026-11-21T10:00:00Z' }
      ];
      const m = await newMockedPage(browser, url, {
        email: 'bierbebad@mellowchords.local',
        uid: 'u-admin',
        allProfiles: allUsers,
        profile: allUsers[0]
      });
      await uiLogin(m.page, 'bierbebad');
      await m.page.waitForFunction(() => isAdminUser() === true, undefined, { timeout: 5000 });

      // Verify Admin menus are visible for Admin
      const adminVis = await m.page.evaluate(() => ({
        hdrHidden: document.querySelector('#adminNavBtn').hidden,
        tabHidden: document.querySelector('#bottomAdminTab').hidden,
        bodyIsAdmin: document.body.classList.contains('is-admin')
      }));
      assert(!adminVis.hdrHidden && !adminVis.tabHidden && adminVis.bodyIsAdmin, `Admin must see admin navigation controls: ${JSON.stringify(adminVis)}`);

      // Open Admin User Management via account modal button
      await m.page.click('.modal .adminManageUsersBtn');
      await m.page.waitForFunction(() => document.body.dataset.view === 'admin' && location.hash === '#/admin', undefined, { timeout: 5000 });
      await m.page.waitForSelector('.adminUserRow', { timeout: 5000 });
      assert((await m.page.locator('.adminUserRow').count()) === 4, 'Expected all 4 users in #adminUserList');

      // Self-protection: Admin's own controls must be disabled
      const selfDisabled = await m.page.evaluate(() => {
        const selfRow = document.querySelector('.adminUserRow[data-user-id="u-admin"]');
        return {
          roleDisabled: selfRow.querySelector('.adminRoleSelect').disabled,
          toggleDisabled: selfRow.querySelector('.toggleActiveBtn').disabled
        };
      });
      assert(selfDisabled.roleDisabled && selfDisabled.toggleDisabled, `Admin own controls must be disabled: ${JSON.stringify(selfDisabled)}`);

      // Search users
      await m.page.fill('#adminSearchInput', 'alice@band.com');
      assert((await m.page.locator('.adminUserRow').count()) === 1, 'Search for alice@band.com should show 1 row');
      await m.page.click('#adminSearchClearBtn');
      assert((await m.page.locator('.adminUserRow').count()) === 4, 'Clearing search should restore 4 rows');

      // Filter inactive users
      await m.page.click('#adminFilterBar [data-admin-filter="inactive"]');
      assert((await m.page.locator('.adminUserRow[data-user-id="u-bob"]').count()) === 1, 'Inactive filter should include bob');
      await m.page.click('#adminFilterBar [data-admin-filter="all"]');
      assert((await m.page.locator('.adminUserRow').count()) === 4, 'All filter should show 4 rows');

      // Change Alice's role: user -> admin (with confirmation modal)
      await m.page.selectOption('.adminUserRow[data-user-id="u-alice"] .adminRoleSelect', 'admin');
      await m.page.waitForSelector('.modal .confirmRoleBtn', { timeout: 5000 });
      await m.page.click('.modal .confirmRoleBtn');
      await m.page.waitForFunction(() => {
        const r = document.querySelector('.adminUserRow[data-user-id="u-alice"]');
        return r && r.dataset.role === 'admin';
      }, undefined, { timeout: 5000 });
      const rolePatch = m.log.patches.find(p => p.url.includes('id=eq.u-alice') && p.body.role === 'admin');
      assert(rolePatch && rolePatch.body.is_admin === true, `Expected PATCH role=admin for u-alice, got ${JSON.stringify(m.log.patches)}`);

      // Deactivate Alice's account: is_active true -> false
      await m.page.click('.adminUserRow[data-user-id="u-alice"] .toggleActiveBtn');
      await m.page.waitForFunction(() => {
        const r = document.querySelector('.adminUserRow[data-user-id="u-alice"]');
        return r && r.dataset.active === 'false';
      }, undefined, { timeout: 5000 });
      const deactPatch = m.log.patches.find(p => p.url.includes('id=eq.u-alice') && p.body.is_active === false);
      assert(!!deactPatch, `Expected PATCH is_active=false for u-alice, got ${JSON.stringify(m.log.patches)}`);

      // Re-activate Bob's account: is_active false -> true
      await m.page.click('.adminUserRow[data-user-id="u-bob"] .toggleActiveBtn');
      await m.page.waitForFunction(() => {
        const r = document.querySelector('.adminUserRow[data-user-id="u-bob"]');
        return r && r.dataset.active === 'true';
      }, undefined, { timeout: 5000 });
      const actPatch = m.log.patches.find(p => p.url.includes('id=eq.u-bob') && p.body.is_active === true);
      assert(!!actPatch, `Expected PATCH is_active=true for u-bob, got ${JSON.stringify(m.log.patches)}`);

      // Sign out while on #adminView -> must redirect home and hide admin UI
      await m.page.evaluate(() => doSignOut());
      await m.page.waitForFunction(() => document.body.dataset.view === 'home' && !location.hash.includes('admin'), undefined, { timeout: 5000 });
      const afterSignOut = await m.page.evaluate(() => ({
        hdrHidden: document.querySelector('#adminNavBtn').hidden,
        tabHidden: document.querySelector('#bottomAdminTab').hidden,
        adminViewHidden: document.querySelector('#adminView').hidden
      }));
      assert(afterSignOut.hdrHidden && afterSignOut.tabHidden && afterSignOut.adminViewHidden,
        `Signing out must hide all admin UI and view: ${JSON.stringify(afterSignOut)}`);
      assert(m.pageErrs.length === 0, `Page errors (10c): ${m.pageErrs.join('; ')}`);
      await m.ctx.close();
      console.log('  PASS: Admin User Management list, search, filter, role switch, active toggle & signout guard verified.');
    }

    // -------------------------------------------------------------------------
    // Test 11: Save Chord Mode Pop-up (Image vs OCR Text + Editable Text)
    // -------------------------------------------------------------------------
    console.log('[Test 11] Save Chord Mode Pop-up (Image vs OCR Text + post-scan editing)...');
    {
      const ocrCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const ocrPage = await ocrCtx.newPage();
      const ocrErrs = [];
      ocrPage.on('pageerror', err => ocrErrs.push(String(err)));
      await ocrPage.goto(url, { waitUntil: 'domcontentloaded' });
      await ocrPage.waitForSelector('#songbook', { timeout: 5000 });

      // Open an unsaved image-based song (simulating web chord fetched from home search)
      await ocrPage.evaluate(() => {
        const fakeWebImgSong = {
          id: 'web-ocr-popup-test-1',
          title: 'เพลงทดสอบ OCR Pop-up',
          artist: 'Test Artist',
          key: 'C',
          text: '',
          images: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='],
          parsedChordSheet: {
            originalKey: 'C',
            monospaceText: 'C        G\nทดสอบคอร์ดจากภาพ\nAm       F\nแปลงเป็นข้อความได้ทันที'
          }
        };
        openSong(fakeWebImgSong, 0);
      });
      await ocrPage.waitForSelector('#songView:not([hidden])');
      const saveOcrVisible = await ocrPage.locator('#saveOcrBtn').isVisible();
      assert(saveOcrVisible, 'Expected #saveOcrBtn to be visible on image-based chord');

      // Clicking #saveBtn on unsaved image-only song should open the Save Mode Pop-up
      await ocrPage.click('#saveBtn');
      await ocrPage.waitForSelector('#saveChoiceImageBtn', { timeout: 4000 });
      await ocrPage.waitForSelector('#saveChoiceOcrBtn', { timeout: 4000 });

      // Choose OCR -> edit scanned text -> save to Songbook
      await ocrPage.click('#saveChoiceOcrBtn');
      await ocrPage.waitForSelector('#saveOcrTextArea:visible', { timeout: 4000 });
      const initialScanned = await ocrPage.inputValue('#saveOcrTextArea');
      assert(initialScanned.includes('ทดสอบคอร์ดจากภาพ'), `Expected OCR textarea prefilled, got: ${initialScanned}`);

      await ocrPage.fill('#saveOcrTextArea', 'C        G\nทดสอบคอร์ดที่ปรับแก้แล้ว\nAm       F\nพร้อมเล่นสด 100%');
      await ocrPage.click('#saveOcrConfirmBtn');
      await ocrPage.waitForFunction(() => {
        const b = loadBook();
        return b.some(s => s.id === 'web-ocr-popup-test-1' && s.text.includes('ทดสอบคอร์ดที่ปรับแก้แล้ว'));
      }, undefined, { timeout: 5000 });

      assert(ocrErrs.length === 0, `Page errors (Test 11): ${ocrErrs.join('; ')}`);
      await ocrCtx.close();
      console.log('  PASS: Save Chord Mode Pop-up (Image vs OCR Text + Editable Text) verified.');
    }

    // -------------------------------------------------------------------------
    // Test 12: Friends & Band Groups Management
    // -------------------------------------------------------------------------
    console.log('[Test 12] Friends search/request/accept & Band Group member management...');
    await page.click('#friendsNavBtn');
    await page.waitForSelector('#friendsView:not([hidden])');
    await page.click('[data-fr-tab="search"]');
    await page.fill('#frSearchInput', 'โต้ง');
    await page.click('#frSearchForm button[type="submit"]');
    await page.waitForSelector('[data-fr-act="add"][data-uid="local-u-tong"]', { timeout: 4000 });
    await page.click('[data-fr-act="add"][data-uid="local-u-tong"]');
    // Accept in Local Demo Mode
    await page.waitForSelector('[data-fr-act="accept"]', { timeout: 4000 });
    await page.click('[data-fr-act="accept"]');
    await page.waitForSelector('.badge.green:has-text("เพื่อนกันแล้ว")', { timeout: 4000 });

    // Create Band Group and add accepted friend into the band
    await page.click('[data-fr-tab="groups"]');
    await page.fill('#frNewGroupName', 'The Midnight Band');
    await page.fill('#frNewGroupDesc', 'วงเล่นสดคืนวันศุกร์');
    await page.click('#frCreateGroupForm button[type="submit"]');
    await page.waitForSelector('.fr-group-card:has-text("The Midnight Band")', { timeout: 4000 });
    await page.click('[data-fr-act="add-member"]');
    await page.waitForSelector('.fr-member-chip:has-text("โต้ง กีตาร์")', { timeout: 4000 });
    console.log('  PASS: Friends request/accept & Band Group creation + add member verified.');

    // -------------------------------------------------------------------------
    // Test 13: Real-time Live Room (2-Tab Sync: Presence, Band Group Invite, Song/Key Sync & MIDI)
    // -------------------------------------------------------------------------
    console.log('[Test 13] Real-time Live Room 2-tab sync + 1-click Band Group invite + MIDI Footswitch...');
    {
      // Seed 3 songs in Songbook (Song 1 has BOTH image + text to verify Image-First display, Song 3 will be added mid-session)
      await page.evaluate(() => {
        const seedSongs = [
          {
            id: 'lr-song-1',
            title: 'เพลงเปิดเวที 1',
            artist: 'Band A',
            key: 'C',
            text: '[Verse]\nC       G\nเริ่มเล่นเพลงแรก\nAm      F\nซิงก์พร้อมกันทั้งวง',
            images: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='],
            shift: 0,
            savedAt: Date.now()
          },
          {
            id: 'lr-song-2',
            title: 'เพลงฮิตกลางคืน 2',
            artist: 'Band B',
            key: 'G',
            text: '[Chorus]\nG       D\nเปลี่ยนเพลงอัตโนมัติ\nEm      C\nทั้งวงเห็นคอร์ดเดียวกัน',
            images: [],
            shift: 0,
            savedAt: Date.now()
          }
        ];
        saveBook(seedSongs);
      });

      // Tab 1 (Host): Open Live Room, 1-click pick Band Group, create room
      await page.click('#liveRoomNavBtn');
      await page.waitForSelector('#liveRoomView:not([hidden])');
      await page.waitForSelector('[data-lr-pick-group]', { timeout: 4000 });
      await page.click('[data-lr-pick-group]');
      await page.fill('#lrRoomName', 'เวทีซิงก์สดรอบ 3');
      await page.click('#lrCreateSubmitBtn');
      await page.waitForSelector('#lrRoomCodeBadge', { timeout: 5000 });
      const roomCode = (await page.textContent('#lrRoomCodeBadge')).trim();
      assert(roomCode.length === 6, `Expected 6-char room code, got "${roomCode}"`);

      // Verify Image-First display on Song 1 (has both image and text -> image shown first!)
      await page.waitForSelector('#lrChordGallery .lr-chord-img', { timeout: 4000 });
      assert((await page.locator('#lrModeTextBtn').count()) === 1, 'Expected Image/Text switcher when song has both');

      // Verify iPad wide-stage toggle hides/shows sidebar cleanly
      await page.click('#lrToggleSidebarBtn');
      assert((await page.locator('.lr-stage-body.wide-stage').count()) === 1, 'Expected wide-stage class on iPad toggle');
      await page.click('#lrToggleSidebarBtn');

      // Tab 2 (Member): Same browser context so BroadcastChannel & localStorage mirror cross-tab realtime
      const memberPage = await context.newPage();
      const memberErrs = [];
      memberPage.on('pageerror', err => memberErrs.push(String(err)));
      await memberPage.goto(url, { waitUntil: 'domcontentloaded' });
      await memberPage.waitForSelector('#liveRoomNavBtn', { timeout: 5000 });
      await memberPage.click('#liveRoomNavBtn');
      await memberPage.waitForSelector('#lrJoinCodeInput', { timeout: 5000 });
      await memberPage.fill('#lrJoinCodeInput', roomCode);
      await memberPage.click('#lrJoinSubmitBtn');
      await memberPage.waitForSelector('#lrCurrentSongTitle', { timeout: 5000 });

      // Member also sees Image-First on Song 1!
      await memberPage.waitForSelector('#lrChordGallery .lr-chord-img', { timeout: 4000 });

      // Wait for Presence online count to show 2 members
      await page.waitForFunction(() => {
        const bar = document.querySelector('#lrOnlineBar');
        return bar && bar.textContent.includes('(2)');
      }, undefined, { timeout: 5000 });

      // 0) Host adds a 3rd song right from Live Room Setlist panel -> syncs live to Member!
      await page.evaluate(() => {
        const b = loadBook();
        b.push({
          id: 'lr-song-3',
          title: 'เพลงแถมหน้าเวที 3',
          artist: 'Encore Band',
          key: 'D',
          text: 'D  A  Bm  G',
          images: [],
          shift: 0,
          savedAt: Date.now()
        });
        saveBook(b);
      });
      await page.click('#lrAddSongBtn');
      await page.waitForSelector('[data-lr-picker-add="lr-song-3"]', { timeout: 4000 });
      await page.click('[data-lr-picker-add="lr-song-3"]');
      await page.click('.modal button:has-text("เสร็จสิ้น")');
      await memberPage.waitForFunction(() => {
        const list = document.querySelector('.lr-setlist-list');
        return list && list.textContent.includes('เพลงแถมหน้าเวที 3');
      }, undefined, { timeout: 5000 });

      // 1) Host clicks Next Song -> Member syncs to Song 2 immediately
      await page.click('#lrNextSongBtn');
      await memberPage.waitForFunction(() => {
        const t = document.querySelector('#lrCurrentSongTitle');
        return t && t.textContent.includes('เพลงฮิตกลางคืน 2');
      }, undefined, { timeout: 5000 });

      // 2) Host transposes Key +2 -> Member syncs key shift (+2) immediately
      await page.click('#lrKeyUpBtn');
      await page.click('#lrKeyUpBtn');
      await memberPage.waitForFunction(() => {
        const s = document.querySelector('#lrShiftVal');
        return s && s.textContent.includes('+2');
      }, undefined, { timeout: 5000 });

      // 3) MIDI Footswitch on Host -> prevSong syncs both Host & Member back to Song 1
      await page.evaluate(() => {
        window.__mellowModules.midi.simulateAction('prevSong');
      });
      await memberPage.waitForFunction(() => {
        const t = document.querySelector('#lrCurrentSongTitle');
        return t && t.textContent.includes('เพลงเปิดเวที 1');
      }, undefined, { timeout: 5000 });

      // 4) MIDI Footswitch on Member (while locked to Follow Host) -> stays on Song 1
      await memberPage.evaluate(() => {
        window.__mellowModules.midi.simulateAction('nextSong');
      });
      await memberPage.waitForTimeout(300);
      const memberTitleAfterLockedMidi = (await memberPage.textContent('#lrCurrentSongTitle')).trim();
      assert(memberTitleAfterLockedMidi.includes('เพลงเปิดเวที 1'),
        `Expected locked member to stay on Song 1 after MIDI, got "${memberTitleAfterLockedMidi}"`);

      assert(memberErrs.length === 0, `Page errors on Member tab: ${memberErrs.join('; ')}`);
      await memberPage.close();
      console.log(`  PASS: Live Room (${roomCode}) Image-First, In-Room +Add Song Sync, iPad Wide-Stage, 2-tab Presence, Song/Key Sync & MIDI verified.`);
    }

    // -------------------------------------------------------------------------
    // Test 14: iPad Portrait (820x1180) & Landscape (1180x820) Fullscreen Stage Mode
    // -------------------------------------------------------------------------
    console.log('[Test 14] iPad Portrait & Landscape Stage/Focus Mode (#stageQuickSearchBtn & full-width)...');
    {
      const ipadCtx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
      const ipadPage = await ipadCtx.newPage();
      const ipadErrs = [];
      ipadPage.on('pageerror', err => ipadErrs.push(String(err)));
      await ipadPage.goto(url, { waitUntil: 'domcontentloaded' });
      await ipadPage.waitForSelector('#songbook', { timeout: 5000 });

      await ipadPage.evaluate(() => {
        openSong({
          id: 'ipad-stage-1',
          title: 'เพลงทดสอบ iPad เต็มจอ',
          artist: 'iPad Band',
          key: 'C',
          text: '[Chorus]\nC   G   Am   F\nเต็มจอทั้งแนวตั้งและแนวนอน',
          images: []
        }, 0);
      });
      await ipadPage.waitForSelector('#focusBtn', { timeout: 4000 });
      // Verify NORMAL (non-focus) song view on iPad Portrait is 100% full-width (NOT squished into 300px!) and .focusTopBar doesn't overlap Header
      const normalPortrait = await ipadPage.evaluate(() => ({
        paneWidth: document.querySelector('#pane').getBoundingClientRect().width,
        vw: window.innerWidth,
        focusBarHidden: getComputedStyle(document.querySelector('.focusTopBar')).display === 'none'
      }));
      assert(normalPortrait.paneWidth >= normalPortrait.vw * 0.9,
        `Expected full-width #pane in normal iPad Portrait song view, got ${normalPortrait.paneWidth} / ${normalPortrait.vw}`);
      assert(normalPortrait.focusBarHidden, 'Expected .focusTopBar hidden outside Focus Mode so #wakeLockBadge never overlaps Header');

      await ipadPage.click('#focusBtn');
      await ipadPage.waitForSelector('#stageQuickSearchBtn:visible', { timeout: 4000 });

      // Check iPad Portrait width
      const portraitMetrics = await ipadPage.evaluate(() => ({
        paneWidth: document.querySelector('#pane').getBoundingClientRect().width,
        vw: window.innerWidth,
        searchVisible: !document.querySelector('#stageQuickSearchBtn').hidden
      }));
      assert(portraitMetrics.searchVisible, 'Expected #stageQuickSearchBtn visible on iPad Portrait');
      assert(portraitMetrics.paneWidth >= portraitMetrics.vw * 0.9,
        `Expected full-width #pane on iPad Portrait, got ${portraitMetrics.paneWidth} / ${portraitMetrics.vw}`);

      // Switch to iPad Landscape (1180x820)
      await ipadPage.setViewportSize({ width: 1180, height: 820 });
      await ipadPage.waitForTimeout(150);
      const landscapeMetrics = await ipadPage.evaluate(() => ({
        paneWidth: document.querySelector('#pane').getBoundingClientRect().width,
        vw: window.innerWidth,
        searchVisible: !document.querySelector('#stageQuickSearchBtn').hidden
      }));
      assert(landscapeMetrics.searchVisible, 'Expected #stageQuickSearchBtn visible on iPad Landscape');
      assert(landscapeMetrics.paneWidth >= landscapeMetrics.vw * 0.9,
        `Expected full-width #pane on iPad Landscape, got ${landscapeMetrics.paneWidth} / ${landscapeMetrics.vw}`);

      // Clicking #stageQuickSearchBtn opens Quick Song Switcher modal cleanly
      await ipadPage.click('#stageQuickSearchBtn');
      await ipadPage.waitForSelector('.modal', { timeout: 4000 });

      assert(ipadErrs.length === 0, `Page errors (Test 14): ${ipadErrs.join('; ')}`);
      await ipadCtx.close();
      console.log(`  PASS: iPad Portrait (${Math.round(portraitMetrics.paneWidth)}px) & Landscape (${Math.round(landscapeMetrics.paneWidth)}px) fullscreen & #stageQuickSearchBtn verified.`);
    }

    // -------------------------------------------------------------------------
    // Test 15: Precision ChordPro Parser, ChordTextViewer (+/-12 Transpose),
    //          Side-by-Side Verify & Teach Learning Memory, Dynamic Few-Shot Re-parse & Live Room
    // -------------------------------------------------------------------------
    console.log('[Test 15] Precision ChordPro Parser + ChordTextViewer + Verify & Teach + Dynamic Re-parse + Live Room...');
    {
      const cpCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      const cpPage = await cpCtx.newPage();
      const cpErrs = [];
      cpPage.on('pageerror', err => cpErrs.push(String(err)));
      await cpPage.goto(url, { waitUntil: 'domcontentloaded' });
      await cpPage.waitForSelector('#songbook', { timeout: 5000 });

      // 15a) Verify Transpose Engine (+/-12 semitones, Slash, Complex chords, Smart #/b, Thai vowel guard)
      const unitResults = await cpPage.evaluate(() => {
        const V = window.MellowChordTextViewer;
        const sample = '{comment: Intro}\n[| C | G/B | F#m7b5 | Asus4 |]\n\nเ[C]ธอทำให้ฉัน[Em7]รู้สึก ว่า[G/B]รัก[C6/9]แท้';
        const trUp2 = V.transposeChordPro(sample, 2, 'C', 'auto');     // Key D -> sharps
        const trUp5 = V.transposeChordPro(sample, 5, 'C', 'auto');     // Key F -> flats
        const trDown12 = V.transposeChordPro(sample, -12, 'C', 'auto'); // -12 semitones -> octave C
        const trForceFlat = V.transposeChordPro('[F#m7b5]รัก[G/B]เธอ', 0, 'C', 'flat');
        return { trUp2, trUp5, trDown12, trForceFlat };
      });

      assert(unitResults.trUp2.includes('[| D | A/C# | G#m7b5 | Bsus4 |]'), `Expected +2 bar transpose, got: ${unitResults.trUp2}`);
      assert(unitResults.trUp2.includes('[D]เธอทำให้ฉัน[F#m7]รู้สึก ว่า[A/C#]รัก[D6/9]แท้'),
        `Expected +2 lyric ChordPro & Thai leading vowel snap, got: ${unitResults.trUp2}`);
      assert(unitResults.trUp5.includes('[| F | C/E | Bm7b5 | Dsus4 |]'), `Expected +5 flat key F transpose, got: ${unitResults.trUp5}`);
      assert(unitResults.trDown12.includes('[C]เธอทำให้ฉัน[Em7]รู้สึก'), `Expected -12 semitones clean transpose, got: ${unitResults.trDown12}`);
      assert(unitResults.trForceFlat.includes('[Gbm7b5]รัก[G/B]เธอ'), `Expected forced flat respelling, got: ${unitResults.trForceFlat}`);

      // 15b) Open Chordtabs image song with initial raw AI mistakes -> Side-by-Side Verify & Teach
      await cpPage.evaluate(() => {
        const samplePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAADklEQVR42mP8z8AARMAgAAf4AQH/4m0OAAAAAElFTkSuQmCC';
        const rawMistakeSong = {
          id: 'ct-precision-teach-1',
          title: 'เพลงทดสอบสอนระบบแกะคอร์ด',
          artist: 'Precision Band',
          key: 'C',
          src: 'https://chordtabs.in.th/99999',
          images: [samplePng],
          parsedChordSheet: {
            original_key: 'C',
            source_domain: 'chordtabs',
            is_verified: false,
            rawAiOutput: '{comment: Verse}\n[C]เธอทำให้ฉัน [Em7]รู้สึกรัก[F#rn7b5]มาก',
            chordpro_content: '{comment: Verse}\n[C]เธอทำให้ฉัน [Em7]รู้สึกรัก[F#rn7b5]มาก'
          }
        };
        openSong(rawMistakeSong, 0);
      });

      await cpPage.waitForSelector('#cdvOpenVerifyBtn', { timeout: 4000 });
      await cpPage.click('#cdvOpenVerifyBtn');
      await cpPage.waitForSelector('#cvmOverlay', { timeout: 4000 });
      await cpPage.waitForSelector('#cvmImageViewport img.cvm-orig-img', { timeout: 4000 });
      await cpPage.waitForSelector('#cvmChordProEditor', { timeout: 4000 });

      // Edit ChordPro to fix [F#rn7b5] -> [F#m7b5] and tighten [Em7] directly before รู้สึก
      const correctedChordPro = '{comment: Intro}\n[| C | G/B | Am7 | F |]\n\n{comment: Verse}\n[C]เธอทำให้ฉัน[Em7]รู้สึกรัก[F#m7b5]มาก';
      await cpPage.fill('#cvmChordProEditor', correctedChordPro);

      // Verify live ChordTextViewer preview renders CSS inline-flex pairs (zero spacebars) directly above Thai syllables
      const flexCheck = await cpPage.evaluate(() => {
        const pairs = Array.from(document.querySelectorAll('#cvmLivePreview .ctv-pair'));
        const targetPair = pairs.find(p => p.textContent.includes('รู้สึกรัก'));
        if (!targetPair) return null;
        const cs = getComputedStyle(targetPair);
        const chordEl = targetPair.querySelector('.ctv-chord-slot');
        const lyricEl = targetPair.querySelector('.ctv-lyric-slot');
        const cRect = chordEl.getBoundingClientRect();
        const lRect = lyricEl.getBoundingClientRect();
        return {
          display: cs.display,
          dir: cs.flexDirection,
          leftDelta: Math.abs(cRect.left - lRect.left),
          chordAboveLyric: cRect.bottom <= lRect.top + 2
        };
      });
      assert(
        flexCheck && flexCheck.display === 'inline-flex' && flexCheck.dir === 'column' &&
        flexCheck.leftDelta <= 2 && flexCheck.chordAboveLyric,
        `Expected CSS inline-flex column floating directly above Thai syllable, got: ${JSON.stringify(flexCheck)}`
      );

      // Click "บันทึกและสอนระบบ" (#cvmSaveTeachBtn)
      await cpPage.click('#cvmSaveTeachBtn');
      await cpPage.waitForSelector('.cvm-verify-badge.is-verified', { timeout: 4000 });

      // Verify song DB record updated (original_key, chordpro_content, source_domain, is_verified = true)
      // AND chord_parser_memory stored learned diff rules + verified few-shot example
      const learnedState = await cpPage.evaluate(async () => {
        const book = loadBook();
        const saved = book.find(s => s.id === 'ct-precision-teach-1');
        const mem = await window.MellowChordParser.fetchParserMemory('chordtabs');
        const prompt = window.MellowChordParser.buildVisionSystemPrompt(mem);
        return { saved, mem, prompt };
      });

      assert(learnedState.saved && learnedState.saved.is_verified === true, 'Expected song is_verified = true after Save & Teach');
      assert(learnedState.saved.source_domain === 'chordtabs', `Expected source_domain='chordtabs', got ${learnedState.saved.source_domain}`);
      assert(learnedState.saved.chordpro_content.includes('[F#m7b5]มาก'), 'Expected saved chordpro_content updated');
      assert(learnedState.mem.correctionRules.some(r => r.wrong === '[F#rn7b5]' && r.right === '[F#m7b5]'),
        `Expected learned rule [F#rn7b5] -> [F#m7b5], got: ${JSON.stringify(learnedState.mem.correctionRules)}`);
      assert(learnedState.prompt.includes('LEARNED CORRECTION RULES') && learnedState.prompt.includes('VERIFIED FEW-SHOT CHORDPRO EXAMPLES'),
        'Expected Dynamic Few-Shot Vision System Prompt to inject learned rules & verified examples');

      await cpPage.click('#cvmCloseBtn');

      // 15c) Test "ลองแกะใหม่ (Re-parse)" on a 2nd song applying learned memory + Dynamic Prompt
      const reparseCheck = await cpPage.evaluate(async () => {
        const samplePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAADklEQVR42mP8z8AARMAgAAf4AQH/4m0OAAAAAElFTkSuQmCC';
        let capturedPrompt = '';
        const res = await window.MellowChordParser.parseChordImage(samplePng, {
          songId: 'ct-reparse-song-2',
          sourceDomain: 'chordtabs',
          visionRunner: async (_blob, ctx) => {
            capturedPrompt = ctx.systemPrompt;
            // Simulate AI returning raw mistake [F#rn7b5] which learned rules also guard against
            return {
              title: 'เพลงใหม่หลังเรียนรู้',
              artist: 'AI Band',
              original_key: 'G',
              chordpro_content: '{comment: Chorus}\n[G]ใจยังรัก[F#rn7b5]เธอ[B7]เสมอ'
            };
          }
        });
        return { res, capturedPrompt };
      });

      assert(reparseCheck.capturedPrompt.includes('[F#rn7b5]'), 'Expected dynamic prompt sent to Vision AI to contain learned rule');
      assert(reparseCheck.res.chordpro_content.includes('[F#m7b5]เธอ'),
        `Expected learned memory applied on new parse, got: ${reparseCheck.res.chordpro_content}`);
      assert(reparseCheck.res.memoryApplied.examplesCount >= 1, 'Expected >= 1 verified few-shot example applied');

      // 15d) Verify ChordTextViewer inside Live Room (floating chords + +/-12 transpose sync)
      await cpPage.click('#liveRoomNavBtn');
      await cpPage.waitForSelector('#liveRoomView:not([hidden])');
      await cpPage.fill('#lrRoomName', 'ห้องทดสอบ ChordPro สด');
      await cpPage.click('#lrCreateSubmitBtn');
      await cpPage.waitForSelector('#lrModeTextBtn', { timeout: 4000 });
      await cpPage.click('#lrModeTextBtn');
      await cpPage.waitForSelector('#lrChordSheet .ctv-pair .ctv-chord-pill', { timeout: 4000 });

      // Transpose +2 in Live Room -> [C] becomes [D], [G/B] becomes [A/C#], [F#m7b5] becomes [G#m7b5]
      await cpPage.click('#lrKeyUpBtn');
      await cpPage.click('#lrKeyUpBtn');
      const lrChordsText = await cpPage.evaluate(() =>
        Array.from(document.querySelectorAll('#lrChordSheet .ctv-chord-pill')).map(el => el.textContent.trim())
      );
      assert(lrChordsText.includes('D') && lrChordsText.includes('A/C#') && lrChordsText.includes('G#m7b5'),
        `Expected Live Room ChordTextViewer +2 chords [D, A/C#, G#m7b5], got: ${lrChordsText.join(', ')}`);

      assert(cpErrs.length === 0, `Page errors (Test 15): ${cpErrs.join('; ')}`);
      await cpCtx.close();
      console.log('  PASS: Precision ChordPro, ChordTextViewer (+/-12, Slash/Complex, #/b), Verify & Teach Memory, Dynamic Re-parse & Live Room verified.');
    }

    // -------------------------------------------------------------------------
    // Test 16: User Guide & Version Release Notice Modals
    // -------------------------------------------------------------------------
    console.log('[Test 16] User Guide & Version Release Notice Modals (#userGuideNavBtn, #noticeNavBtn, openAcct banners)...');
    {
      const ugCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const ugPage = await ugCtx.newPage();
      await ugPage.goto(url, { waitUntil: 'domcontentloaded' });
      await ugPage.waitForSelector('#hdr');

      // 16a) Click #userGuideNavBtn in header -> Verify modal opens with sections & button descriptions
      await ugPage.click('#userGuideNavBtn');
      await ugPage.waitForSelector('.modal .guideSection', { timeout: 3000 });
      const guideSections = await ugPage.locator('.modal .guideSectionTitle').count();
      assert(guideSections >= 3, `Expected at least 3 guide sections, got: ${guideSections}`);
      const hasCalibrationBadge = await ugPage.evaluate(() => document.body.innerText.includes('🎯 เทียบภาพ/สอนระบบ'));
      assert(hasCalibrationBadge, 'Expected user guide to describe 🎯 เทียบภาพ/สอนระบบ');
      await ugPage.click('.modal button:has-text("✕ ปิดคู่มือ")');

      // 16b) Click #noticeNavBtn in header -> Verify Version Notice modal opens with v2.6.0
      await ugPage.click('#noticeNavBtn');
      await ugPage.waitForSelector('.modal .noticeItem', { timeout: 3000 });
      const noticeTitle = await ugPage.evaluate(() => document.querySelector('.modal h3')?.textContent || '');
      assert(noticeTitle.includes('Gemini 3.8 Flash'), `Expected notice title with Gemini 3.8 Flash, got: ${noticeTitle}`);
      await ugPage.click('.modal button:has-text("✓ รับทราบและเริ่มใช้งาน")');

      // 16c) Open Account / Login modal -> Verify both Notice and User Guide banners exist
      await ugPage.click('#acct');
      await ugPage.waitForSelector('.modal .noticeBanner', { timeout: 3000 });
      await ugPage.waitForSelector('.modal .userGuideBanner', { timeout: 3000 });
      console.log('  PASS: User Guide & Version Release Notice Modals and Login banners verified.');
      await ugCtx.close();
    }

    assert(pageErrors.length === 0, `Page errors occurred: ${pageErrors.join('; ')}`);
    assert(consoleErrors.length === 0, `Console errors occurred: ${consoleErrors.join('; ')}`);
    assert(softFailures.length === 0, `Subtest failures: ${softFailures.join('; ')}`);

    console.log('\n✅ ALL 16 E2E, RBAC, FRIENDS/GROUPS, LIVE ROOM, MIDI, IPAD STAGE, PRECISION CHORD PARSER & USER GUIDE TESTS PASSED!');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch(err => {
  console.error('\n❌ E2E FAILED:', err);
  process.exit(1);
});
