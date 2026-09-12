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

  resultsEl.innerHTML = results.map(a => `
    <div class="list-article">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" class="list-img" />` : ''}
      <div class="list-article-text">
        <span class="section-tag">${a.section.toUpperCase()}</span>
        <a href="${a.url}"><h4 class="list-headline">${a.title}</h4></a>
        <p class="section-article-excerpt">${a.summary}</p>
        <p class="author-meta">${a.author} <span class="meta-divider">|</span> ${new Date(a.date).toLocaleDateString()}</p>
      </div>
    </div>
  `).join('');

  document.body.classList.add('content-loaded');
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
// One featured story (all sections, most recent) plus a river of the next
// most recent stories across every section, including Opinion and Obituary —
// replaces the old news-only hero + features/news hero-bottom + 6-section
// recent-grid, which excluded Opinion and Obituary entirely.
async function renderTopStories() {
  const heroEl = document.getElementById('hero-left');
  const riverEl = document.getElementById('hero-river');
  if (!heroEl && !riverEl) return;

  const all = await fetchAllArticlesFlat();
  // Obituary/Memorial content is kept off the general homepage mix by convention —
  // it stays on its own dedicated page. Still fully searchable elsewhere.
  const eligible = all.filter(a => a.section !== 'memorial');
  const sorted = [...eligible].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (heroEl) {
    const featured = getUnused(sorted).slice(0, 3);
    if (featured.length) {
      markUsed(featured);
      heroEl.innerHTML = featured.map(a => `
        <div class="hero-card">
          <span class="section-tag">${a.section.toUpperCase()}</span>
          <a href="${a.url}"><h1 class="hero-card-headline">${a.title}</h1></a>
          <p class="author-meta">${a.author} <span class="meta-divider">|</span> <span class="section-tag">${a.section.toUpperCase()}</span></p>
          ${a.image ? `<img src="${a.image}" alt="${a.title}" class="hero-card-img" />` : ''}
          <p class="hero-card-excerpt">${a.summary}</p>
        </div>
      `).join('');
    }
  }

  if (riverEl) {
    const remaining = getUnused(sorted).slice(0, 6);
    if (!remaining.length) return;
    markUsed(remaining);
    riverEl.innerHTML = remaining.map(a => `
      <div class="list-article">
        ${a.image ? `<img src="${a.image}" alt="${a.title}" class="list-img" />` : ''}
        <div class="list-article-text">
          <span class="section-tag">${a.section.toUpperCase()}</span>
          <a href="${a.url}"><h4 class="list-headline">${a.title}</h4></a>
          <p class="section-article-excerpt">${a.summary}</p>
          <p class="author-meta">${a.author} <span class="meta-divider">|</span> ${new Date(a.date).toLocaleDateString()}</p>
        </div>
      </div>
    `).join('');
  }
}

// ── RENDER OPINION SIDEBAR ──
async function renderOpinionSidebar() {
  const el = document.getElementById('hero-right');
  if (!el) return;
  const articles = await fetchArticles('opinion');
  const unused = getUnused(articles);
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
  inner.querySelector('.strip-featured').innerHTML = `
    <img src="${featured.image}" alt="${featured.title}" class="strip-img" />
    <p class="author-meta">${featured.author} <span class="meta-divider">|</span> <span class="section-tag">${section.toUpperCase()}</span></p>
    <a href="${featured.url}"><h3 class="strip-featured-headline">${featured.title}</h3></a>
    <p class="strip-featured-excerpt">${featured.summary}</p>
  `;
  inner.querySelector('.strip-list').innerHTML = rest.map(a => `
    <div class="strip-list-article">
      <p class="author-meta">${a.author} <span class="meta-divider">|</span> <span class="section-tag">${section.toUpperCase()}</span></p>
      <a href="${a.url}"><h4 class="strip-list-headline">${a.title}</h4></a>
    </div>
  `).join('');
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
  grid.innerHTML = picked.map(a => `
    <div class="small-article">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" class="small-img" />` : ''}
      <p class="author-meta">${a.author} <span class="meta-divider">|</span> <span class="section-tag">${section.toUpperCase()}</span></p>
      <a href="${a.url}"><h4 class="small-headline">${a.title}</h4></a>
    </div>
  `).join('');
}

// ── RENDER SECTION PAGE ──
async function renderSectionPage() {
  const el = document.getElementById('section-main');
  if (!el) return;
  const titleEl = document.getElementById('section-title');
  if (!titleEl) return;
  const section = titleEl.textContent.toLowerCase().replace(' & ', '-').replace(' ', '-');
  const articles = await fetchArticles(section);
  if (!articles.length) return;

  const top = document.getElementById('section-top');
  if (top && articles[0]) {
    top.querySelector('#section-featured').innerHTML = `
      <img src="${articles[0].image}" alt="${articles[0].title}" class="section-featured-img" />
      <span class="section-tag">${section.toUpperCase()}</span>
      <a href="article.html?section=${section}&slug=${articles[0].slug}"><h2 class="section-featured-headline">${articles[0].title}</h2></a>
      <p class="section-article-excerpt">${articles[0].summary}</p>
      <p class="author-meta">${articles[0].author} <span class="meta-divider">|</span> ${new Date(articles[0].date).toLocaleDateString()}</p>
    `;

    const middle = top.querySelector('#section-middle');
    if (middle) {
      middle.innerHTML = articles.slice(1, 3).map(a => `
        <div class="section-mid-article">
          ${a.image ? `<img src="${a.image}" alt="${a.title}" class="section-mid-img" />` : ''}
          <span class="section-tag">${section.toUpperCase()}</span>
          <a href="article.html?section=${section}&slug=${a.slug}"><h3 class="section-mid-headline">${a.title}</h3></a>
          <p class="section-article-excerpt">${a.summary}</p>
          <p class="author-meta">${a.author} <span class="meta-divider">|</span> ${new Date(a.date).toLocaleDateString()}</p>
        </div>
      `).join('');
    }

    const right = top.querySelector('#section-right');
    if (right) {
      right.innerHTML = articles.slice(3, 7).map(a => `
        <div class="section-text-article">
          <span class="section-tag">${section.toUpperCase()}</span>
          <a href="article.html?section=${section}&slug=${a.slug}"><h4 class="section-text-headline">${a.title}</h4></a>
          <p class="section-article-excerpt">${a.summary}</p>
          <p class="author-meta">${a.author} <span class="meta-divider">|</span> ${new Date(a.date).toLocaleDateString()}</p>
        </div>
      `).join('');
    }
  }

  const row2 = document.getElementById('section-row2');
  if (row2) {
    row2.innerHTML = articles.slice(7, 12).map(a => `
      <div class="row2-article">
        ${a.image ? `<img src="${a.image}" alt="${a.title}" class="row2-img" />` : ''}
        <span class="section-tag">${section.toUpperCase()}</span>
        <a href="article.html?section=${section}&slug=${a.slug}"><h4 class="row2-headline">${a.title}</h4></a>
        <p class="author-meta">${a.author} <span class="meta-divider">|</span> ${new Date(a.date).toLocaleDateString()}</p>
      </div>
    `).join('');
  }

  const list = document.getElementById('section-list');
  if (list) {
    list.innerHTML = articles.slice(12).map(a => `
      <div class="list-article">
        ${a.image ? `<img src="${a.image}" alt="${a.title}" class="list-img" />` : ''}
        <div class="list-article-text">
          <span class="section-tag">${section.toUpperCase()}</span>
          <a href="article.html?section=${section}&slug=${a.slug}"><h4 class="list-headline">${a.title}</h4></a>
          <p class="section-article-excerpt">${a.summary}</p>
          <p class="author-meta">${a.author} <span class="meta-divider">|</span> ${new Date(a.date).toLocaleDateString()}</p>
        </div>
      </div>
    `).join('');
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
    <span class="section-tag">${section.toUpperCase()}</span>
    <h1 id="article-headline">${data.title}</h1>
    <p id="article-subheadline">${data.summary}</p>
    <p class="author-meta">By ${data.author} <span class="meta-divider">|</span> <span class="section-tag">${section.toUpperCase()}</span> <span class="meta-divider">|</span> ${new Date(data.date).toLocaleDateString()}</p>
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