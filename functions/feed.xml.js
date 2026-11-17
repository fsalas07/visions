// RSS feed at /feed.xml: the 30 newest stories across every section except
// the memorial pages (which stay off the homepage too).
import { SITE_URL, SITE_NAME, API_URL, escapeHtml, articleUrl } from './_lib/site.js';

const SECTIONS = [
  'news', 'sports', 'opinion', 'features', 'multimedia', 'data',
  'arts-culture', 'off-campus', 'campus-announcements'
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
  const articles = (await Promise.all(SECTIONS.map(fetchSection))).flat()
    .map(a => ({ ...a, time: Date.parse(a.date) }))
    .filter(a => !isNaN(a.time))
    .sort((a, b) => b.time - a.time)
    .slice(0, 30);

  const items = articles.map(a => {
    const link = escapeHtml(articleUrl(a.section, a.slug));
    return `    <item>
      <title>${escapeHtml(a.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(a.time).toUTCString()}</pubDate>
      <dc:creator>${escapeHtml(a.author)}</dc:creator>
      <category>${escapeHtml(a.section)}</category>
      <description>${escapeHtml(a.summary)}</description>
    </item>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${SITE_NAME}</title>
    <link>${SITE_URL}/</link>
    <description>The student-run newspaper of Passaic County Community College.</description>
    <language>en-us</language>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${items.join('\n')}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900'
    }
  });
}
