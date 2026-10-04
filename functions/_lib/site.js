// Shared by the Pages Functions in this directory.
export const SITE_URL = 'https://thepanthervision.com';
export const SITE_NAME = 'The Panther Vision';
export const API_URL = 'https://visions-api.fabiansalas1233.workers.dev/';

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Pages serves /pages/article.html at /pages/article (it 308-redirects the
// .html form), so this is the URL search engines should index.
export function articleUrl(section, slug) {
  return `${SITE_URL}/pages/article?section=${encodeURIComponent(section)}&slug=${encodeURIComponent(slug)}`;
}

export function absoluteUrl(path) {
  return /^https?:\/\//.test(path) ? path : SITE_URL + path;
}
