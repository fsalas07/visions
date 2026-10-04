// Builds /sitemap.xml on request from the article API, so every article
// published through the CMS is listed automatically.
import { SITE_URL, API_URL, escapeHtml, articleUrl } from './_lib/site.js';

const STATIC_PAGES = [
  '/',
  '/pages/news',
  '/pages/sports',
  '/pages/opinion',
  '/pages/features',
  '/pages/multimedia',
  '/pages/data',
  '/pages/arts-culture',
  '/pages/off-campus',
  '/pages/campus-announcements',
  '/pages/obituary',
  '/pages/about',
  '/pages/staff',
  '/pages/masthead',
  '/pages/write-for-us',
  '/pages/contact',
  '/pages/advertise',
  '/pages/privacy',
  '/pages/terms'
];

export async function onRequest() {
  let articles = [];
  try {
    const res = await fetch(`${API_URL}?all=1`);
    if (res.ok) articles = await res.json();
  } catch {}
  if (!Array.isArray(articles)) articles = [];

  const urls = [
    ...STATIC_PAGES.map(path => `  <url><loc>${SITE_URL}${path}</loc></url>`),
    ...articles.map(a => {
      const date = new Date(a.date);
      const lastmod = isNaN(date) ? '' : `<lastmod>${date.toISOString()}</lastmod>`;
      return `  <url><loc>${escapeHtml(articleUrl(a.section, a.slug))}</loc>${lastmod}</url>`;
    })
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
