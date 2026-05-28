// FB Auto Scroll payload.
// Original script: THIS IS FINE v4.8 by fb_ivan.
const FINE_BUILD = "280526b1";
const FINE_UPSTREAM_VERSION = "4.8";
/* ═══════════════════════════════════════════════════════════
     🐶 THIS IS FINE v4.8 — Reels + Feed + Both
     ═══════════════════════════════════════════════════════════ */

  if (window.__fineDragController__) window.__fineDragController__.abort();
  if (window.__fineTimers__) {
    Object.values(window.__fineTimers__).forEach(function(t) {
      clearInterval(t); clearTimeout(t);
    });
  }
  window.__fineDragController__ = new AbortController();
  window.__fineTimers__ = {};
  const signal = window.__fineDragController__.signal;

  const old = document.getElementById("__neutralAutoScrollUI__");
  if (old) old.remove();

  const P = '__fine_' + Math.random().toString(36).substr(2, 6) + '_';

  // ── State ──
  let running = false;
  let isPaused = false;
  let wavePhase = 'normal';
  let waveCounter = 0;
  let activeSurface = 'reels';
  let surfaceScrolls = 0;
  let switchAfter = 0;
  let feedRhythm = null;
  let feedRhythmLeft = 0;
  let feedLongPauseIn = 0;
  let _cachedScrollTarget = null;
  let _cacheTimestamp = 0;
  const CACHE_TTL = 15000;
  const TM = window.__fineTimers__;

  let stats = {
    scrolls: 0, likes: 0, likeFails: 0,
    alreadyLiked: 0, breaks: 0, startTime: null,
    feedScrolls: 0, reelsScrolls: 0, switches: 0
  };

  const LIKE_LABELS = [
    'like','нравится','thích','me gusta',"j'aime",'gefällt mir','curtir',
    '좋아요','いいね','أعجبني','beğen','suka','mi piace','tykkää','leuk',
    'gilla','synes godt om','lubię to','подобається','лайк','patīk','patinka'
  ];

  const BLOCK_PHRASES = [
    'confirm your identity','подтвердите свою личность',
    'verify your identity','video selfie','видеоселфи',
    'suspicious activity','подозрительная активность',
    'temporarily blocked','временно заблокирован',
    'automated behavior','автоматическое поведение'
  ];

  const HOME_LABELS = [
    'home','главная','главная страница',
    'inicio','accueil','startseite','página inicial','pagina iniziale',
    'início','trang chủ','beranda','홈','ホーム','الصفحة الرئيسية','ana sayfa'
  ];

  const REELS_LABELS = [
    'reels','reel','рилс','рилсы','видео reels','reels videos',
    'videos cortos','réels','kurzvideos','短视频','릴스','リール'
  ];

  const FACEBOOK_REELS_ROOT = 'https://www.facebook.com/reel/';
  const REELS_NEXT_ARROW_PATH = 'm10.293 15.293 2.94-2.94a.5.5 0 0 0 0-.707l-2.94-2.939a1 1 0 0 1 1.414-1.414l2.94 2.94a2.5 2.5 0 0 1 0 3.535l-2.94 2.94a1 1 0 0 1-1.414-1.415z';

  // ── Utils ──
  const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const randFloat = (a, b) => Math.random() * (b - a) + a;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const $ = id => document.getElementById(P + id);

  function gaussRand(min, max) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    let n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.floor(min + clamp(n / 6 + 0.5, 0, 1) * (max - min));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ── Settings ──
  const STORAGE_KEY = '__fine_v4';
  const SETTING_IDS = [
    'mode','minS','maxS','chanceMin','chanceMax','breakMinMin','breakMinMax',
    'breakSecMin','breakSecMax','sessionMax','maxScrolls','nightStart','nightEnd'
  ];
  const DEFAULTS = {
    mode:'reels', minS:8, maxS:25, chanceMin:40, chanceMax:80,
    breakMinMin:15, breakMinMax:35, breakSecMin:120, breakSecMax:420,
    sessionMax:120, maxScrolls:0, nightStart:2, nightEnd:6
  };

  function saveSettings() {
    const s = {};
    SETTING_IDS.forEach(id => { if ($(id)) s[id] = $(id).value; });
    if ($('smooth')) s.smooth = $('smooth').checked;
    if ($('nightMode')) s.nightMode = $('nightMode').checked;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
    catch(e) { console.warn('🐶 Save error:', e); }
  }

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!s) return;
      Object.keys(s).forEach(k => {
        const el = $(k);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = s[k];
        else el.value = s[k];
      });
    } catch(e) { console.warn('🐶 Load error:', e); }
  }

  function resetSettings() {
    try { localStorage.removeItem(STORAGE_KEY); } catch(e){}
    Object.entries(DEFAULTS).forEach(([k,v]) => { if ($(k)) $(k).value = v; });
    if ($('smooth')) $('smooth').checked = true;
    if ($('nightMode')) $('nightMode').checked = true;
    updateModeSpecificUI();
  }

  // ── Timer management ──
  function clearAllTimers() {
    ['countdown','breakT','session','mouse','block','breakCD','nextCycle'].forEach(k => {
      if (TM[k]) { clearInterval(TM[k]); clearTimeout(TM[k]); TM[k] = null; }
    });
  }

  function getMode() {
    const el = $('mode');
    return el && (el.value === 'feed' || el.value === 'reels' || el.value === 'both')
      ? el.value : 'reels';
  }

  function getActiveSurface() {
    return getMode() === 'both' ? activeSurface : getMode();
  }

  function getModeLabel() {
    const mode = getMode();
    if (mode === 'both') return 'Both';
    return mode === 'feed' ? 'Feed' : 'Reels';
  }

  function getSurfaceLabel() {
    return getActiveSurface() === 'feed' ? 'Feed' : 'Reels';
  }

  function resetSurfaceSwitchCounter() {
    surfaceScrolls = 0;
    switchAfter = randInt(7, 14);
  }

  function isFacebookHost(host) {
    return /(^|\.)facebook\.com$/i.test(host);
  }

  function isFeedSurface() {
    const path = window.location.pathname.toLowerCase();
    const clean = path === '/' ? '/' : path.replace(/\/+$/, '');
    return clean === '/' || clean === '/home.php';
  }

  function isReelsSurface() {
    const path = window.location.pathname.toLowerCase();
    return path === '/reel' || path === '/reels'
      || path.startsWith('/reel/') || path.startsWith('/reels/')
      || !!document.querySelector('[data-pagelet="Reels"]');
  }

  function isElementVisible(el) {
    if (!el || !document.contains(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 16 || r.height < 16) return false;
    if (r.bottom < 0 || r.top > window.innerHeight) return false;
    try {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity || '1') < 0.2)
        return false;
    } catch(e) {}
    return true;
  }

  function waitUntil(check, timeoutMs, intervalMs) {
    return new Promise(resolve => {
      const started = Date.now();
      const tick = () => {
        if (check()) return resolve(true);
        if (Date.now() - started >= timeoutMs) return resolve(false);
        setTimeout(tick, intervalMs || 250);
      };
      tick();
    });
  }

  // ══════════════════════════════════════
  //  SCROLL TARGETS
  // ══════════════════════════════════════
  function getScrollTarget() {
    const now = Date.now();
    if (_cachedScrollTarget && (now - _cacheTimestamp) < CACHE_TTL
        && document.contains(_cachedScrollTarget)
        && _cachedScrollTarget.scrollHeight > _cachedScrollTarget.clientHeight) {
      return _cachedScrollTarget;
    }

    const sels = [
      '[data-pagelet="Reels"] [style*="overflow"]',
      '[data-pagelet] [style*="overflow"]',
      '[role="main"] [style*="overflow"]',
      'div[style*="overflow-y: auto"]',
      'div[style*="overflow-y:auto"]',
      'div[style*="overflow: auto"]'
    ];

    let best = null;
    for (const s of sels) {
      const els = document.querySelectorAll(s);
      for (const el of els) {
        if (el.scrollHeight > el.clientHeight * 1.2
            && el.clientHeight > 200
            && el.getClientRects().length > 0) {
          if (!best || el.scrollHeight > best.scrollHeight) best = el;
        }
      }
      if (best) break;
    }

    if (!best) {
      const minHeight = window.innerHeight * 0.5;
      const divs = document.querySelectorAll('div, main, section');
      const lim = Math.min(divs.length, 1000);
      for (let i = 0; i < lim; i++) {
        if (divs[i].clientHeight > minHeight
            && divs[i].scrollHeight > divs[i].clientHeight * 1.1) {
          try {
            const st = getComputedStyle(divs[i]);
            if (st.overflowY === 'auto' || st.overflowY === 'scroll' || st.overflowY === 'overlay') {
              if (!best || divs[i].clientHeight > best.clientHeight) best = divs[i];
            }
          } catch(e) {}
        }
      }
    }

    _cachedScrollTarget = best || document.documentElement;
    _cacheTimestamp = now;
    return _cachedScrollTarget;
  }

  function isDocumentScroller(target) {
    return target === document.documentElement
      || target === document.body
      || target === document.scrollingElement;
  }

  function scrollTargetByXY(target, left, top, smooth) {
    if (isDocumentScroller(target)) {
      window.scrollBy({ top: top, left: left, behavior: smooth ? 'smooth' : 'auto' });
    } else {
      target.scrollBy({ top: top, left: left, behavior: smooth ? 'smooth' : 'auto' });
    }
  }

  function scrollTargetBy(target, step, smooth) {
    scrollTargetByXY(target, 0, step, smooth);
  }

  function scrollTargetRight(target, step, smooth) {
    scrollTargetByXY(target, step, 0, smooth);
  }

  function scrollTargetInstant(target, step) {
    if (isDocumentScroller(target)) window.scrollBy(0, step);
    else target.scrollTop += step;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateScrollBy(target, distance, duration) {
    return new Promise(resolve => {
      const start = performance.now();
      let prev = 0;
      const tick = now => {
        if (!running || isPaused) return resolve(false);
        const t = clamp((now - start) / duration, 0, 1);
        const next = distance * easeOutCubic(t);
        scrollTargetInstant(target, next - prev);
        prev = next;
        if (t < 1) requestAnimationFrame(tick);
        else resolve(true);
      };
      requestAnimationFrame(tick);
    });
  }

  function findFacebookHomeLink() {
    const byLabel = [];
    for (const el of document.querySelectorAll('a[aria-label], [role="link"][aria-label]')) {
      const label = (el.getAttribute('aria-label') || '').toLowerCase().trim();
      if (HOME_LABELS.some(x => label === x || label.startsWith(x))) byLabel.push(el);
    }

    const byHref = [];
    for (const a of document.querySelectorAll('a[href]')) {
      try {
        const u = new URL(a.getAttribute('href'), window.location.href);
        if (!isFacebookHost(u.hostname)) continue;
        if (u.pathname === '/' || u.pathname === '/home.php') byHref.push(a);
      } catch(e) {}
    }

    const candidates = byLabel.concat(byHref)
      .filter((el, idx, arr) => arr.indexOf(el) === idx)
      .filter(isElementVisible)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.top - br.top) || (ar.left - br.left);
      });

    return candidates[0] || null;
  }

  function findFacebookReelsLink() {
    const byLabel = [];
    for (const el of document.querySelectorAll('a[aria-label], [role="link"][aria-label]')) {
      const label = (el.getAttribute('aria-label') || '').toLowerCase().trim();
      if (REELS_LABELS.some(x => label === x || label.includes(x))) byLabel.push(el);
    }

    const byHref = [];
    for (const a of document.querySelectorAll('a[href]')) {
      try {
        const u = new URL(a.getAttribute('href'), window.location.href);
        if (!isFacebookHost(u.hostname)) continue;
        if (u.pathname.startsWith('/reel') || u.pathname.startsWith('/reels')) byHref.push(a);
      } catch(e) {}
    }

    const candidates = byLabel.concat(byHref)
      .filter((el, idx, arr) => arr.indexOf(el) === idx)
      .filter(isElementVisible)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.top - br.top) || (ar.left - br.left);
      });

    return candidates[0] || null;
  }

  function findFacebookReelsRootLink() {
    const links = [];
    for (const a of document.querySelectorAll('a[href]')) {
      try {
        const u = new URL(a.getAttribute('href'), window.location.href);
        if (!isFacebookHost(u.hostname)) continue;
        const path = u.pathname.replace(/\/+$/, '');
        if (path === '/reel') links.push(a);
      } catch(e) {}
    }

    return links.filter(isElementVisible)[0] || links[0] || null;
  }

  function pushFacebookRoute(url) {
    try {
      const u = new URL(url, window.location.href);
      history.pushState(history.state || {}, '', u.pathname + u.search + u.hash);
      window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
      window.dispatchEvent(new Event('locationchange'));
      document.dispatchEvent(new Event('locationchange', { bubbles: true }));
      return true;
    } catch(e) {
      return false;
    }
  }

  async function openFacebookReelsRootInApp() {
    updateInfoText('🎬 Opening Facebook Reels root...');
    if ($('timer')) $('timer').textContent = '🎬';

    const rootLink = findFacebookReelsRootLink();
    const reelsLink = (rootLink && isElementVisible(rootLink)) ? rootLink : findFacebookReelsLink();
    if (reelsLink && isElementVisible(reelsLink)) {
      await simulateRealClick(reelsLink);
      await sleep(900);
      if (isReelsSurface()) {
        if (window.location.pathname.replace(/\/+$/, '') !== '/reel') {
          pushFacebookRoute(FACEBOOK_REELS_ROOT);
        }
        _cachedScrollTarget = null;
        activeSurface = 'reels';
        updateInfoText('🎬 Reels root ready');
        return true;
      }
    }

    pushFacebookRoute(FACEBOOK_REELS_ROOT);
    await sleep(900);
    _cachedScrollTarget = null;
    activeSurface = 'reels';
    updateInfoText('🎬 Reels root ready');
    return isReelsSurface();
  }

  async function openFacebookFeed(allowReload) {
    if (isFeedSurface()) {
      _cachedScrollTarget = null;
      activeSurface = 'feed';
      updateInfoText('🏠 Feed is already open');
      return true;
    }

    updateInfoText('🏠 Opening Facebook feed...');
    if ($('timer')) $('timer').textContent = '🏠';

    const link = findFacebookHomeLink();
    if (link) {
      await simulateRealClick(link);
      setTimeout(() => {
        if (!isFeedSurface() && document.contains(link)) {
          try { link.click(); } catch(e) {}
        }
      }, 900);
    } else {
      if (allowReload) window.location.href = window.location.origin + '/';
      else updateInfoText('⚠️ Feed link not found');
      return false;
    }

    const ok = await waitUntil(isFeedSurface, 12000, 300);
    if (ok) {
      _cachedScrollTarget = null;
      activeSurface = 'feed';
      updateInfoText('🏠 Feed ready');
      setTimeout(() => window.scrollBy({ top: randInt(10, 80), behavior: 'smooth' }), 500);
      return true;
    }

    updateInfoText('⚠️ Open Home manually, then start Feed');
    return false;
  }

  async function openFacebookReels(allowReload, forceRoot) {
    if (forceRoot) {
      return openFacebookReelsRootInApp();
    }

    if (isReelsSurface()) {
      _cachedScrollTarget = null;
      activeSurface = 'reels';
      updateInfoText('🎬 Reels is already open');
      return true;
    }

    updateInfoText('🎬 Opening Facebook Reels...');
    if ($('timer')) $('timer').textContent = '🎬';

    const link = findFacebookReelsLink();
    if (link) {
      await simulateRealClick(link);
      setTimeout(() => {
        if (!isReelsSurface() && document.contains(link)) {
          try { link.click(); } catch(e) {}
        }
      }, 900);
    } else {
      if (allowReload) window.location.href = FACEBOOK_REELS_ROOT;
      else updateInfoText('⚠️ Reels link not found');
      return false;
    }

    const ok = await waitUntil(isReelsSurface, 12000, 300);
    if (ok) {
      _cachedScrollTarget = null;
      activeSurface = 'reels';
      updateInfoText('🎬 Reels ready');
      return true;
    }

    updateInfoText('⚠️ Open Reels manually, then start Reels');
    return false;
  }

  function getFeedScrollTarget() {
    const docScroller = document.scrollingElement || document.documentElement;
    if (docScroller && docScroller.scrollHeight > window.innerHeight * 1.15)
      return docScroller;

    const main = document.querySelector('[role="main"]');
    const pool = [];
    if (main) pool.push(...main.querySelectorAll('div, main, section'));
    pool.push(...document.querySelectorAll('[data-pagelet*="Feed"] div, div[style*="overflow-y"]'));

    let best = null;
    for (const el of pool) {
      if (!isElementVisible(el)) continue;
      if (el.clientHeight < window.innerHeight * 0.45) continue;
      if (el.scrollHeight < el.clientHeight * 1.12) continue;
      try {
        const st = getComputedStyle(el);
        if (!/(auto|scroll|overlay)/.test(st.overflowY)) continue;
      } catch(e) {}
      if (!best || el.clientHeight > best.clientHeight) best = el;
    }

    return best || docScroller || document.documentElement;
  }

  function getReelsHorizontalTarget() {
    const docScroller = document.scrollingElement || document.documentElement;
    let best = null;
    const pool = [];
    const reelsRoot = document.querySelector('[data-pagelet="Reels"], [role="main"]');

    if (reelsRoot) pool.push(...reelsRoot.querySelectorAll('div, main, section'));
    pool.push(...document.querySelectorAll('div[style*="overflow"], main, section'));

    for (const el of pool) {
      if (!isElementVisible(el)) continue;
      if (el.clientWidth < window.innerWidth * 0.35) continue;
      if (el.scrollWidth < el.clientWidth * 1.12) continue;
      if (!best || el.scrollWidth > best.scrollWidth) best = el;
    }

    return best || docScroller || document.documentElement;
  }

  const FEED_DISTANCE_MULTIPLIER = 2.6;

  const FEED_RHYTHMS = [
    { key:'skim', label:'🌿 Skimming', weight:38, minMs:3500, maxMs:9000, minStep:0.36, maxStep:0.68, minParts:1, maxParts:2 },
    { key:'read', label:'📖 Reading', weight:44, minMs:8000, maxMs:18000, minStep:0.42, maxStep:0.86, minParts:2, maxParts:4 },
    { key:'linger', label:'👀 Linger', weight:18, minMs:15000, maxMs:32000, minStep:0.22, maxStep:0.55, minParts:1, maxParts:3 }
  ];

  function pickWeighted(items) {
    let total = items.reduce((sum, x) => sum + x.weight, 0);
    let roll = Math.random() * total;
    for (const item of items) {
      roll -= item.weight;
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  }

  function resetFeedRhythm() {
    feedRhythm = null;
    feedRhythmLeft = 0;
    feedLongPauseIn = randInt(6, 12);
  }

  function getFeedRhythm() {
    if (!feedRhythm || feedRhythmLeft <= 0) {
      feedRhythm = pickWeighted(FEED_RHYTHMS);
      feedRhythmLeft = randInt(3, 7);
    }
    feedRhythmLeft--;
    return feedRhythm;
  }

  function getFeedDelayMs() {
    const rhythm = getFeedRhythm();
    let ms = gaussRand(rhythm.minMs, rhythm.maxMs);

    feedLongPauseIn--;
    if (feedLongPauseIn <= 0) {
      ms += randInt(9000, 24000);
      feedLongPauseIn = randInt(7, 14);
      if ($('wave')) $('wave').textContent = rhythm.label + ' + pause';
    } else if ($('wave')) {
      $('wave').textContent = rhythm.label;
    }

    return clamp(ms, 2800, 45000);
  }

  async function naturalFeedScroll(target) {
    const rhythm = feedRhythm || getFeedRhythm();
    const viewport = Math.max(window.innerHeight || 700, target.clientHeight || 700);
    const total = Math.round(viewport * randFloat(rhythm.minStep, rhythm.maxStep) * FEED_DISTANCE_MULTIPLIER) + randInt(-60, 140);
    const parts = randInt(rhythm.minParts, rhythm.maxParts);
    let remaining = total;

    for (let i = 0; i < parts; i++) {
      const left = parts - i;
      const share = i === parts - 1 ? 1 : randFloat(0.35, 0.72);
      const step = Math.round(left === 1 ? remaining : remaining * share / left);
      remaining -= step;

      await animateScrollBy(target, step, randInt(420, 1250));
      if (!running || isPaused) return;

      if (i < parts - 1) await sleep(randInt(120, 650));

      if (Math.random() < 0.16) {
        await sleep(randInt(90, 280));
        await animateScrollBy(target, -randInt(16, 58), randInt(180, 420));
      }
    }
  }

  const REELS_NEXT_LABELS = [
    'next','right','далее','след','следующее','впер','вправо',
    'siguiente','suivant','weiter','avanti','próximo','proximo',
    '次へ','下一','다음'
  ];

  const REELS_NEXT_REJECT = [
    'like','comment','share','gift','follow','create','menu','messenger',
    'notification','search','close','pause','play','mute','audio','see more',
    'нравится','коммент','поделиться','подар','подпис','созд','меню',
    'уведом','поиск','закрыть','пауза','звук','ещё','еще'
  ];

  function getButtonText(el) {
    return [
      el.getAttribute('aria-label') || '',
      el.getAttribute('title') || '',
      el.textContent || ''
    ].join(' ').toLowerCase().trim();
  }

  function normalizeSvgPath(d) {
    return (d || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function compactSvgPath(d) {
    return (d || '').replace(/[,\s]+/g, '').trim().toLowerCase();
  }

  function hasReelsNextArrowPath(svg) {
    const wanted = normalizeSvgPath(REELS_NEXT_ARROW_PATH);
    const compactWanted = compactSvgPath(REELS_NEXT_ARROW_PATH);
    for (const path of svg.querySelectorAll('path[d]')) {
      const d = path.getAttribute('d');
      if (normalizeSvgPath(d) === wanted || compactSvgPath(d) === compactWanted) return true;
    }
    return false;
  }

  function getClickableFromSvg(svg) {
    const clickable = svg.closest('button, [role="button"], a, [tabindex="0"]');
    if (clickable) return clickable;

    let el = svg.parentElement;
    for (let i = 0; el && i < 4; i++, el = el.parentElement) {
      const r = el.getBoundingClientRect();
      if (r.width >= 36 && r.height >= 36 && r.width <= 180 && r.height <= 180) return el;
    }
    return svg;
  }

  function findReelsNextArrowBySvg() {
    const candidates = [];
    for (const svg of document.querySelectorAll('svg[viewBox="0 0 24 24"], svg[viewbox="0 0 24 24"]')) {
      if (!hasReelsNextArrowPath(svg) || !isElementVisible(svg)) continue;

      const r = svg.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < window.innerWidth * 0.5 || cx > window.innerWidth * 0.94) continue;
      if (cy < window.innerHeight * 0.15 || cy > window.innerHeight * 0.78) continue;

      candidates.push({ el: getClickableFromSvg(svg), score:
        Math.abs(cx - window.innerWidth * 0.76) + Math.abs(cy - window.innerHeight * 0.48)
      });
    }

    candidates.sort((a, b) => a.score - b.score);
    return candidates[0] ? candidates[0].el : null;
  }

  function isReelsNextButtonCandidate(el, allowUnlabeled) {
    if (!isElementVisible(el)) return false;

    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const text = getButtonText(el);

    if (r.width < 28 || r.height < 28) return false;
    if (r.width > 180 || r.height > 180) return false;
    if (cx < window.innerWidth * 0.52 || cx > window.innerWidth * 0.92) return false;
    if (cy < window.innerHeight * 0.18 || cy > window.innerHeight * 0.72) return false;
    if (REELS_NEXT_REJECT.some(x => text.includes(x))) return false;
    if (REELS_NEXT_LABELS.some(x => text.includes(x))) return true;

    if (!allowUnlabeled) return false;

    const compact = r.width <= 130 && r.height <= 130 && Math.abs(r.width - r.height) <= 45;
    const quietText = text.length <= 2 || !/[a-zа-яё]{3,}/i.test(text);
    return compact && quietText && !!el.querySelector('svg, i, img');
  }

  function findReelsNextButton() {
    const svgButton = findReelsNextArrowBySvg();
    if (svgButton) return svgButton;

    const selector = 'button, [role="button"], [aria-label], [tabindex="0"]';
    const controls = Array.from(document.querySelectorAll(selector));
    const labelled = controls
      .filter(el => isReelsNextButtonCandidate(el, false))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (br.left - ar.left) || (Math.abs(ar.top - window.innerHeight * 0.5) - Math.abs(br.top - window.innerHeight * 0.5));
      });

    if (labelled[0]) return labelled[0];

    const x = window.innerWidth * 0.82;
    const y = window.innerHeight * 0.5;
    const pointed = document.elementFromPoint(x, y);
    const pointedButton = pointed && pointed.closest(selector);
    if (pointedButton && isReelsNextButtonCandidate(pointedButton, true)) return pointedButton;

    return controls
      .filter(el => isReelsNextButtonCandidate(el, true))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const as = Math.abs((ar.left + ar.width / 2) - x) + Math.abs((ar.top + ar.height / 2) - y);
        const bs = Math.abs((br.left + br.width / 2) - x) + Math.abs((br.top + br.height / 2) - y);
        return as - bs;
      })[0] || null;
  }

  function clickAtPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return false;

    const base = {
      view: window, bubbles: true, cancelable: true,
      clientX: x, clientY: y, button: 0, buttons: 1
    };
    const pointerBase = {
      ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true
    };

    try {
      const PEvent = window.PointerEvent || MouseEvent;
      el.dispatchEvent(new MouseEvent('mousemove', base));
      el.dispatchEvent(new PEvent('pointerdown', pointerBase));
      el.dispatchEvent(new MouseEvent('mousedown', base));
      el.dispatchEvent(new PEvent('pointerup', { ...pointerBase, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }));
      return true;
    } catch(e) {
      try { if (typeof el.click === 'function') el.click(); return true; }
      catch(e2) { return false; }
    }
  }

  async function reelsRightScroll(target, smooth) {
    const nextButton = findReelsNextButton();
    if (nextButton) {
      await simulateRealClick(nextButton);
      await sleep(randInt(250, 700));
      return;
    }

    const distance = Math.round(window.innerWidth * randFloat(0.78, 1.08));
    clickAtPoint(window.innerWidth * 0.76, window.innerHeight * 0.48);
    await sleep(randInt(180, 380));

    scrollTargetRight(target, distance, smooth);

    const wheel = new WheelEvent('wheel', {
      bubbles: true, cancelable: true, deltaMode: 0,
      deltaX: distance, deltaY: randInt(-18, 18),
      clientX: window.innerWidth * 0.78,
      clientY: window.innerHeight * 0.5
    });
    target.dispatchEvent(wheel);
    document.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true, deltaMode: 0,
      deltaX: distance, deltaY: randInt(-18, 18),
      clientX: window.innerWidth * 0.78,
      clientY: window.innerHeight * 0.5
    }));

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39,
      bubbles: true, cancelable: true
    }));
    await sleep(randInt(250, 650));
    document.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39,
      bubbles: true, cancelable: true
    }));
  }

  async function doScroll() {
    const mode = getActiveSurface();
    const target = mode === 'feed' ? getFeedScrollTarget() : getReelsHorizontalTarget();
    const smooth = $('smooth').checked;

    if (mode === 'feed') {
      await naturalFeedScroll(target);
    } else {
      await reelsRightScroll(target, smooth);
    }

    if (!running || isPaused) return;

    stats.scrolls++;
    if (mode === 'feed') stats.feedScrolls++;
    else stats.reelsScrolls++;
    if (getMode() === 'both') surfaceScrolls++;
    updateStatsUI();
  }

  async function maybeSwitchSurface() {
    if (getMode() !== 'both' || isPaused) return false;
    if (surfaceScrolls < switchAfter) return false;

    const current = activeSurface;
    const next = current === 'feed' ? 'reels' : 'feed';
    updateInfoText('🔁 Switching to ' + (next === 'feed' ? 'Feed' : 'Reels') + '...');
    if ($('timer')) $('timer').textContent = '🔁';

    const ok = next === 'feed'
      ? await openFacebookFeed(false)
      : await openFacebookReels(false);

    resetSurfaceSwitchCounter();
    if (!ok) {
      activeSurface = current;
      updateInfoText('⚠️ Could not switch, keeping ' + (current === 'feed' ? 'Feed' : 'Reels'));
      return false;
    }

    stats.switches++;
    updateStatsUI();
    return true;
  }

  async function finishScrollCycle(minDelay, maxDelay) {
    if (!running || isPaused) return;
    const switched = await maybeSwitchSurface();
    if (!running || isPaused) return;
    if (TM.nextCycle) clearTimeout(TM.nextCycle);
    TM.nextCycle = setTimeout(() => {
      TM.nextCycle = null;
      startNextCycle();
    }, switched ? randInt(900, 1800) : randInt(minDelay, maxDelay));
  }

  // ══════════════════════════════════════
  //  BLOCK DETECTOR (hardened, no false positives)
  // ══════════════════════════════════════
  function startBlockDetector() {
    TM.block = setInterval(() => {
      if (!running) return;

      const path = window.location.pathname.toLowerCase();
      if (path.includes('/checkpoint/') || path.includes('/checkpoint?')) {
        emergencyStop('🚨 CHECKPOINT PAGE!');
        return;
      }

      const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
      for (const dlg of dialogs) {
        const rect = dlg.getBoundingClientRect();
        if (rect.height < 100 || rect.width < 100) continue;
        if (rect.top > window.innerHeight || rect.bottom < 0) continue;

        const text = (dlg.textContent || '').toLowerCase();
        let score = 0;
        for (const phrase of BLOCK_PHRASES) {
          if (text.includes(phrase)) score += 2;
        }

        if (score >= 4 ||
            text.includes('video selfie') ||
            text.includes('видеоселфи') ||
            text.includes('temporarily blocked') ||
            text.includes('временно заблокирован')) {
          emergencyStop('🚨 BLOCKED! (score:' + score + ')');
          return;
        }
      }
    }, 5000);
  }

  function emergencyStop(reason) {
    running = false;
    isPaused = false;
    clearAllTimers();

    const panel = document.getElementById('__neutralAutoScrollUI__');
    if (panel) {
      panel.style.borderColor = '#ff0000';
      panel.style.boxShadow = '0 0 20px rgba(255,0,0,0.5)';
    }
    const tb = $('toggle');
    if (tb) { tb.textContent = '🔥 START FIRE'; tb.style.background = '#264653'; tb.style.boxShadow = '0 4px 0 #1a323c'; }
    if ($('timer')) $('timer').textContent = '⛔';
    if ($('action')) $('action').innerHTML = '<span style="color:red;font-weight:900;">' + reason + '</span>';
    if ($('wave')) $('wave').textContent = '';

    try {
      if (Notification.permission === 'granted')
        new Notification('🐶 THIS IS FINE — Stop', { body: reason });
    } catch(e){}
  }

  // ══════════════════════════════════════
  //  MOUSE SIMULATION
  // ══════════════════════════════════════
  function startMouseSimulation() {
    TM.mouse = setInterval(() => {
      if (!running || isPaused) return;
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: randInt(100, window.innerWidth - 100),
        clientY: randInt(100, window.innerHeight - 100),
        bubbles: true
      }));
    }, randInt(3000, 8000));
  }

  // ══════════════════════════════════════
  //  BREAKS
  // ══════════════════════════════════════
  function scheduleBreak() {
    if (!running) return;
    const bMin = randInt(
      parseInt($('breakMinMin').value) || 15,
      parseInt($('breakMinMax').value) || 35
    );
    const bSec = randInt(
      parseInt($('breakSecMin').value) || 120,
      parseInt($('breakSecMax').value) || 420
    );

    TM.breakT = setTimeout(() => {
      if (!running) return;
      isPaused = true;
      stats.breaks++;
      clearInterval(TM.countdown);
      TM.countdown = null;

      const panel = document.getElementById('__neutralAutoScrollUI__');
      if (panel) panel.style.borderColor = '#2a9d8f';

      let left = bSec;
      if ($('timer')) $('timer').textContent = '☕';
      updateBreakDisplay(left);

      TM.breakCD = setInterval(() => {
        left--;
        if (!running || left <= 0) {
          clearInterval(TM.breakCD);
          TM.breakCD = null;
          if (running) {
            isPaused = false;
            if (panel) panel.style.borderColor = '#e76f51';
            updateInfoText('▶️ Back from break!');
            scheduleBreak();
            startNextCycle();
          }
        } else {
          updateBreakDisplay(left);
        }
      }, 1000);
    }, bMin * 60 * 1000);
  }

  function updateBreakDisplay(left) {
    const m = Math.floor(left / 60);
    const s = left % 60;
    const str = m + ':' + (s < 10 ? '0' : '') + s;
    if ($('timer')) $('timer').textContent = str;
    updateInfoText('☕ Break — ' + str + ' left');
  }

  // ══════════════════════════════════════
  //  SESSION LIMIT
  // ══════════════════════════════════════
  function startSessionLimit() {
    const maxMin = parseInt($('sessionMax').value) || 120;
    TM.session = setTimeout(() => {
      if (running) emergencyStop('⏰ Session limit (' + maxMin + 'm)');
    }, maxMin * 60 * 1000);
  }

  // ══════════════════════════════════════
  //  WAVE SPEED
  // ══════════════════════════════════════
  function getWaveMultiplier() {
    if (++waveCounter >= randInt(8, 15)) {
      waveCounter = 0;
      wavePhase = ['normal','normal','fast','slow','slow'][randInt(0,4)];
    }
    const icons = { fast: '🐇 Fast', slow: '🐢 Slow', normal: '🚶 Normal' };
    if ($('wave')) $('wave').textContent = icons[wavePhase] || '';
    return wavePhase === 'fast' ? 0.7 : (wavePhase === 'slow' ? 1.6 : 1.0);
  }

  // ══════════════════════════════════════
  //  NIGHT MODE
  // ══════════════════════════════════════
  let _nightStart = 2, _nightEnd = 6;
  function cacheNightSettings() {
    _nightStart = parseInt($('nightStart').value) || 2;
    _nightEnd = parseInt($('nightEnd').value) || 6;
  }
  function isNightTime() {
    const h = new Date().getHours();
    if (_nightStart <= _nightEnd) return h >= _nightStart && h < _nightEnd;
    return h >= _nightStart || h < _nightEnd;
  }

  // ══════════════════════════════════════
  //  CLICK SIMULATION
  // ══════════════════════════════════════
  function simulateRealClick(element) {
    return new Promise(resolve => {
      const r = element.getBoundingClientRect();
      const x = r.left + r.width * (0.35 + Math.random() * 0.3);
      const y = r.top + r.height * (0.35 + Math.random() * 0.3);
      const c = {
        view: window, bubbles: true, cancelable: true,
        clientX: x, clientY: y,
        screenX: x + window.screenX, screenY: y + window.screenY
      };

      document.dispatchEvent(new MouseEvent('mousemove', {
        ...c, clientX: x + randInt(-30, 30), clientY: y + randInt(-30, 30)
      }));

      setTimeout(() => {
        element.dispatchEvent(new PointerEvent('pointerover', {
          ...c, pointerId: 1, pointerType: 'mouse', isPrimary: true
        }));
        element.dispatchEvent(new PointerEvent('pointerenter', {
          ...c, pointerId: 1, pointerType: 'mouse', isPrimary: true
        }));
        element.dispatchEvent(new PointerEvent('pointerdown', {
          ...c, button: 0, buttons: 1, pointerId: 1,
          pointerType: 'mouse', isPrimary: true
        }));

        setTimeout(() => {
          element.dispatchEvent(new PointerEvent('pointerup', {
            ...c, button: 0, buttons: 0, pointerId: 1,
            pointerType: 'mouse', isPrimary: true
          }));
          element.dispatchEvent(new MouseEvent('mousedown', { ...c, button: 0, buttons: 1 }));
          element.dispatchEvent(new MouseEvent('mouseup', { ...c, button: 0, buttons: 0 }));
          element.dispatchEvent(new MouseEvent('click', { ...c, button: 0, buttons: 0 }));
          resolve();
        }, randInt(50, 160));
      }, randInt(80, 250));
    });
  }

  // ══════════════════════════════════════
  //  LIKE DETECTION
  // ══════════════════════════════════════
  function isAlreadyLiked(btn) {
    if (btn.getAttribute('aria-pressed') === 'true') return true;

    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
    if (label.includes('unlike') || label.includes('remove')
        || label.includes('убрать') || label.includes('bỏ thích')) return true;

    const svg = btn.querySelector('svg');
    if (svg) {
      for (const p of svg.querySelectorAll('path, circle')) {
        const fill = (p.getAttribute('fill') || '').toLowerCase();
        if (fill.match(/#(0866ff|1877f2|1b74e4|e4405f|ed4956|f02849|fe0234)/))
          return true;
      }
    }

    try {
      const color = getComputedStyle(btn).color;
      if (color === 'rgb(8, 102, 255)' || color === 'rgb(24, 119, 242)')
        return true;
    } catch(e){}

    return false;
  }

  function findLikeButton() {
    const vH = window.innerHeight;
    const margin = vH * 0.05;

    for (const btn of document.querySelectorAll('[role="button"][aria-label], [aria-label][tabindex]')) {
      const r = btn.getBoundingClientRect();
      if (r.height <= 0 || r.width <= 0 || r.top < margin || r.top > (vH - margin)) continue;

      const label = (btn.getAttribute('aria-label') || '').toLowerCase().trim();
      if (!LIKE_LABELS.some(l => label === l || label.startsWith(l))) continue;

      // Visibility check
      try {
        const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (topEl && !btn.contains(topEl) && topEl.closest('[role="button"]') !== btn) continue;
      } catch(e){}

      if (isAlreadyLiked(btn)) { stats.alreadyLiked++; continue; }
      return btn;
    }
    return null;
  }

  // ══════════════════════════════════════
  //  MAIN CYCLE
  // ══════════════════════════════════════
  function startNextCycle() {
    if (!running || isPaused) return;

    if ($('nightMode').checked && isNightTime()) {
      if ($('timer')) $('timer').textContent = '🌙';
      updateInfoText('🌙 Night mode — waiting...');
      if ($('wave')) $('wave').textContent = '💤 Sleeping';
      if (TM.nextCycle) clearTimeout(TM.nextCycle);
      TM.nextCycle = setTimeout(() => {
        TM.nextCycle = null;
        if (running) startNextCycle();
      }, 60000);
      return;
    }

    const maxScrolls = parseInt($('maxScrolls').value) || 0;
    if (maxScrolls > 0 && stats.scrolls >= maxScrolls) {
      emergencyStop('📊 Scroll limit (' + maxScrolls + ')');
      return;
    }

    const surface = getActiveSurface();
    let sec = 0;

    if (surface === 'feed') {
      sec = Math.ceil(getFeedDelayMs() / 1000);
    } else {
      let minS = clamp(parseInt($('minS').value) || 8, 3, 600);
      let maxS = clamp(parseInt($('maxS').value) || 25, 3, 600);
      if (minS > maxS) { let t = minS; minS = maxS; maxS = t; }

      const waveMul = getWaveMultiplier();
      sec = clamp(Math.round(gaussRand(minS, maxS) * waveMul), minS, maxS * 2);
    }

    let chMin = clamp(parseInt($('chanceMin').value) || 40, 2, 1000);
    let chMax = clamp(parseInt($('chanceMax').value) || 80, 2, 1000);
    if (chMin > chMax) { let t = chMin; chMin = chMax; chMax = t; }
    const oneIn = randInt(chMin, chMax);
    const willLike = surface === 'reels' && Math.random() < (1 / oneIn);

    updateStatusUI(sec, willLike, oneIn);

    let expected = Date.now() + 1000;
    TM.countdown = setInterval(() => {
      const drift = Date.now() - expected;
      if (drift > 2000) sec = Math.max(0, sec - Math.floor(drift / 1000));
      expected += 1000;

      if (--sec <= 0) {
        clearInterval(TM.countdown);
        TM.countdown = null;
        performActionAndScroll(willLike);
      } else {
        updateStatusUI(sec, willLike, oneIn);
      }
    }, 1000);
  }

  async function performActionAndScroll(shouldLike) {
    if (!running || isPaused) return;

    if (shouldLike) {
      updateInfoText('👀 Watching reel...');

      setTimeout(async () => {
        if (!running) return;
        const btn = findLikeButton();

        if (btn) {
          await simulateRealClick(btn);
          stats.likes++;

          const prev = btn.style.outline;
          btn.style.outline = '3px solid #e25822';
          setTimeout(() => btn.style.outline = prev, 1200);

          updateInfoText('❤️ LIKED! Waiting...');

          // Verify
          setTimeout(() => {
            if (document.contains(btn)) {
              const ok = btn.getAttribute('aria-pressed') === 'true';
              console.log('🐶 Like verify:', ok ? '✅' : '❓');
            }
          }, 800);

          setTimeout(async () => {
            if (!running) return;
            await doScroll();
            finishScrollCycle(300, 800);
          }, randInt(1000, 3000));

        } else {
          stats.likeFails++;
          updateInfoText('⏭️ Skip (liked or hidden)');
          await doScroll();
          finishScrollCycle(300, 700);
        }
      }, randInt(2000, 5000));

    } else {
      // Micro-pause before scroll (human-like)
      setTimeout(async () => {
        await doScroll();
        finishScrollCycle(200, 700);
      }, randInt(100, 400));
    }
    updateStatsUI();
  }

  // ══════════════════════════════════════
  //  UI UPDATES
  // ══════════════════════════════════════
  function updateStatusUI(sec, willLike, chance) {
    const panel = document.getElementById('__neutralAutoScrollUI__');
    const surface = getActiveSurface();
    if ($('timer')) $('timer').textContent = (surface === 'feed' ? '~' : '') + sec + 's';

    if ($('action')) {
      if (willLike) {
        $('action').innerHTML = 'Next: <span style="color:#d90429;font-weight:900;text-shadow:1px 1px 0 #fff;">🔥 LIKE!</span>';
        if (panel) panel.style.borderColor = '#d90429';
      } else {
        const text = surface === 'feed' ? 'Feed scroll 🌿' : 'Reels next ➡️';
        $('action').innerHTML = 'Next: <span style="color:#264653;">' + text + '</span>';
        if (panel) panel.style.borderColor = '#e76f51';
      }
    }

    if ($('chanceInfo')) {
      if (getMode() === 'both') {
        $('chanceInfo').textContent = '(Both: ' + getSurfaceLabel() + ' ' +
          surfaceScrolls + '/' + switchAfter +
          (surface === 'feed' ? ', auto rhythm)' : ')');
      } else {
        $('chanceInfo').textContent = surface === 'feed'
          ? '(Feed mode: auto rhythm, likes off)'
          : (willLike ? '(1/' + chance + ' HIT 🎯)' : '(1/' + chance + ' miss)');
      }
    }
  }

  function updateInfoText(text) {
    if ($('action')) $('action').textContent = text;
  }

  function updateModeSpecificUI() {
    const mode = getMode();
    const feedOnly = mode === 'feed';

    if ($('delayTitle')) {
      $('delayTitle').textContent = feedOnly ? '🌿 FEED RHYTHM' : '🎬 REELS DELAY (sec)';
    }
    if ($('delayInputs')) {
      $('delayInputs').style.display = feedOnly ? 'none' : 'flex';
    }
    if ($('delayHint')) {
      $('delayHint').textContent = feedOnly
        ? 'Auto reading rhythm'
        : (mode === 'both' ? 'Reels only; Feed is auto' : 'Used for Reels');
    }
  }

  function updateStatsUI() {
    const el = $('stats');
    if (!el || !stats.startTime) return;
    const mins = Math.floor((Date.now() - stats.startTime) / 60000);
    const pct = stats.scrolls > 0
      ? ((stats.likes / stats.scrolls) * 100).toFixed(1) : '0.0';
    if (getMode() === 'both') {
      el.innerHTML =
        '📊 <b>' + stats.scrolls + '</b> total · ' +
        '🏠' + stats.feedScrolls + ' · 🎬' + stats.reelsScrolls +
        ' · 🔁' + stats.switches + ' · ' + mins + 'm';
      return;
    }
    if (getActiveSurface() === 'feed') {
      el.innerHTML =
        '📊 <b>' + stats.scrolls + '</b> feed scrolls · ' +
        '☕' + stats.breaks + ' · ' + mins + 'm';
      return;
    }
    el.innerHTML =
      '📊 <b>' + stats.scrolls + '</b> scrolls · ' +
      '<b style="color:#d90429">' + stats.likes + '</b> likes · ' +
      'skip:' + stats.alreadyLiked + ' · ☕' + stats.breaks +
      ' · ' + mins + 'm · ' + pct + '%';
  }

  // ══════════════════════════════════════
  //  BUILD UI
  // ══════════════════════════════════════
  const ui = document.createElement('div');
  ui.id = '__neutralAutoScrollUI__';
  ui.style.cssText =
    'position:fixed;right:20px;bottom:30px;z-index:99999;' +
    'width:300px;padding:0;background:#f4a261;color:#264653;' +
    'border:4px solid #e76f51;border-radius:15px;' +
    "font-family:'Comic Sans MS','Chalkboard SE','Segoe UI',sans-serif;" +
    'box-shadow:6px 6px 0px #264653;overflow:hidden;user-select:none;' +
    'transition:border-color .3s,box-shadow .3s;';

  const INP = 'width:35px;text-align:center;border:2px solid #264653;' +
    'border-radius:4px;padding:1px;background:#fff;font-size:12px;';
  const CELL = 'background:rgba(255,255,255,.3);padding:6px;' +
    'border-radius:8px;text-align:center;';
  const LBL = 'font-size:8px;font-weight:bold;margin-bottom:3px;';

  ui.innerHTML =
    '<div id="' + P + 'header" style="background:#e76f51;padding:8px 14px;display:flex;justify-content:space-between;align-items:center;color:white;cursor:grab;">' +
      '<div style="font-weight:bold;display:flex;align-items:center;gap:5px;">' +
        '<span style="font-size:16px;">🐶</span>' +
        '<span style="font-size:13px;">THIS IS FINE</span>' +
        '<span style="font-size:9px;opacity:.7;background:rgba(0,0,0,.2);padding:1px 5px;border-radius:8px;">v4.8</span>' +
      '</div>' +
      '<div id="' + P + 'close" style="cursor:pointer;font-weight:bold;font-size:16px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:background .2s;">✕</div>' +
    '</div>' +

    '<div style="padding:12px;font-size:12px;">' +

      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
        '<div>' +
          '<div style="font-size:10px;font-weight:bold;text-transform:uppercase;">Next scroll in:</div>' +
          '<div id="' + P + 'wave" style="font-size:9px;opacity:.7;margin-top:2px;"></div>' +
        '</div>' +
        '<div id="' + P + 'timer" style="font-size:28px;font-weight:900;color:#fff;text-shadow:2px 2px 0 #000;min-width:55px;text-align:right;">--</div>' +
      '</div>' +

      '<div style="background:rgba(255,255,255,.45);padding:8px;border-radius:10px;margin-bottom:10px;text-align:center;">' +
        '<div id="' + P + 'action" style="font-weight:bold;font-size:12px;">Stopped ☕️</div>' +
        '<div id="' + P + 'chanceInfo" style="font-size:9px;opacity:.6;margin-top:2px;">—</div>' +
      '</div>' +

      '<div id="' + P + 'stats" style="font-size:9px;text-align:center;opacity:.75;margin-bottom:10px;min-height:12px;">📊 Ready</div>' +

      '<div style="display:flex;gap:6px;margin-bottom:8px;">' +
        '<div style="flex:1;' + CELL + '"><div style="' + LBL + '">🎛️ MODE</div><select id="' + P + 'mode" style="width:100%;border:2px solid #264653;border-radius:4px;background:#fff;font-size:11px;padding:2px;font-family:inherit;"><option value="reels">🎬 Reels</option><option value="feed">🏠 Feed</option><option value="both">🔁 Both</option></select></div>' +
        '<button id="' + P + 'openReels" style="width:70px;background:#e76f51;color:#fff;border:2px solid #264653;border-radius:8px;font-weight:bold;font-size:10px;cursor:pointer;font-family:inherit;box-shadow:0 3px 0 #c4492d;">🎬 REELS</button>' +
        '<button id="' + P + 'openFeed" style="width:66px;background:#2a9d8f;color:#fff;border:2px solid #264653;border-radius:8px;font-weight:bold;font-size:10px;cursor:pointer;font-family:inherit;box-shadow:0 3px 0 #1b6b61;">🏠 FEED</button>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">' +
        '<div id="' + P + 'delayCard" style="' + CELL + '"><div id="' + P + 'delayTitle" style="' + LBL + '">🎬 REELS DELAY (sec)</div><div id="' + P + 'delayInputs" style="display:flex;gap:3px;justify-content:center;"><input id="' + P + 'minS" type="number" value="8" min="3" max="600" style="' + INP + '"><span style="align-self:center;font-size:10px;">—</span><input id="' + P + 'maxS" type="number" value="25" min="3" max="600" style="' + INP + '"></div><div id="' + P + 'delayHint" style="font-size:7px;opacity:.55;margin-top:2px;">Used for Reels</div></div>' +
        '<div style="' + CELL + '"><div style="' + LBL + '">❤️ LIKE 1/N</div><div style="display:flex;gap:3px;justify-content:center;"><input id="' + P + 'chanceMin" type="number" value="40" min="2" max="1000" style="' + INP + '"><span style="align-self:center;font-size:10px;">—</span><input id="' + P + 'chanceMax" type="number" value="80" min="2" max="1000" style="' + INP + '"></div></div>' +
        '<div style="' + CELL + '"><div style="' + LBL + '">☕ BREAK every (min)</div><div style="display:flex;gap:3px;justify-content:center;"><input id="' + P + 'breakMinMin" type="number" value="15" min="5" max="120" style="' + INP + '"><span style="align-self:center;font-size:10px;">—</span><input id="' + P + 'breakMinMax" type="number" value="35" min="5" max="120" style="' + INP + '"></div></div>' +
        '<div style="' + CELL + '"><div style="' + LBL + '">☕ BREAK dur (sec)</div><div style="display:flex;gap:3px;justify-content:center;"><input id="' + P + 'breakSecMin" type="number" value="120" min="30" max="1200" style="' + INP + '"><span style="align-self:center;font-size:10px;">—</span><input id="' + P + 'breakSecMax" type="number" value="420" min="30" max="1200" style="' + INP + '"></div></div>' +
      '</div>' +

      '<div style="display:flex;gap:6px;margin-bottom:8px;">' +
        '<div style="flex:1;' + CELL + '"><div style="font-size:8px;font-weight:bold;">⏰ MAX min</div><input id="' + P + 'sessionMax" type="number" value="120" min="10" max="600" style="width:45px;text-align:center;border:2px solid #264653;border-radius:4px;padding:1px;background:#fff;font-size:12px;margin-top:2px;"></div>' +
        '<div style="flex:1;' + CELL + '"><div style="font-size:8px;font-weight:bold;">📊 MAX scrolls</div><input id="' + P + 'maxScrolls" type="number" value="0" min="0" max="9999" style="width:45px;text-align:center;border:2px solid #264653;border-radius:4px;padding:1px;background:#fff;font-size:12px;margin-top:2px;"><div style="font-size:7px;opacity:.5;">0 = no limit</div></div>' +
        '<div style="flex:1;' + CELL + '"><div style="font-size:8px;font-weight:bold;">🌙 Night off</div><div style="display:flex;gap:2px;justify-content:center;margin-top:2px;"><input id="' + P + 'nightStart" type="number" value="2" min="0" max="23" style="width:24px;text-align:center;border:1px solid #264653;border-radius:3px;background:#fff;font-size:11px;"><span style="font-size:9px;align-self:center;">-</span><input id="' + P + 'nightEnd" type="number" value="6" min="0" max="23" style="width:24px;text-align:center;border:1px solid #264653;border-radius:3px;background:#fff;font-size:11px;"></div></div>' +
      '</div>' +

      '<div style="display:flex;gap:10px;justify-content:center;margin-bottom:12px;font-size:11px;">' +
        '<label style="cursor:pointer;font-weight:bold;"><input id="' + P + 'smooth" type="checkbox" checked style="accent-color:#e76f51;"> Smooth</label>' +
        '<label style="cursor:pointer;font-weight:bold;"><input id="' + P + 'nightMode" type="checkbox" checked style="accent-color:#e76f51;"> 🌙 Night</label>' +
        '<button id="' + P + 'reset" style="font-size:9px;padding:2px 6px;background:#264653;color:#fff;border:none;border-radius:4px;cursor:pointer;opacity:.7;">↺ Reset</button>' +
      '</div>' +

      '<button id="' + P + 'toggle" style="width:100%;padding:10px;background:#264653;border:none;border-radius:10px;color:white;font-weight:bold;cursor:pointer;font-size:13px;box-shadow:0 4px 0 #1a323c;transition:transform .1s;font-family:inherit;">🔥 START FIRE</button>' +
    '</div>' +

    '<div style="background:#2a9d8f;height:6px;width:100%;"></div>';

  document.body.appendChild(ui);
  loadSettings();
  updateModeSpecificUI();

  // ── Drag ──
  const header = $('header');
  let dragging = false, dragOX = 0, dragOY = 0;

  header.addEventListener('mousedown', e => {
    if (e.target.id === P + 'close' || e.target.closest('#' + P + 'close')) return;
    dragging = true;
    header.style.cursor = 'grabbing';
    const rect = ui.getBoundingClientRect();
    dragOX = e.clientX - rect.left;
    dragOY = e.clientY - rect.top;
    e.preventDefault();
  }, { signal });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    ui.style.left = clamp(e.clientX - dragOX, 0, window.innerWidth - ui.offsetWidth) + 'px';
    ui.style.top = clamp(e.clientY - dragOY, 0, window.innerHeight - ui.offsetHeight) + 'px';
    ui.style.right = 'auto';
    ui.style.bottom = 'auto';
  }, { signal });

  document.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; header.style.cursor = 'grab'; }
  }, { signal });

  // ── Buttons ──
  const closeBtn = $('close');
  closeBtn.onmouseenter = function() { this.style.background = 'rgba(0,0,0,.2)'; };
  closeBtn.onmouseleave = function() { this.style.background = 'transparent'; };
  closeBtn.onclick = () => {
    running = false;
    isPaused = false;
    clearAllTimers();
    window.__fineDragController__.abort();
    ui.remove();
  };

  const toggleBtn = $('toggle');
  toggleBtn.onmousedown = function() { this.style.transform = 'translateY(4px)'; this.style.boxShadow = 'none'; };
  toggleBtn.onmouseup = function() { this.style.transform = 'translateY(0)'; this.style.boxShadow = running ? '0 4px 0 #c4492d' : '0 4px 0 #1a323c'; };

  function stopRun() {
    running = false;
    toggleBtn.textContent = '🔥 START FIRE';
    toggleBtn.style.background = '#264653';
    toggleBtn.style.boxShadow = '0 4px 0 #1a323c';

    clearAllTimers();
    isPaused = false;
    if ($('timer')) $('timer').textContent = '--';
    if ($('action')) $('action').textContent = 'Stopped ☕️';
    if ($('chanceInfo')) $('chanceInfo').textContent = '—';
    if ($('wave')) $('wave').textContent = '';
    ui.style.borderColor = '#e76f51';
    ui.style.boxShadow = '6px 6px 0px #264653';
  }

  async function startRun() {
    running = true;
    saveSettings();
    cacheNightSettings();
    toggleBtn.textContent = '☕️ STOP';
    toggleBtn.style.background = '#e76f51';
    toggleBtn.style.boxShadow = '0 4px 0 #c4492d';

    stats = {
      scrolls: 0, likes: 0, likeFails: 0, alreadyLiked: 0,
      breaks: 0, startTime: Date.now(),
      feedScrolls: 0, reelsScrolls: 0, switches: 0
    };
    waveCounter = 0; wavePhase = 'normal';
    resetFeedRhythm();
    _cachedScrollTarget = null;
    resetSurfaceSwitchCounter();

    const mode = getMode();
    if (mode === 'both') {
      activeSurface = isReelsSurface() ? 'reels' : 'feed';
      const ok = activeSurface === 'feed'
        ? await openFacebookFeed(true)
        : await openFacebookReels(true);
      if (!ok || !running) {
        stopRun();
        return;
      }
    } else if (mode === 'feed') {
      activeSurface = 'feed';
      const ok = await openFacebookFeed(true);
      if (!ok || !running) {
        stopRun();
        return;
      }
    } else if (!isReelsSurface()) {
      activeSurface = 'reels';
      const ok = await openFacebookReels(true);
      if (!ok || !running) {
        stopRun();
        return;
      }
    } else {
      activeSurface = 'reels';
    }

    startBlockDetector();
    startMouseSimulation();
    scheduleBreak();
    startSessionLimit();
    try { Notification.requestPermission(); } catch(e){}

    updateInfoText('▶️ ' + getModeLabel() + ' mode started');
    startNextCycle();
  }

  toggleBtn.onclick = function() {
    if (running) stopRun();
    else startRun();
  };

  function clearCountdownTimer() {
    if (TM.countdown) {
      clearInterval(TM.countdown);
      TM.countdown = null;
    }
    if (TM.nextCycle) {
      clearTimeout(TM.nextCycle);
      TM.nextCycle = null;
    }
  }

  async function jumpToSurface(surface, forceRoot) {
    saveSettings();
    _cachedScrollTarget = null;
    resetFeedRhythm();
    resetSurfaceSwitchCounter();

    if (getMode() !== 'both' && $('mode')) {
      $('mode').value = surface;
      updateModeSpecificUI();
      saveSettings();
    }

    const wasPaused = isPaused;
    if (running) isPaused = true;
    clearCountdownTimer();

    const allowReload = !running || getMode() !== 'both';
    const ok = surface === 'feed'
      ? await openFacebookFeed(allowReload)
      : await openFacebookReels(allowReload, forceRoot);

    isPaused = wasPaused;
    if (ok) activeSurface = surface;
    if (running && !isPaused && ok) startNextCycle();
  }

  $('mode').onchange = async function() {
    saveSettings();
    updateModeSpecificUI();
    resetFeedRhythm();
    _cachedScrollTarget = null;
    resetSurfaceSwitchCounter();

    if (!running) {
      updateInfoText('Mode: ' + getModeLabel());
      return;
    }

    const wasPaused = isPaused;
    isPaused = true;
    clearCountdownTimer();
    updateInfoText('Mode changed: preparing ' + getModeLabel());

    let ok = true;
    const mode = getMode();
    if (mode === 'feed') {
      ok = await openFacebookFeed(false);
    } else if (mode === 'reels') {
      ok = await openFacebookReels(false);
    } else {
      activeSurface = isReelsSurface() ? 'reels' : 'feed';
      ok = activeSurface === 'feed'
        ? await openFacebookFeed(false)
        : await openFacebookReels(false);
    }

    isPaused = wasPaused;
    if (running && !isPaused && ok) startNextCycle();
  };

  $('openReels').onclick = () => jumpToSurface('reels', true);

  $('openFeed').onclick = () => jumpToSurface('feed');

  $('reset').onclick = resetSettings;

  console.log('🐶 THIS IS FINE v4.8 loaded!');
