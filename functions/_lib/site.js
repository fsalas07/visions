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

// Same values as _headers (Pages applies that file only to static files).
export const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=2592000',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "frame-ancestors 'self'",
  'Content-Security-Policy-Report-Only': "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://public.flourish.studio https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src https://cdnjs.cloudflare.com https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://visions-api.fabiansalas1233.workers.dev https://wttr.in https://cloudflareinsights.com; frame-src https://www.canva.com https://flo.uri.sh https://www.youtube.com https://www.youtube-nocookie.com; base-uri 'self'; form-action 'self'"
};
