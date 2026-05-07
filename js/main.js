// ── CONFIG ──
const GITHUB_USER = 'fsalas07';
const GITHUB_REPO = 'visions';
const BRANCH = 'main';

// ── ARTICLE TRACKER ──
const usedArticles = new Set();

function getUnused(articles) {
  return articles.filter(a => !usedArticles.has(`${a.section}-${a.slug}`));
}

function markUsed(articles) {
  articles.forEach(a => usedArticles.add(`${a.section}-${a.slug}`));
}

// ── FETCH ARTICLES FROM GITHUB ──
async function fetchArticles(section) {
  const cacheKey = `articles-${section}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);

  const res = await fetch(`https://visions-api.fabiansalas1233.workers.dev/?section=${section}`);
  const files = await res.json();
  if (!Array.isArray(files)) return [];
  const articles = await Promise.all(
    files
      .filter(f => f.name.endsWith('.md'))
      .map(async f => {
        const fileRes = await fetch(f.download_url);
        const text = await fileRes.text();
        return parseFrontmatter(text, section, f.name);
      })
  );
  const sorted = articles.sort((a, b) => new Date(b.date) - new Date(a.date));
  sessionStorage.setItem(cacheKey, JSON.stringify(sorted));
  return sorted;
}

// ── PARSE FRONTMATTER ──
function parseFrontmatter(text, section, filename) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const raw = match[1];
  const data = {};
  raw.split('\n').forEach(line => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      data[key.trim()] = rest.join(':').trim().replace(/^["']|["']$/g, '');
    }
  });
  data.section = section;
  data.slug = filename.replace('.md', '');
  data.url = `/pages/article.html?section=${section}&slug=${data.slug}`;
  return data;
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
async function renderHero() {
  const el = document.getElementById('hero-left');
  if (!el) return;
  const articles = await fetchArticles('news');
  const unused = getUnused(articles);
  if (!unused.length) return;
  const a = unused[0];
  markUsed([a]);
  el.innerHTML = `
    <span class="section-tag">${a.section.toUpperCase()}</span>
    <a href="${a.url}"><h1 id="hero-headline">${a.title}</h1></a>
    <p class="author-meta">${a.author} <span class="meta-divider">|</span> <span class="section-tag">${a.section.toUpperCase()}</span></p>
    <img src="${a.image}" alt="${a.title}" id="hero-img" />
    <p id="hero-excerpt">${a.summary}</p>
  `;

  const mid = document.getElementById('hero-middle');
  if (mid) {
    const midUnused = getUnused(articles);
    const mid1 = midUnused[0];
    const mid2 = midUnused[1];
    if (mid1 && mid2) {
      markUsed([mid1, mid2]);
      mid.innerHTML = `
        <div class="mid-article">
          <h2 class="mid-headline"><a href="${mid1.url}">${mid1.title}</a></h2>
          <p class="author-meta">${mid1.author} <span class="meta-divider">|</span> <span class="section-tag">NEWS</span></p>
          <p class="mid-excerpt">${mid1.summary}</p>
        </div>
        <hr class="article-divider">
        <div class="mid-article">
          <h2 class="mid-headline"><a href="${mid2.url}">${mid2.title}</a></h2>
          <p class="author-meta">${mid2.author} <span class="meta-divider">|</span> <span class="section-tag">NEWS</span></p>
          <p class="mid-excerpt">${mid2.summary}</p>
        </div>
      `;
    }
  }
}

// ── RENDER HERO BOTTOM ──
async function renderHeroBottom() {
  const left = document.querySelector('#hero-bottom .bottom-article:first-child');
  const right = document.querySelector('#hero-bottom .bottom-article:last-child');
  if (!left || !right) return;

  const features = await fetchArticles('features');
  const news = await fetchArticles('news');

  const unusedFeatures = getUnused(features);
  const unusedNews = getUnused(news);

  if (unusedFeatures[0]) {
    const a = unusedFeatures[0];
    markUsed([a]);
    left.innerHTML = `
      <span class="section-tag">FEATURES</span>
      <a href="pages/article.html?section=features&slug=${a.slug}"><h2 class="bottom-headline">${a.title}</h2></a>
      <p class="author-meta">${a.author} <span class="meta-divider">|</span> <span class="section-tag">FEATURES</span></p>
      <img src="${a.image}" alt="${a.title}" class="bottom-img" />
    `;
  }

  if (unusedNews[0]) {
    const a = unusedNews[0];
    markUsed([a]);
    right.innerHTML = `
      <span class="section-tag">NEWS</span>
      <a href="pages/article.html?section=news&slug=${a.slug}"><h2 class="bottom-headline">${a.title}</h2></a>
      <p class="author-meta">${a.author} <span class="meta-divider">|</span> <span class="section-tag">NEWS</span></p>
      <img src="${a.image}" alt="${a.title}" class="bottom-img" />
    `;
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

// ── RENDER RECENT GRID ──
async function renderRecentGrid() {
  const el = document.getElementById('recent-grid');
  if (!el) return;
  const sections = ['news', 'sports', 'features', 'data', 'arts-culture', 'multimedia'];
  const all = (await Promise.all(sections.map(s => fetchArticles(s)))).flat();
  all.sort((a, b) => new Date(b.date) - new Date(a.date));
  const unused = getUnused(all);
  const recent = unused.slice(0, 6);
  if (!recent.length) return;
  markUsed(recent);
  el.innerHTML = recent.map((a, i) => `
    <div class="recent-article ${i === 0 ? 'span-2' : ''}">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" class="recent-img ${i === 0 ? '' : ''}" />` : ''}
      <p class="author-meta">${a.author} <span class="meta-divider">|</span> <span class="section-tag">${a.section.toUpperCase()}</span></p>
      <a href="${a.url}"><h3 class="recent-headline">${a.title}</h3></a>
      <p class="recent-excerpt">${a.summary}</p>
    </div>
  `).join('');
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
    <p class="recent-excerpt">${featured.summary}</p>
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
  }

  const row2 = document.getElementById('section-row2');
  if (row2) {
    row2.innerHTML = articles.slice(1, 6).map(a => `
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
    list.innerHTML = articles.slice(6).map(a => `
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
}

// ── RENDER ARTICLE PAGE ──
async function renderArticlePage() {
  const el = document.getElementById('article-container');
  if (!el) return;
  const params = new URLSearchParams(window.location.search);
  const section = params.get('section');
  const slug = params.get('slug');
  if (!section || !slug) return;

  const url = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${BRANCH}/_articles/${section}/${slug}.md`;
  const res = await fetch(url);
  if (!res.ok) return;
  const text = await res.text();

  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return;

  const data = parseFrontmatter(text, section, slug + '.md');
  const body = match[2];

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
      <p id="author-description">Staff writer for Visions.</p>
    </div>
  `;
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  setDate();
  setWeather();

if (document.getElementById('hero-left')) {
    Promise.all([
      renderHero(),
      renderHeroBottom(),
      renderOpinionSidebar(),
      renderRecentGrid(),
      renderLargeStrip('news', 'news-strip'),
      renderLargeStrip('opinion', 'opinion-strip'),
      renderSmallStrip('sports', 'sports-strip'),
      renderSmallStrip('features', 'features-strip'),
      renderSmallStrip('data', 'data-strip'),
      renderSmallStrip('multimedia', 'multimedia-strip'),
    ]).then(() => {
      document.body.classList.add('content-loaded');
    });
  }

  if (document.getElementById('section-main')) {
    renderSectionPage();
  }

  if (document.getElementById('article-container')) {
    renderArticlePage();
  }
});