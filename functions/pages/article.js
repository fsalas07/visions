// Server-renders /pages/article so search engines and link previews (iMessage,
// LinkedIn, Instagram, etc.) get the real headline, summary, image, and text
// in the HTML itself, instead of the placeholder page that js/main.js fills in
// after load. js/main.js still renders the article in the browser exactly as
// before; this only changes what the server sends.
import { marked } from '../_lib/marked.esm.js';
import { SITE_NAME, API_URL, escapeHtml, articleUrl, absoluteUrl } from '../_lib/site.js';

// Mirrors SECTION_LABELS in js/main.js.
const SECTION_LABELS = {
  'arts-culture': 'ARTS &amp; CULTURE',
  'campus-announcements': 'CAMPUS ANNOUNCEMENTS'
};

function sectionLabel(section) {
  return SECTION_LABELS[section] || escapeHtml(section.toUpperCase());
}

export async function onRequestGet({ request, next }) {
  const url = new URL(request.url);
  const section = url.searchParams.get('section');
  const slug = url.searchParams.get('slug');

  // Every article shares one static file, so a conditional request could get
  // a 304 and reuse the cached HTML of a different article. Always fetch it fresh.
  const headers = new Headers(request.headers);
  headers.delete('If-None-Match');
  headers.delete('If-Modified-Since');
  const page = await next(new Request(request.url, { headers }));
  if (!section || !slug) return page;

  let a;
  try {
    const res = await fetch(`${API_URL}?section=${encodeURIComponent(section)}&slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return page;
    a = await res.json();
  } catch {
    return page;
  }
  if (!a || !a.title) return page;

  const canonical = articleUrl(section, slug);
  const image = a.image ? absoluteUrl(a.image) : '';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: a.title,
    description: a.summary,
    datePublished: a.date,
    author: { '@type': 'Person', name: a.author },
    publisher: { '@type': 'Organization', name: SITE_NAME, logo: { '@type': 'ImageObject', url: absoluteUrl('/favicon.png') } },
    mainEntityOfPage: canonical,
    ...(image && { image: [image] })
  };

  const meta = `
    <meta name="description" content="${escapeHtml(a.summary)}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${escapeHtml(a.title)}" />
    <meta property="og:description" content="${escapeHtml(a.summary)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    ${image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : ''}
    <meta property="article:published_time" content="${escapeHtml(a.date)}" />
    <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
  `;

  // Same structure as the template in renderArticlePage() (js/main.js).
  // Scripts are stripped: the browser render re-adds only allowlisted embeds.
  const bodyHtml = marked.parse(a.body || '').replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const date = new Date(a.date).toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  const article = `
    <span class="section-tag">${sectionLabel(section)}</span>
    <h1 id="article-headline">${escapeHtml(a.title)}</h1>
    <p id="article-subheadline">${escapeHtml(a.summary)}</p>
    <p class="author-meta">By <span class="article-author">${escapeHtml(a.author)}</span> <span class="meta-divider">|</span> <span class="section-tag">${sectionLabel(section)}</span> <span class="meta-divider">|</span> ${date}</p>
    <div id="article-hero-img">
      <img src="${escapeHtml(a.image)}" alt="${escapeHtml(a.title)}" />
    </div>
    <div id="article-body">
      ${bodyHtml}
    </div>
    <div id="author-bio">
      <p id="author-name">${escapeHtml(String(a.author || '').toUpperCase())}</p>
      <p id="author-description">${escapeHtml(a.author_role || 'Staff Writer for Visions.')}</p>
    </div>
  `;

  const out = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(`${a.title} | ${SITE_NAME}`); } })
    .on('head', { element(el) { el.append(meta, { html: true }); } })
    .on('#article-container', { element(el) { el.setInnerContent(article, { html: true }); } })
    .transform(page);

  const response = new Response(out.body, out);
  response.headers.delete('ETag');
  return response;
}
