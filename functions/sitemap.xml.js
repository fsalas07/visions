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

// Article folders from admin/config.yml. Fetched one by one because the API's
// ?all=1 list leaves out newer sections (e.g. campus-announcements).
const SECTIONS = [
  'news', 'sports', 'opinion', 'features', 'multimedia', 'data',
  'arts-culture', 'off-campus', 'campus-announcements', 'memorial'
];

async function fetchSection(section) {
  try {
    const res = await fetch(`${API_URL}?section=${section}`);
    if (!res.ok) return [];
    const articles = await res.json();
    return Array.isArray(articles) ? articles.map(a => ({ ...a, section: a.section || section })) : [];
  } catch {
    return [];
  }
}

export async function onRequest() {
  const articles = (await Promise.all(SECTIONS.map(fetchSection))).flat();

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
