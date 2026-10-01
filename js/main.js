// ── CONFIG ──
const WORKER_URL = 'https://visions-api.fabiansalas1233.workers.dev/';

// ── ARTICLE TRACKER ──
const usedArticles = new Set();

function getUnused(articles) {
  return articles.filter(a => !usedArticles.has(`${a.section}-${a.slug}`));
}

function markUsed(articles) {
  articles.forEach(a => usedArticles.add(`${a.section}-${a.slug}`));
}

// Display label for a section slug — "arts-culture" renders as "ARTS & CULTURE"
// (matching the nav) instead of the raw slug uppercased ("ARTS-CULTURE").
function sectionLabel(section) {
  return section === 'arts-culture' ? 'ARTS &amp; CULTURE' : section.toUpperCase();
}

// ── FETCH ARTICLES FROM WORKER ──
// The Worker fetches from GitHub and parses frontmatter server-side, so this
// just consumes clean, pre-parsed article JSON. No raw YAML reaches the client.
async function fetchArticles(section) {
  const cacheKey = `articles-${section}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);

  const res = await fetch(`${WORKER_URL}?section=${section}`);
  if (!res.ok) return [];
  const articles = await res.json();
  if (!Array.isArray(articles)) return [];
  sessionStorage.setItem(cacheKey, JSON.stringify(articles));
  return articles;
}

async function prefetchAll() {
  const sections = ['news', 'sports', 'features', 'data', 'arts-culture', 'multimedia', 'opinion'];
  await Promise.all(sections.map(s => fetchArticles(s)));
}

// ── FETCH ALL ARTICLES (SITE-WIDE, FOR SEARCH) ──
async function fetchAllArticlesFlat() {
  const cacheKey = 'articles-all';
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);

  const res = await fetch(`${WORKER_URL}?all=1`);
  if (!res.ok) return [];
  const articles = await res.json();
  if (!Array.isArray(articles)) return [];
  sessionStorage.setItem(cacheKey, JSON.stringify(articles));
  return articles;
}

// ── SEARCH MATCHING/RANKING ──
// Any query word matching scores higher when found in title/summary than
// when only found in the body. Results with zero matches are excluded.
function scoreArticleForSearch(article, queryWords) {
  const title = (article.title || '').toLowerCase();
  const author = (article.author || '').toLowerCase();
  const summary = (article.summary || '').toLowerCase();
  const body = (article.body || '').toLowerCase();
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
  const queryWords = query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2);
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
      <h4 class="opinion-headline"><a href="${a.url}">${a.title}</a></h4>
      <p class="opinion-author">${a.author}</p>
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
  if (!unused.length) return;
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
function storyImage(a, url) {
  return a.image
    ? `<a href="${url}" class="story-thumb"><img src="${a.image}" alt="${a.title}" class="story-img" /></a>`
    : '';
}

function storyByline(a, withTime) {
  const time = withTime ? ` <span class="meta-divider">|</span> <span class="story-time">${timeAgo(a.date)}</span>` : '';
  return `<div class="story-byline">${a.author}${time}</div>`;
}

// Main-list item: 4:3 thumb | headline, byline, abstract, then KICKER | time.
function storyRow(a, url, section) {
  return `
    <article class="story story-row${a.image ? '' : ' no-image'}">
      ${storyImage(a, url)}
      <div class="story-text">
        <h2 class="story-headline"><a href="${url}">${a.title}</a></h2>
        ${storyByline(a, false)}
        <p class="story-abstract">${a.summary}</p>
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
      <h3 class="story-headline"><a href="${a.url}">${a.title}</a></h3>
      <div class="story-byline">${a.author}${kick} <span class="meta-divider">|</span> <span class="story-time">${timeAgo(a.date)}</span></div>
      ${img}
      ${abstract && a.summary ? `<p class="story-abstract">${a.summary}</p>` : ''}
    </article>`;
}

// "Latest": headline + byline only. There is no popularity data, so this is
// labeled honestly instead of "Most Popular".
function latestBlock(articles) {
  return `
    <h3 class="sidebar-subheader">Latest</h3>
    <div class="sidebar-items">${articles.map(a => `
      <article class="story story-hed">
        <h3 class="story-headline"><a href="${a.url}">${a.title}</a></h3>
        ${storyByline(a, false)}
      </article>`).join('')}
    </div>`;
}

// ── RENDER SECTION PAGE ──
// Zone A: top story (7/12) + up to 5 compact items (5/12).
// Zone B: main list + 330px "Latest" sidebar (5 newest stories from other sections).
// Small sections never leave an empty column: with only one story, "Latest"
// fills Zone A's right column; with nothing left for the main list, "Latest"
// runs full width under Zone A. 20 stories per page; pagination only past 20.
async function renderSectionPage() {
  const el = document.getElementById('section-main');
  if (!el) return;
  const titleEl = document.getElementById('section-title');
  if (!titleEl) return;
  const section = titleEl.textContent.toLowerCase().replace(' & ', '-').replace(' ', '-');
  const articles = await fetchArticles(section);
  if (!articles.length) return;

  const linkTo = a => `article.html?section=${section}&slug=${a.slug}`;

  const PER_PAGE = 20;
  const pageCount = Math.ceil(articles.length / PER_PAGE);
  const requested = parseInt(new URLSearchParams(window.location.search).get('page'), 10) || 1;
  const page = Math.min(Math.max(requested, 1), pageCount);
  const onPage = articles.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const featured = page === 1 ? onPage[0] : null;
  const compact = page === 1 ? onPage.slice(1, 6) : [];
  const mainList = page === 1 ? onPage.slice(6) : onPage;

  // Memorial stays out of "Latest", as it stays off the homepage.
  const latest = (await fetchAllArticlesFlat())
    .filter(a => a.section !== section && a.section !== 'memorial')
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);
  const latestInZoneA = featured && !compact.length && latest.length > 0;

  const top = document.getElementById('section-top');
  if (top) {
    if (featured) {
      const url = linkTo(featured);
      top.querySelector('#section-featured').innerHTML = `
        <article class="story story-top">
          <h2 class="story-headline"><a href="${url}">${featured.title}</a></h2>
          ${storyByline(featured, true)}
          ${storyImage(featured, url)}
          <p class="story-abstract">${featured.summary}</p>
        </article>`;

      const middle = top.querySelector('#section-middle');
      if (middle) {
        middle.innerHTML = latestInZoneA ? latestBlock(latest) : compact.map(a => `
          <article class="story story-compact${a.image ? '' : ' no-image'}">
            ${storyImage(a, linkTo(a))}
            <div class="story-text">
              <h3 class="story-headline"><a href="${linkTo(a)}">${a.title}</a></h3>
              ${storyByline(a, true)}
            </div>
          </article>`).join('');
        middle.hidden = !middle.innerHTML.trim();
      }
    } else {
      top.hidden = true;
    }
  }

  const row2 = document.getElementById('section-row2');
  const list = document.getElementById('section-list');
  const right = document.getElementById('section-right');
  if (row2 && list && right) {
    const showLatest = !latestInZoneA && latest.length > 0;
    list.innerHTML = mainList.map(a => storyRow(a, linkTo(a), section)).join('');
    if (pageCount > 1) {
      list.innerHTML += `
        <nav class="section-pagination">
          ${page > 1 ? `<a href="?page=${page - 1}">‹ Previous</a>` : ''}
          ${page < pageCount ? `<a href="?page=${page + 1}">Next ›</a>` : ''}
        </nav>`;
    }
    right.innerHTML = showLatest ? latestBlock(latest) : '';
    list.hidden = !mainList.length;
    right.hidden = !showLatest;
    row2.classList.toggle('latest-only', !mainList.length && showLatest);
    row2.hidden = list.hidden && right.hidden;
  }

  document.body.classList.add('content-loaded');
}

// ── RENDER ARTICLE PAGE ──
async function renderArticlePage() {
  const el = document.getElementById('article-container');
  if (!el) return;
  const params = new URLSearchParams(window.location.search);
  const section = params.get('section');
  const slug = params.get('slug');
  if (!section || !slug) return;

  const res = await fetch(`${WORKER_URL}?section=${section}&slug=${slug}`);
  if (!res.ok) return;
  const data = await res.json();
  const body = data.body;

  document.title = `${data.title} | Visions`;

  el.innerHTML = `
    <span class="section-tag">${sectionLabel(section)}</span>
    <h1 id="article-headline">${data.title}</h1>
    <p id="article-subheadline">${data.summary}</p>
    <p class="author-meta">By <span class="article-author">${data.author}</span> <span class="meta-divider">|</span> <span class="section-tag">${sectionLabel(section)}</span> <span class="meta-divider">|</span> ${new Date(data.date).toLocaleDateString()}</p>
    <div id="article-hero-img">
      <img src="${data.image}" alt="${data.title}" />
    </div>
    <div id="article-body">
      ${marked.parse(body)}
    </div>
    <div id="author-bio">
      <p id="author-name">${data.author.toUpperCase()}</p>
<p id="author-description">${data.author_role || 'Staff Writer for Visions.'}</p>
    </div>  `
    ;

  // Article bodies can contain embed snippets (Flourish, etc.) with <script>
  // tags. Browsers never execute <script> tags inserted via innerHTML as a
  // security measure, so those embeds silently do nothing unless we manually
  // re-create and re-insert each script tag to force real execution.
  // Article bodies can contain embed snippets (Flourish, etc.) with <script>
  // tags. Browsers never execute <script> tags inserted via innerHTML as a
  // security measure, so those embeds silently do nothing unless we manually
  // re-create and re-insert each script tag to force real execution.
  //
  // SECURITY: only re-execute scripts from an explicit allowlist of known,
  // trusted embed providers. Everything else — inline scripts, scripts from
  // any other origin — is dropped, not executed. Without this, the CMS's
  // "article body" field would be an arbitrary-JavaScript-execution pipeline
  // for anyone with publish access.
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

  document.body.classList.add('content-loaded');
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
        ? `<img src="${a.image}" alt="${a.title}" class="tribute-img" />`
        : `<div class="tribute-img" style="background:#f0f0f0;display:flex;align-items:center;justify-content:center;">
             <span style="font-size:11px;color:#aaa;font-family:Georgia,serif;">No Image</span>
           </div>`
      }
      <div class="tribute-text">
        <span class="tribute-tag">Tribute</span>
        <a href="article.html?section=memorial&slug=${a.slug}">
          <h3 class="tribute-headline">${a.title}</h3>
        </a>
        <p class="tribute-excerpt">${a.summary}</p>
        <p class="tribute-meta">${a.author} <span class="meta-divider">|</span> ${new Date(a.date).toLocaleDateString()}</p>
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
      document.body.classList.add('content-loaded');
    })();
  }
  if (document.getElementById('obituary-tributes')) {
    renderObituaryPage();
  }
  if (document.getElementById('section-main')) {
    renderSectionPage();
  }

  if (document.getElementById('article-container')) {
    renderArticlePage();
  }

  if (document.getElementById('search-results')) {
    renderSearchPage();
  }
});