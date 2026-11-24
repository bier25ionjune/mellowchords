/* ==============================================================================
 * Mellow Chords - Setlist Picker Service
 * Pure logic for songbook filtering, duplicate detection, and online auto-add.
 * Exposes: window.MellowSetlistPickerService
 * ============================================================================== */
(function (global) {
  'use strict';

  /**
   * Normalize text for fuzzy/duplicate matching:
   * trims, Unicode NFC normalizes, lowercases, strips punctuation, collapses whitespace.
   * Preserves Thai vowels/tone marks and alphanumeric characters across scripts.
   * @param {string} str
   * @returns {string}
   */
  function normalizeText(str) {
    if (str == null) return '';
    let s = String(str);
    if (typeof s.normalize === 'function') {
      s = s.normalize('NFC');
    }
    return s
      .toLowerCase()
      .replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~–—…“”‘’•·|()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract numeric song ID from chordtabs.in.th URLs.
   * Supports /chordtabs.in.th/<id> and ?song_id=<id> / &song_id=<id>.
   * @param {string} url
   * @returns {string|null}
   */
  function extractChordtabsId(url) {
    if (typeof url !== 'string' || !url.trim()) return null;
    const m = url.match(/chordtabs\.in\.th\/(\d+)/i) || url.match(/[?&]song_id=(\d+)/i);
    return m ? m[1] : null;
  }

  /**
   * Extract a normalized URL string for duplicate comparison.
   * @param {string} raw
   * @returns {string}
   */
  function normalizeUrl(raw) {
    if (typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    try {
      const u = new URL(trimmed);
      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      const pathname = u.pathname.replace(/\/+$/, '') || '/';
      // Sort query params for stable comparison
      const params = Array.from(u.searchParams.entries())
        .sort(function (a, b) {
          return a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0]);
        });
      const qs = params.length
        ? '?' + params.map(function (kv) {
            return encodeURIComponent(kv[0]) + '=' + encodeURIComponent(kv[1]);
          }).join('&')
        : '';
      return host + pathname.toLowerCase() + qs;
    } catch (_) {
      return trimmed
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/#.*$/, '')
        .replace(/\/+$/, '');
    }
  }

  /**
   * Collect all candidate URLs on a song/result object.
   * @param {object} song
   * @returns {string[]}
   */
  function getSongUrls(song) {
    if (!song || typeof song !== 'object') return [];
    const fields = [song.sourceUrl, song.url, song.src];
    const out = [];
    for (let i = 0; i < fields.length; i++) {
      const n = normalizeUrl(fields[i]);
      if (n && out.indexOf(n) === -1) out.push(n);
    }
    return out;
  }

  /**
   * Extract chordtabs numeric ID from any URL/id field on a song object.
   * @param {object} song
   * @returns {string|null}
   */
  function getSongChordtabsId(song) {
    if (!song || typeof song !== 'object') return null;
    if (song._ctSongId != null && /^\d+$/.test(String(song._ctSongId))) {
      return String(song._ctSongId);
    }
    const candidates = [song.sourceUrl, song.url, song.src, song.id];
    for (let i = 0; i < candidates.length; i++) {
      const val = candidates[i];
      if (typeof val !== 'string' || !val) continue;
      const fromUrl = extractChordtabsId(val);
      if (fromUrl) return fromUrl;
      const ctPrefix = val.match(/^ct-(\d+)$/i);
      if (ctPrefix) return ctPrefix[1];
    }
    return null;
  }

  /**
   * Check whether a candidate song already exists in the songbook.
   * Priority order:
   *  1) Exact `id` match
   *  2) Same `chordtabsId` (from `sourceUrl`, `url`, `src`, `_ctSongId`, or `id`)
   *  3) Exact normalized `sourceUrl` / `url` / `src` match
   *  4) Normalized `title` + `artist` match (or normalized `title` if both have empty artist)
   * @param {Array<object>} book
   * @param {object} candidate
   * @returns {object|null}
   */
  function findDuplicateInSongbook(book, candidate) {
    if (!Array.isArray(book) || !book.length || !candidate || typeof candidate !== 'object') {
      return null;
    }

    // 1) Exact id match
    const candId = candidate.id != null && String(candidate.id).trim() !== ''
      ? String(candidate.id)
      : '';
    if (candId) {
      for (let i = 0; i < book.length; i++) {
        const s = book[i];
        if (s && s.id != null && String(s.id) === candId) {
          return s;
        }
      }
    }

    // 2) Same chordtabsId
    const candCtId = getSongChordtabsId(candidate);
    if (candCtId) {
      for (let i = 0; i < book.length; i++) {
        const s = book[i];
        if (s && getSongChordtabsId(s) === candCtId) {
          return s;
        }
      }
    }

    // 3) Exact normalized sourceUrl / url / src match
    const candUrls = getSongUrls(candidate);
    if (candUrls.length) {
      for (let i = 0; i < book.length; i++) {
        const s = book[i];
        if (!s) continue;
        const sUrls = getSongUrls(s);
        for (let j = 0; j < candUrls.length; j++) {
          if (sUrls.indexOf(candUrls[j]) !== -1) {
            return s;
          }
        }
      }
    }

    // 4) Normalized title + artist match (or title only when both have empty artist)
    const candTitle = normalizeText(candidate.title);
    if (candTitle) {
      const candArtist = normalizeText(candidate.artist);
      for (let i = 0; i < book.length; i++) {
        const s = book[i];
        if (!s) continue;
        if (normalizeText(s.title) !== candTitle) continue;
        const sArtist = normalizeText(s.artist);
        if (sArtist === candArtist) {
          return s;
        }
      }
    }

    return null;
  }

  /**
   * Filter the songbook by query and filter mode.
   * @param {Array<object>} book
   * @param {object} [options]
   * @param {string} [options.query]
   * @param {'all'|'not_in_set'|'in_set'|'fav'} [options.filter]
   * @param {Array<string>} [options.currentSongIds]
   * @param {Array<string>} [options.favIds]
   * @returns {Array<{ song: object, inSetlist: boolean, isFav: boolean }>}
   */
  function filterSongbook(book, options) {
    if (!Array.isArray(book)) return [];
    const opts = options || {};
    const filter = opts.filter || 'all';
    const rawQuery = String(opts.query || '').trim().toLowerCase();
    const tokens = rawQuery ? rawQuery.split(/\s+/).filter(Boolean) : [];

    const currentSet = new Set(
      Array.isArray(opts.currentSongIds) ? opts.currentSongIds.map(String) : []
    );
    const hasFavList = Array.isArray(opts.favIds);
    const favSet = new Set(hasFavList ? opts.favIds.map(String) : []);

    const results = [];
    for (let i = 0; i < book.length; i++) {
      const song = book[i];
      if (!song || typeof song !== 'object') continue;

      const idStr = song.id != null ? String(song.id) : '';
      const inSetlist = idStr !== '' && currentSet.has(idStr);
      const isFav = hasFavList
        ? (idStr !== '' && favSet.has(idStr))
        : Boolean(song.fav || song.isFav);

      if (filter === 'not_in_set' && inSetlist) continue;
      if (filter === 'in_set' && !inSetlist) continue;
      if (filter === 'fav' && !isFav) continue;

      if (tokens.length > 0) {
        const title = String(song.title || '').toLowerCase();
        const artist = String(song.artist || '').toLowerCase();
        const key = String(song.key || '').toLowerCase();
        const haystack = title + ' ' + artist + ' ' + key;

        let matched = haystack.indexOf(rawQuery) !== -1;
        if (!matched && tokens.length > 1) {
          matched = tokens.every(function (tok) {
            return haystack.indexOf(tok) !== -1;
          });
        }
        if (!matched) continue;
      }

      results.push({
        song: song,
        inSetlist: inSetlist,
        isFav: isFav
      });
    }

    return results;
  }

  /**
   * Check whether a song has image chords or text chords.
   */
  function hasImages(song) {
    return Boolean(song && Array.isArray(song.images) && song.images.length > 0);
  }

  function hasText(song) {
    return Boolean(song && typeof song.text === 'string' && song.text.trim().length > 0);
  }

  /**
   * Fetch an online song, deduplicate against the songbook (enriching missing data if needed),
   * save to songbook if new, and add to the target setlist if not already included.
   *
   * @param {object} params
   * @param {object} params.item
   * @param {Array<object>} [params.allResults]
   * @param {string} params.setlistId
   * @param {Array<string>} [params.currentSongIds]
   * @param {object} params.adapters
   * @returns {Promise<{ song: object, alreadyInBook: boolean, alreadyInSetlist: boolean }>}
   */
  async function onlineAutoAddToSetlist(params) {
    const p = params || {};
    const adapters = p.adapters || {};

    if (typeof adapters.loadOnlineSong !== 'function') {
      throw new Error('Missing adapter: loadOnlineSong');
    }
    if (typeof adapters.saveSongToBook !== 'function') {
      throw new Error('Missing adapter: saveSongToBook');
    }
    if (typeof adapters.addSongToSetlist !== 'function') {
      throw new Error('Missing adapter: addSongToSetlist');
    }

    const fetchedSong = await adapters.loadOnlineSong(p.item, p.allResults || []);
    if (!fetchedSong || typeof fetchedSong !== 'object') {
      throw new Error('ไม่สามารถโหลดข้อมูลคอร์ดเพลงได้');
    }

    const book = typeof adapters.getSongbook === 'function'
      ? (adapters.getSongbook() || [])
      : [];

    const existing = findDuplicateInSongbook(book, fetchedSong);
    let savedSong;
    let alreadyInBook = false;

    if (existing) {
      alreadyInBook = true;
      const needsImages = !hasImages(existing) && hasImages(fetchedSong);
      const needsText = !hasText(existing) && hasText(fetchedSong);

      if (needsImages || needsText) {
        const enriched = Object.assign({}, existing);
        if (needsImages) enriched.images = fetchedSong.images.slice();
        if (needsText) enriched.text = fetchedSong.text;
        if (!enriched.artist && fetchedSong.artist) enriched.artist = fetchedSong.artist;
        if (!enriched.key && fetchedSong.key) enriched.key = fetchedSong.key;
        if (!enriched.sourceUrl && fetchedSong.sourceUrl) enriched.sourceUrl = fetchedSong.sourceUrl;
        if (!enriched.src && fetchedSong.src) enriched.src = fetchedSong.src;

        const updated = await adapters.saveSongToBook(enriched);
        savedSong = updated || enriched;
      } else {
        savedSong = existing;
      }
    } else {
      alreadyInBook = false;
      const created = await adapters.saveSongToBook(fetchedSong);
      savedSong = created || fetchedSong;
    }

    const currentSet = new Set(
      Array.isArray(p.currentSongIds) ? p.currentSongIds.map(String) : []
    );
    const savedId = savedSong && savedSong.id != null ? String(savedSong.id) : '';
    const alreadyInSetlist = savedId !== '' && currentSet.has(savedId);

    if (!alreadyInSetlist) {
      await adapters.addSongToSetlist(p.setlistId, savedSong);
    }

    return {
      song: savedSong,
      alreadyInBook: alreadyInBook,
      alreadyInSetlist: alreadyInSetlist
    };
  }

  const api = {
    normalizeText: normalizeText,
    extractChordtabsId: extractChordtabsId,
    findDuplicateInSongbook: findDuplicateInSongbook,
    filterSongbook: filterSongbook,
    onlineAutoAddToSetlist: onlineAutoAddToSetlist
  };

  global.MellowSetlistPickerService = api;
})(typeof window !== 'undefined' ? window : globalThis);
