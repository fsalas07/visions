// ── CONFIG ──
const GITHUB_USER = 'fsalas07';
const GITHUB_REPO = 'visions';
const BRANCH = 'main';

// ── FETCH ARTICLES FROM GITHUB ──
const GITHUB_TOKEN = '';

async function fetchArticles(section) {
  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/_articles/${section}?ref=${BRANCH}`;
const res = await fetch(`https://visions-api.fabiansalas1233.workers.dev/?section=${section}`);  const files = await res.json();
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
  return articles.sort((a, b) => new Date(b.date) - new Date(a.date));
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
  if (!articles.length) return;
  const a = articles[0];
  el.innerHTML = `
    <span class="section-tag">${a.section.toUpperCase()}</span>
    <a href="${a.url}"><h1 id="hero-headline">${a.title}</h1></a>
    <p class="author-meta">${a.author} <span class="meta-divider">|</span> <span class="section-tag">${a.section.toUpperCase()}</span></p>
    <img src="${a.image}" alt="${a.title}" id="hero-img" />
    <p id="hero-excerpt">${a.summary}</p>
  `;
async function renderHeroBottom() {
  const left = document.querySelector('#hero-bottom .bottom-article:first-child');
  const right = document.querySelector('#hero-bottom .bottom-article:last-child');
  if (!left || !right) return;

  const features = await fetchArticles('features');
  const news = await fetchArticles('news');

  if (features[0]) {
    const a = features[0];
    left.innerHTML = `
      <span class="section-tag">FEATURES</span>
      <a href="pages/article.html?section=features&slug=${a.slug}"><h2 class="bottom-headline">${a.title}</h2></a>
      <p class="author-meta">${a.author} <span class="meta-divider">|</span> <span class="section-tag">FEATURES</span></p>
      <img src="${a.image}" alt="${a.title}" class="bottom-img" />
    `;
  }

  if (news[0]) {
    const a = news[0];
    right.innerHTML = `
      <span class="section-tag">NEWS</span>
      <a href="pages/article.html?section=news&slug=${a.slug}"><h2 class="bottom-headline">${a.title}</h2></a>
      <p class="author-meta">${a.author} <span class="meta-divider">|</span> <span class="section-tag">NEWS</span></p>
      <img src="${a.image}" alt="${a.title}" class="bottom-img" />
    `;
  }
}
  const mid = document.getElementById('hero-middle');
  if (mid && articles[1] && articles[2]) {
    mid.innerHTML = `
      <div class="mid-article">
        <h2 class="mid-headline"><a href="${articles[1].url}">${articles[1].title}</a></h2>
        <p class="author-meta">${articles[1].author} <span class="meta-divider">|</span> <span class="section-tag">NEWS</span></p>
        <p class="mid-excerpt">${articles[1].summary}</p>
      </div>
      <hr class="article-divider">
      <div class="mid-article">
        <h2 class="mid-headline"><a href="${articles[2].url}">${articles[2].title}</a></h2>
        <p class="author-meta">${articles[2].author} <span class="meta-divider">|</span> <span class="section-tag">NEWS</span></p>
        <p class="mid-excerpt">${articles[2].summary}</p>
      </div>
    `;
  }
}

// ── RENDER OPINION SIDEBAR ──
async function renderOpinionSidebar() {
  const el = document.getElementById('hero-right');
  if (!el) return;
  const articles = await fetchArticles('opinion');
  if (!articles.length) return;
  const items = articles.slice(0, 5).map(a => `
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
  const recent = all.slice(0, 6);
  if (!recent.length) return;
  el.innerHTML = recent.map((a, i) => `
    <div class="recent-article ${i === 0 ? 'span-2' : ''}">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" class="recent-img" />` : ''}
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
  if (!articles.length) return;
  const featured = articles[0];
  const rest = articles.slice(1, 5);
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
  if (!articles.length) return;
  const grid = el.querySelector('.small-strip-grid');
  if (!grid) return;
  grid.innerHTML = articles.slice(0, 2).map(a => `
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
  console.log('Fetching:', url);
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
    renderHero();
    renderHeroBottom(); 
    renderOpinionSidebar();
    renderRecentGrid();
    renderLargeStrip('news', 'news-strip');
    renderLargeStrip('opinion', 'opinion-strip');
    renderSmallStrip('sports', 'sports-strip');
    renderSmallStrip('features', 'features-strip');
    renderSmallStrip('data', 'data-strip');
    renderSmallStrip('multimedia', 'multimedia-strip');
  }

  if (document.getElementById('section-main')) {
    renderSectionPage();
  }

  if (document.getElementById('article-container')) {
    renderArticlePage();
  }
});