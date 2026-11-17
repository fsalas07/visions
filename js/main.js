// ── CONFIG ──
const WORKER_URL = 'https://visions-api.fabiansalas1233.workers.dev/';
const SITE_URL = 'https://thepanthervision.com';

// ── ARTICLE TRACKER ──
const usedArticles = new Set();

function getUnused(articles) {
  return articles.filter(a => !usedArticles.has(`${a.section}-${a.slug}`));
}

function markUsed(articles) {
  articles.forEach(a => usedArticles.add(`${a.section}-${a.slug}`));
}

// Display label for a section slug, matching the nav: "arts-culture" renders as
// "ARTS & CULTURE" and "campus-announcements" as "CAMPUS ANNOUNCEMENTS" instead
// of the raw slug uppercased. Other slugs (including "off-campus") uppercase as-is.
const SECTION_LABELS = {
  'arts-culture': 'ARTS &amp; CULTURE',
  'campus-announcements': 'CAMPUS ANNOUNCEMENTS'
};

function sectionLabel(section) {
  return SECTION_LABELS[section] || escapeHtml(section.toUpperCase());
}

// Article fields are plain text from the CMS; escape them before putting them
// into HTML so a quote or < in a title can't break the markup.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Photo captions: a markdown image on its own line with a title,
// ![alt](/path.jpg "Caption"), becomes <figure> with a visible <figcaption>.
// marked already HTML-escapes the title, so it is inserted as-is.
// Mirrored in functions/pages/article.js.
function addCaptions(html) {
  return html.replace(
    /<p>\s*<img ([^>]*?)\s*title="([^"]*)"([^>]*?)\/?>\s*<\/p>/g,
    (m, before, caption, after) => `<figure><img ${before}${after}><figcaption>${caption}</figcaption></figure>`
  );
}

// ── FETCH ARTICLES FROM WORKER ──
// The Worker fetches from GitHub and parses frontmatter server-side, so this
// just consumes clean, pre-parsed article JSON. No raw YAML reaches the client.
// sessionStorage can be unavailable or full; the site works without it.
// Entries older than 5 minutes are ignored, so a newly published story shows up
// without closing the tab. Entries saved before this rule have no timestamp and
// count as stale.
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.t !== 'number' || Date.now() - entry.t > CACHE_MAX_AGE_MS) return null;
    return entry.v;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {}
}

// Returns null when the section could not be loaded (network error, Worker
// error), so callers can tell a failure from an empty section.
async function loadSection(section) {
  const cacheKey = `articles-${section}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${WORKER_URL}?section=${encodeURIComponent(section)}`);
    if (!res.ok) return null;
    const articles = await res.json();
    if (!Array.isArray(articles)) return null;
    writeCache(cacheKey, articles);
    return articles;
  } catch {
    return null;
  }
}

async function fetchArticles(section) {
  return (await loadSection(section)) || [];
}

async function prefetchAll() {
  const sections = ['news', 'sports', 'features', 'data', 'arts-culture', 'multimedia', 'opinion'];
  await Promise.all(sections.map(s => fetchArticles(s)));
}

// ── FETCH ALL ARTICLES (SITE-WIDE, FOR SEARCH) ──
// Loads each section on its own (the Worker has no all-sections mode).
const ALL_SECTIONS = ['news', 'sports', 'opinion', 'features', 'multimedia', 'data',
  'arts-culture', 'off-campus', 'campus-announcements', 'memorial'];

async function fetchAllArticlesFlat() {
  const cacheKey = 'articles-all';
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const lists = await Promise.all(ALL_SECTIONS.map(loadSection));
  const articles = lists.flatMap(list => list || []);
  // Only cache a complete set, so one failed section doesn't hide its
  // articles for the rest of the visit.
  if (lists.every(Boolean)) writeCache(cacheKey, articles);
  return articles;
}

// ── SEARCH MATCHING/RANKING ──
// Any query word matching scores higher when found in title/summary than
// when only found in the body. Results with zero matches are excluded.
// Lowercase and drop accents, so "jose" matches "José" and vice versa.
function foldForSearch(s) {
  return (s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function scoreArticleForSearch(article, queryWords) {
  const title = foldForSearch(article.title);
  const author = foldForSearch(article.author);
  const summary = foldForSearch(article.summary);
  // Match the body's text, not HTML tags or link/image URLs.
  const body = foldForSearch((article.body || '').replace(/<[^>]*>/g, ' ').replace(/\]\([^)]*\)/g, '] '));
  let score = 0;
  for (const w of queryWords) {
    if (title.includes(w)) score += 3;
    if (author.includes(w)) score += 3;
    if (summary.includes(w)) score += 2;
    if (body.includes(w)) score += 1;
  }
  return score;
}

function searchArticles(articles, query) {
  const queryWords = foldForSearch(query).split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2);
  if (!queryWords.length) return [];
  return articles
    .map(a => ({ article: a, score: scoreArticleForSearch(a, queryWords) }))
    .filter(r => r.score > 0)
    .sort((x, y) => y.score - x.score || new Date(y.article.date) - new Date(x.article.date))
    .map(r => r.article);
}

// ── SEARCH BAR WIRING (every page) ──
function initSearchBars() {
  document.querySelectorAll('#search-bar').forEach(bar => {
    const input = bar.querySelector('input');
    const button = bar.querySelector('button');
    if (!input || !button) return;

    const go = () => {
      const q = input.value.trim();
      if (!q) return;
      window.location.href = `/pages/search.html?q=${encodeURIComponent(q)}`;
    };

    button.addEventListener('click', go);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') go();
    });
  });
}

// ── NAV: MOBILE MENU TOGGLE + CURRENT-PAGE HIGHLIGHT (every page) ──
// The header markup is identical on every page, so the active link is set
// here instead of in the HTML. Below 992px the CSS collapses the links behind
// the menu button only after 'nav-ready' is added, so the nav stays usable if
// this script never runs.
function initNav() {
  const header = document.getElementById('site-header');
  const toggle = document.getElementById('nav-toggle');
  if (header && toggle) {
    header.classList.add('nav-ready');
    toggle.addEventListener('click', () => {
      const open = header.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    // Phones hide the utility links and social icons from the header, so copy
    // them into the menu panel (.nav-extras only displays on phones).
    const panel = document.getElementById('nav-panel');
    if (panel) {
      const extras = document.createElement('div');
      extras.className = 'nav-extras';
      ['utility-nav', 'header-socials'].forEach(id => {
        const source = document.getElementById(id);
        if (!source) return;
        const row = document.createElement('div');
        row.className = `nav-extras-row nav-extras-${id}`;
        source.querySelectorAll('a').forEach(a => row.appendChild(a.cloneNode(true)));
        extras.appendChild(row);
      });
      panel.appendChild(extras);
    }
  }

  // Compare page names without ".html" (Cloudflare Pages serves clean URLs).
  const pageName = path => (path.split('/').pop() || 'index').replace(/\.html$/, '');
  let current = pageName(window.location.pathname);
  if (current === 'article') {
    const section = new URLSearchParams(window.location.search).get('section');
    if (section) current = section === 'memorial' ? 'obituary' : section;
  }
  document.querySelectorAll('#main-nav a').forEach(a => {
    if (pageName(a.getAttribute('href')) === current) a.setAttribute('aria-current', 'page');
  });
}

// ── INSTAGRAM ROW (every page) ──
// "Follow us on Instagram" row under the header, built from the header's own
// Instagram link. style.css only displays it on phones.
function initInstagramRow() {
  const header = document.getElementById('site-header');
  const link = document.querySelector('#header-socials a[href*="instagram.com"]');
  if (!header || !link) return;
  const row = document.createElement('a');
  row.className = 'promo-row';
  row.href = link.href;
  row.target = '_blank';
  row.rel = 'noopener';
  row.innerHTML = `
    <span class="promo-icon promo-icon-instagram"><i class="fab fa-instagram"></i></span>
    <span class="promo-text">Follow us on Instagram</span>`;
  header.after(row);
}

// ── RENDER SEARCH RESULTS PAGE ──
async function renderSearchPage() {
  const resultsEl = document.getElementById('search-results');
  if (!resultsEl) return;

  const params = new URLSearchParams(window.location.search);
  const query = params.get('q') || '';

  const headingEl = document.getElementById('search-query-display');
  const emptyEl = document.getElementById('search-empty');
  const input = document.querySelector('#search-bar input');
  if (input) input.value = query;

  if (headingEl) headingEl.textContent = query ? `Results for "${query}"` : 'Search';

  if (!query) {
    if (emptyEl) {
      const textEl = document.getElementById('search-empty-text');
      if (textEl) textEl.textContent = 'Type something in the search bar above to get started.';
      emptyEl.style.display = 'flex';
    }
    document.body.classList.add('content-loaded');
    return;
  }

  const all = await fetchAllArticlesFlat();
  const results = searchArticles(all, query);

  if (!results.length) {
    if (emptyEl) {
      const textEl = document.getElementById('search-empty-text');
      if (textEl) textEl.textContent = `No results found for "${query}". Try a different search term.`;
      emptyEl.style.display = 'flex';
    }
    resultsEl.innerHTML = '';
    document.body.classList.add('content-loaded');
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  resultsEl.innerHTML = results.map(a => storyRow(a, a.url, a.section)).join('');

  document.body.classList.add('content-loaded');
}

// ── AUTHOR AND TAG PAGES ──
// pages/author.html (?name=) and pages/tag.html (?tag=) list every story that
// matches, from the same data as search.
async function renderFilterPage() {
  const resultsEl = document.getElementById('filter-results');
  if (!resultsEl) return;
  const kind = resultsEl.dataset.filter;
  const value = (new URLSearchParams(window.location.search).get(kind === 'author' ? 'name' : 'tag') || '').trim();
  const headingEl = document.getElementById('filter-heading');
  const emptyEl = document.getElementById('filter-empty');
  const label = kind === 'author' ? 'Stories by' : 'Stories tagged';
  headingEl.textContent = value ? `${label} ${value}` : label.replace(/ by$| tagged$/, '');
  document.title = `${headingEl.textContent} | The Panther Vision`;

  const same = (x, y) => foldForSearch(x) === foldForSearch(y);
  const matches = value ? (await fetchAllArticlesFlat()).filter(a => a.section !== 'memorial' && (kind === 'author'
    ? same(a.author, value)
    : (a.tags || []).some(tag => same(tag, value)))) : [];
  matches.sort((a, b) => new Date(b.date) - new Date(a.date));

  resultsEl.innerHTML = matches.map(a => storyRow(a, a.url, a.section)).join('');
  emptyEl.style.display = matches.length ? 'none' : 'flex';
  document.body.classList.add('content-loaded');
}

// ── RELATIVE TIME ──
// "5 minutes ago", "19 hours ago", "2 days ago"; after 7 days the date
// ("September 23", plus the year when it isn't the current year).
function timeAgo(dateStr) {
  const date = new Date(dateStr);
  if (isNaN(date)) return '';
  const seconds = (Date.now() - date.getTime()) / 1000;
  if (seconds >= 0 && seconds < 7 * 86400) {
    const ago = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
    if (seconds < 3600) return ago(Math.max(1, Math.floor(seconds / 60)), 'minute');
    if (seconds < 86400) return ago(Math.floor(seconds / 3600), 'hour');
    return ago(Math.floor(seconds / 86400), 'day');
  }
  const options = { month: 'long', day: 'numeric' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString('en-US', options);
}

// ── CURRENT DATE ──
function setDate() {
  const el = document.getElementById('current-date');
  if (!el) return;
  const now = new Date();
  const options = { weekday: 'long', month: 'long', day: 'numeric' };
  el.textContent = now.toLocaleDateString('en-US', options);
}

async function setWeather() {
  const el = document.getElementById('header-weather');
  if (!el) return;
  try {
    const res = await fetch('https://wttr.in/Paterson,NJ?format=j1');
    const data = await res.json();
    const temp = data.current_condition[0].temp_F;
    const desc = data.current_condition[0].weatherDesc[0].value;
    el.textContent = `${desc} ${temp}°F`;
  } catch {
    el.textContent = '';
  }
}

// ── RENDER HOMEPAGE HERO ──
// ── RENDER TOP STORIES ──
// Seven top stories across every section in the Princetonian top-zone grid:
// row 1 = featured (7/12) | two text-only stories (5/12); row 2 = two stories
// with images (5/12) | two stories with images (7/12). The Lead-flagged
// article always takes the featured slot.
async function renderTopStories() {
  const heroEl = document.getElementById('hero-left');
  if (!heroEl) return;

  const all = await fetchAllArticlesFlat();
  // Obituary/Memorial content is kept off the general homepage mix by convention —
  // it stays on its own dedicated page. Still fully searchable elsewhere.
  const eligible = all.filter(a => a.section !== 'memorial');

  // Editors can flag an article's homepage placement via CMS (Lead/Secondary/Normal).
  // Sorting by priority tier first, then recency within each tier, means this is a
  // pure extension of the old behavior: when everything is "Normal" (the default,
  // and the only state any article had before this field existed), every tier rank
  // is equal, so this sort is identical to sorting by date alone.
  const PRIORITY_RANK = { Lead: 0, Secondary: 1, Normal: 2 };
  const sorted = [...eligible].sort((a, b) => {
    const rankA = PRIORITY_RANK[a.homepage_priority] ?? 2;
    const rankB = PRIORITY_RANK[b.homepage_priority] ?? 2;
    if (rankA !== rankB) return rankA - rankB;
    return new Date(b.date) - new Date(a.date);
  });

  const picked = getUnused(sorted).slice(0, 7);
  if (!picked.length) return;
  markUsed(picked);

  const [lead, ...rest] = picked;
  const side = rest.slice(0, 2);
  const left = rest.slice(2, 4);
  const right = rest.slice(4, 6);
  const column = (cls, stories) => stories.length ? `<div class="top-col ${cls}">${stories.join('')}</div>` : '';

  heroEl.innerHTML = `
    <div class="top-row top-row-1">
      ${column('top-col-lead', [aboveStory(lead, { size: 'lg', image: true, abstract: true, kicker: true })])}
      ${column('top-col-side', side.map(a => aboveStory(a, { size: 'md', image: false, abstract: true, kicker: true })))}
    </div>
    ${left.length || right.length ? `
    <div class="top-row top-row-2">
      ${column('top-col-left', left.map(a => aboveStory(a, { size: 'md', image: true, abstract: true, kicker: true })))}
      ${column('top-col-right', right.map(a => aboveStory(a, { size: 'md', image: true, abstract: false, kicker: true })))}
    </div>` : ''}`;
}

// ── RENDER OPINION SIDEBAR ──
async function renderOpinionSidebar() {
  const el = document.getElementById('hero-right');
  if (!el) return;
  const articles = await fetchArticles('opinion');
  // Articles explicitly flagged Lead/Secondary are reserved for renderTopStories —
  // otherwise a Lead-flagged Opinion article would get silently claimed here first
  // (by pure recency, with no priority awareness) before the priority logic ever
  // gets a turn to place it in the featured hero/river.
  const unflagged = articles.filter(a => (a.homepage_priority || 'Normal') === 'Normal');
  const unused = getUnused(unflagged);
  if (!unused.length) return;
  const picked = unused.slice(0, 5);
  markUsed(picked);
  const items = picked.map(a => `
    <div class="opinion-article">
      <h4 class="opinion-headline"><a href="${escapeHtml(a.url)}">${escapeHtml(a.title)}</a></h4>
      <p class="opinion-author">${escapeHtml(a.author)}</p>
    </div>
  `).join('');
  el.innerHTML = `<h3 id="opinion-label">Opinion</h3>${items}`;
}

// ── RENDER LARGE STRIP ──
async function renderLargeStrip(section, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const articles = await fetchArticles(section);
  const unused = getUnused(articles);
  // Every story already shown higher up: hide the block instead of an empty heading.
  if (!unused.length) {
    el.hidden = true;
    return;
  }
  const featured = unused[0];
  const rest = getUnused(articles).slice(1, 5);
  markUsed([featured, ...rest]);
  const inner = el.querySelector('.strip-inner');
  if (!inner) return;
  inner.querySelector('.strip-featured').innerHTML =
    aboveStory(featured, { size: 'lg', image: true, imageFirst: true, abstract: true, kicker: false });
  inner.querySelector('.strip-list').innerHTML =
    rest.map(a => aboveStory(a, { size: 'md', image: false, abstract: false, kicker: false })).join('');
}

// ── RENDER SMALL STRIP ──
async function renderSmallStrip(section, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const articles = await fetchArticles(section);
  const unused = getUnused(articles);
  if (!unused.length) return;
  const picked = unused.slice(0, 2);
  markUsed(picked);
  const grid = el.querySelector('.small-strip-grid');
  if (!grid) return;
  grid.innerHTML =
    picked.map(a => aboveStory(a, { size: 'sm', image: true, imageFirst: true, abstract: false, kicker: false })).join('');
}

// ── LISTING TEMPLATES (Princetonian section-page treatment) ──
// Shared markup pieces for story listings. Articles without an image render
// as text-only items (no empty image box).
// lazy: list images below the fold load on demand. Lead images stay eager.
function storyImage(a, url, lazy) {
  return a.image
    ? `<a href="${escapeHtml(url)}" class="story-thumb"><img src="${escapeHtml(a.image)}" alt="${escapeHtml(a.title)}" class="story-img"${lazy ? ' loading="lazy" decoding="async"' : ''} /></a>`
    : '';
}

function storyByline(a, withTime) {
  const time = withTime ? ` <span class="meta-divider">|</span> <span class="story-time">${timeAgo(a.date)}</span>` : '';
  return `<div class="story-byline">${escapeHtml(a.author)}${time}</div>`;
}

// Main-list item: 4:3 thumb | headline, byline, abstract, then KICKER | time.
function storyRow(a, url, section) {
  return `
    <article class="story story-row${a.image ? '' : ' no-image'}">
      ${storyImage(a, url, true)}
      <div class="story-text">
        <h2 class="story-headline"><a href="${escapeHtml(url)}">${escapeHtml(a.title)}</a></h2>
        ${storyByline(a, false)}
        <p class="story-abstract">${escapeHtml(a.summary)}</p>
        <div class="story-meta"><span class="section-tag">${sectionLabel(section)}</span> <span class="meta-divider">|</span> <span class="story-time">${timeAgo(a.date)}</span></div>
      </div>
    </article>`;
}

// Homepage card (Princetonian "art-above"): headline, byline row
// (author | KICKER | time), optional image, optional abstract. size sets the
// headline scale: lg 32/34, md 22/24, sm 18/20. The kicker keeps Opinion
// visibly labeled wherever sections are mixed (top zone).
function aboveStory(a, { size, image, imageFirst = false, abstract, kicker }) {
  const kick = kicker ? ` <span class="meta-divider">|</span> <span class="section-tag">${sectionLabel(a.section)}</span>` : '';
  const img = image ? storyImage(a, a.url) : '';
  return `
    <article class="story story-above story-${size}${imageFirst ? ' image-first' : ''}">
      <h3 class="story-headline"><a href="${escapeHtml(a.url)}">${escapeHtml(a.title)}</a></h3>
      <div class="story-byline">${escapeHtml(a.author)}${kick} <span class="meta-divider">|</span> <span class="story-time">${timeAgo(a.date)}</span></div>
      ${img}
      ${abstract && a.summary ? `<p class="story-abstract">${escapeHtml(a.summary)}</p>` : ''}
    </article>`;
}

// "Latest": headline + byline only. There is no popularity data, so this is
// labeled honestly instead of "Most Popular".
function latestBlock(articles) {
  return `
    <h3 class="sidebar-subheader">Latest</h3>
    <div class="sidebar-items">${articles.map(a => `
      <article class="story story-hed">
        <h3 class="story-headline"><a href="${escapeHtml(a.url)}">${escapeHtml(a.title)}</a></h3>
        ${storyByline(a, false)}
      </article>`).join('')}
    </div>`;
}

// ── RENDER SECTION PAGE ──
// Princetonian section list: the newest story as a large top story, then every
// other story as a picture-left row, with a 330px "Latest" sidebar (5 newest
// stories from other sections) alongside. A section with no stories yet shows
// only "Latest", full width. 20 stories per page; pagination only past 20.
async function renderSectionPage() {
  const el = document.getElementById('section-main');
  if (!el) return;
  const titleEl = document.getElementById('section-title');
  if (!titleEl) return;
  const section = titleEl.textContent.toLowerCase().replace(' & ', '-').replace(' ', '-');
  const articles = await fetchArticles(section);

  const linkTo = a => `article.html?section=${encodeURIComponent(section)}&slug=${encodeURIComponent(a.slug)}`;

  const PER_PAGE = 20;
  const pageCount = Math.max(1, Math.ceil(articles.length / PER_PAGE));
  const requested = parseInt(new URLSearchParams(window.location.search).get('page'), 10) || 1;
  const page = Math.min(Math.max(requested, 1), pageCount);
  const onPage = articles.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const featured = page === 1 ? onPage[0] : null;
  const mainList = page === 1 ? onPage.slice(1) : onPage;

  // Memorial stays out of "Latest", as it stays off the homepage.
  const latest = (await fetchAllArticlesFlat())
    .filter(a => a.section !== section && a.section !== 'memorial')
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  const top = document.getElementById('section-top');
  if (top) {
    if (featured) {
      const url = linkTo(featured);
      top.querySelector('#section-featured').innerHTML = `
        <article class="story story-top">
          <h2 class="story-headline"><a href="${escapeHtml(url)}">${escapeHtml(featured.title)}</a></h2>
          ${storyByline(featured, true)}
          ${storyImage(featured, url)}
          <p class="story-abstract">${escapeHtml(featured.summary)}</p>
        </article>`;
    }
    top.hidden = !featured;
  }

  const row2 = document.getElementById('section-row2');
  const list = document.getElementById('section-list');
  const right = document.getElementById('section-right');
  if (row2 && list && right) {
    list.innerHTML = mainList.map(a => storyRow(a, linkTo(a), section)).join('');
    if (pageCount > 1) {
      list.innerHTML += `
        <nav class="section-pagination">
          ${page > 1 ? `<a href="?page=${page - 1}">‹ Previous</a>` : ''}
          ${page < pageCount ? `<a href="?page=${page + 1}">Next ›</a>` : ''}
        </nav>`;
    }
    right.innerHTML = latest.length ? latestBlock(latest) : '';
    list.hidden = !mainList.length;
    right.hidden = !latest.length;
    row2.classList.toggle('latest-only', !articles.length);
    row2.hidden = !featured && list.hidden && right.hidden;
  }

  document.body.classList.add('content-loaded');
}

// ── RENDER ARTICLE PAGE ──
// Mirrors NOT_FOUND_HTML in functions/pages/article.js.
function showArticleNotFound(el) {
  document.title = 'Story not found | The Panther Vision';
  el.innerHTML = '<h1 id="article-headline">Story not found</h1>' +
    '<p id="article-subheadline">That story may have moved or been removed. <a href="/">Back to the homepage</a>.</p>';
}

// Mirrors readingMinutes in functions/pages/article.js.
function readingMinutes(body) {
  const words = String(body || '').replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// Mirrors articleExtras in functions/pages/article.js: correction, tags, share
// links, and the empty container fillMoreFromSection() fills.
function articleExtras(a, section, slug) {
  const canonical = `${SITE_URL}/pages/article?section=${encodeURIComponent(section)}&slug=${encodeURIComponent(slug)}`;
  const u = encodeURIComponent(canonical);
  const t = encodeURIComponent(a.title);
  const tags = Array.isArray(a.tags) ? a.tags : [];
  return `
    ${a.correction ? `<p class="article-correction"><strong>Correction:</strong> ${escapeHtml(a.correction)}</p>` : ''}
    ${tags.length ? `<p class="article-tags">${tags.map(tag => `<a href="/pages/tag?tag=${encodeURIComponent(tag)}">${escapeHtml(tag)}</a>`).join('')}</p>` : ''}
    <div class="article-share">
      <span class="article-share-label">Share</span>
      <a href="${escapeHtml(`https://www.facebook.com/sharer/sharer.php?u=${u}`)}" target="_blank" rel="noopener">Facebook</a>
      <a href="${escapeHtml(`https://twitter.com/intent/tweet?url=${u}&text=${t}`)}" target="_blank" rel="noopener">X</a>
      <a href="${escapeHtml(`mailto:?subject=${t}&body=${u}`)}">Email</a>
      <button type="button" class="copy-link" data-url="${escapeHtml(canonical)}">Copy link</button>
    </div>
    <aside id="more-from-section" data-section="${escapeHtml(section)}" data-slug="${escapeHtml(slug)}"></aside>
  `;
}

// "More from this section": the three newest other stories in the same
// section. Runs on every article page, server-rendered or not.
async function fillMoreFromSection() {
  const el = document.getElementById('more-from-section');
  if (!el || el.children.length) return;
  const { section, slug } = el.dataset;
  const others = ((await loadSection(section)) || []).filter(a => a.slug !== slug).slice(0, 3);
  if (!others.length) return;
  el.innerHTML = `<h2 class="more-heading">More from ${sectionLabel(section)}</h2>` +
    others.map(a => storyRow(a, a.url, section)).join('');
}

// Tall photos would lose a big slice in the landscape thumbnails, so they are
// shown whole, centered on a neutral background (.fit-whole in style.css).
document.addEventListener('load', e => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.matches('.story-img, .tribute-img') && img.naturalHeight > img.naturalWidth * 1.1) {
    img.classList.add('fit-whole');
  }
}, true);

// Copy-link buttons (article pages).
document.addEventListener('click', e => {
  const btn = e.target.closest && e.target.closest('.copy-link');
  if (!btn) return;
  const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy link'; }, 2000); };
  if (navigator.clipboard) navigator.clipboard.writeText(btn.dataset.url).then(done, () => {});
});

async function renderArticlePage() {
  const el = document.getElementById('article-container');
  if (!el) return;
  // 404.html reuses this layout with fixed text.
  if (el.hasAttribute('data-static')) { document.body.classList.add('content-loaded'); return; }
  const params = new URLSearchParams(window.location.search);
  const section = params.get('section');
  const slug = params.get('slug');
  // The server (functions/pages/article.js) already put the article into the
  // HTML. If anything below fails, keep that version and still reveal it.
  try {
    if (!section || !slug) { showArticleNotFound(el); return; }

    const res = await fetch(`${WORKER_URL}?section=${encodeURIComponent(section)}&slug=${encodeURIComponent(slug)}`);
    if (res.status === 404) { showArticleNotFound(el); return; }
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.title || typeof marked === 'undefined') return;

    document.title = `${data.title} | The Panther Vision`;

    // Same date format as the server render, so it doesn't change after load.
    const date = new Date(data.date).toLocaleDateString('en-US', { timeZone: 'America/New_York' });
    el.innerHTML = `
    <span class="section-tag">${sectionLabel(section)}</span>
    <h1 id="article-headline">${escapeHtml(data.title)}</h1>
    <p id="article-subheadline">${escapeHtml(data.summary)}</p>
    <p class="author-meta">By <span class="article-author"><a href="/pages/author?name=${encodeURIComponent(data.author)}">${escapeHtml(data.author)}</a></span> <span class="meta-divider">|</span> <span class="section-tag">${sectionLabel(section)}</span> <span class="meta-divider">|</span> ${date} <span class="meta-divider">|</span> ${readingMinutes(data.body)} min read</p>
    ${data.image ? `<div id="article-hero-img">
      <figure>
        <img src="${escapeHtml(data.image)}" alt="${escapeHtml(data.title)}" />
        ${data.image_caption ? `<figcaption>${escapeHtml(data.image_caption)}</figcaption>` : ''}
      </figure>
    </div>` : ''}
    <div id="article-body">
      ${addCaptions(marked.parse(data.body || ''))}
    </div>
    ${articleExtras(data, section, slug)}
    <div id="author-bio">
      <p id="author-name">${escapeHtml(String(data.author || '').toUpperCase())}</p>
      <p id="author-description">${escapeHtml(data.author_role || 'Staff Writer for Visions.')}</p>
    </div>`;

    runAllowedScripts(el);
  } finally {
    document.body.classList.add('content-loaded');
    fillMoreFromSection();
  }
}

// Article bodies can contain embed snippets (Flourish, etc.) with <script>
// tags. Browsers never execute <script> tags inserted via innerHTML, so those
// embeds do nothing unless each script tag is re-created.
//
// Only scripts from the allowlist below are re-created; inline scripts and
// scripts from any other origin are removed. This is not a sanitizer: the body
// is still rendered as HTML (embeds need iframes), so other HTML from the CMS,
// such as event-handler attributes, is trusted as editor content.
function runAllowedScripts(el) {
  const ALLOWED_SCRIPT_ORIGINS = [
    'https://public.flourish.studio/'
  ];

  el.querySelectorAll('script').forEach(oldScript => {
    const src = oldScript.src || '';
    const isAllowed = src && ALLOWED_SCRIPT_ORIGINS.some(origin => src.startsWith(origin));
    if (isAllowed) {
      const newScript = document.createElement('script');
      newScript.src = src;
      oldScript.replaceWith(newScript);
    } else {
      oldScript.remove();
    }
  });
}
// ── RENDER OBITUARY PAGE ──
async function renderObituaryPage() {
  const container = document.getElementById('obituary-tributes');
  if (!container) return;

  const articles = await fetchArticles('memorial');
  const emptyState = document.getElementById('obituary-empty');

  if (!articles.length) {
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  container.innerHTML = articles.map(a => `
    <div class="tribute-card">
      ${a.image
        ? `<img src="${escapeHtml(a.image)}" alt="${escapeHtml(a.title)}" class="tribute-img" />`
        : `<div class="tribute-img" style="background:#f0f0f0;display:flex;align-items:center;justify-content:center;">
             <span style="font-size:11px;color:#aaa;font-family:Georgia,serif;">No Image</span>
           </div>`
      }
      <div class="tribute-text">
        <span class="tribute-tag">Tribute</span>
        <a href="article.html?section=memorial&slug=${encodeURIComponent(a.slug)}">
          <h3 class="tribute-headline">${escapeHtml(a.title)}</h3>
        </a>
        <p class="tribute-excerpt">${escapeHtml(a.summary)}</p>
        <p class="tribute-meta">${escapeHtml(a.author)} <span class="meta-divider">|</span> ${new Date(a.date).toLocaleDateString()}</p>
      </div>
    </div>
  `).join('');

  document.body.classList.add('content-loaded');
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  setDate();
  setWeather();
  initSearchBars();
  initNav();
  initInstagramRow();

  // Each page reveals its content (opacity) via 'content-loaded'. Add it even
  // if rendering fails, so a single error can't leave the page blank.
  const reveal = () => document.body.classList.add('content-loaded');

  if (document.getElementById('hero-left')) {
    (async () => {
      await prefetchAll();
      await renderOpinionSidebar();
      await renderTopStories();
      await renderLargeStrip('news', 'news-strip');
      await renderLargeStrip('opinion', 'opinion-strip');
      await renderSmallStrip('sports', 'sports-strip');
      await renderSmallStrip('features', 'features-strip');
      await renderSmallStrip('data', 'data-strip');
      await renderSmallStrip('multimedia', 'multimedia-strip');
    })().finally(reveal);
  }
  if (document.getElementById('obituary-tributes')) {
    renderObituaryPage().finally(reveal);
  }
  if (document.getElementById('section-main')) {
    renderSectionPage().finally(reveal);
  }

  if (document.getElementById('article-container')) {
    renderArticlePage();
  }

  if (document.getElementById('search-results')) {
    renderSearchPage().finally(reveal);
  }

  if (document.getElementById('filter-results')) {
    renderFilterPage().finally(reveal);
  }
});