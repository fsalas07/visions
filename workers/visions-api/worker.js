// -- visions-api Worker --
// Fetches article data from the fsalas07/visions GitHub repo and returns
// clean, pre-parsed JSON. Frontmatter parsing happens here (server-side)
// instead of in the browser, so the client never touches raw YAML.
//
// Modes:
//   ?section=X           every article in one section (full body)
//   ?section=X&slug=Y    one article

// -- FRONTMATTER PARSER --
// Dependency-free parser tailored to Decap CMS's YAML output. Handles:
//   - single-line values, with or without a trailing `# comment`
//   - quoted values wrapped across multiple lines ('' and \ escapes)
//   - unquoted plain values wrapped across multiple lines
//   - block scalars (`>`, `|`, with chomping indicators)
// Checked field by field against a real YAML parser on every article in the repo.

// Single-character escapes allowed inside YAML double-quoted scalars.
const YAML_ESCAPES = {
  '0': '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r',
  e: '\x1b', ' ': ' ', '"': '"', '/': '/', '\\': '\\',
  N: '\u0085', _: '\u00a0', L: '\u2028', P: '\u2029'
};

// Index of the closing quote in `s`, or -1 if the value continues on the next line.
// Double quotes escape with backslash; single quotes escape by doubling ('').
function findClosingQuote(s, quoteChar) {
  for (let j = 0; j < s.length; j++) {
    if (quoteChar === '"' && s[j] === '\\') { j++; continue; }
    if (s[j] === quoteChar) {
      if (quoteChar === "'" && s[j + 1] === "'") { j++; continue; }
      return j;
    }
  }
  return -1;
}

function endsWithOddBackslashes(s) {
  let n = 0;
  for (let j = s.length - 1; j >= 0 && s[j] === '\\'; j--) n++;
  return n % 2 === 1;
}

// Reads a quoted scalar starting at `rest` (which begins with the quote).
// Anything after the closing quote (whitespace, a comment) is ignored.
// Returns { value, next } where next is the index of the first unread line.
function readQuoted(lines, i, rest) {
  const quoteChar = rest[0];
  const segs = [];
  let line = rest.slice(1);
  while (true) {
    const close = findClosingQuote(line, quoteChar);
    if (close >= 0) { segs.push(line.slice(0, close)); break; }
    segs.push(line);
    if (i >= lines.length) break;
    line = lines[i++];
  }

  // YAML line folding: a single line break becomes a space, each blank line a
  // newline, and (double quotes only) a line ending in an odd number of
  // backslashes is an escaped line break that joins with nothing.
  const last = segs.length - 1;
  let value = '';
  let blankLines = 0;
  let joinTight = false;
  segs.forEach((seg, k) => {
    let s = k > 0 ? seg.trimStart() : seg;
    if (k < last) s = s.trimEnd();
    if (k > 0 && k < last && s === '') { blankLines++; return; }
    if (k > 0) value += joinTight ? '' : (blankLines ? '\n'.repeat(blankLines) : ' ');
    blankLines = 0;
    joinTight = quoteChar === '"' && k < last && endsWithOddBackslashes(s);
    value += joinTight ? s.slice(0, -1) : s;
  });

  if (quoteChar === '"') {
    value = value.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[\s\S])/g, (m, c) => {
      if (c.length > 1) return String.fromCodePoint(parseInt(c.slice(1), 16));
      return YAML_ESCAPES[c] ?? m;
    });
  } else {
    value = value.replace(/''/g, "'");
  }
  return { value: value.trim(), next: i };
}

// A plain (unquoted) value ends at " #" - YAML treats the rest as a comment.
function stripComment(s) {
  return s.replace(/(^|\s)#.*$/, '').trim();
}

function parseFrontmatterBlock(rawBlock) {
  const lines = rawBlock.split('\n');
  const data = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }

    const keyMatch = line.match(/^([A-Za-z_][\w-]*):[ \t]?(.*)$/);
    if (!keyMatch) { i++; continue; }

    const key = keyMatch[1];
    const rest = keyMatch[2];
    i++;

    // Block scalar: e.g. "summary: >+", "body: |-", "x: >2 # comment"
    const blockScalarMatch = rest.match(/^([>|])[+-]?\d?[+-]?\s*(#.*)?$/);
    if (blockScalarMatch) {
      const isFolded = blockScalarMatch[1] === '>';
      const bodyLines = [];
      while (i < lines.length && (/^\s*$/.test(lines[i]) || /^\s+\S/.test(lines[i]))) {
        bodyLines.push(lines[i]);
        i++;
      }
      const firstText = bodyLines.find(l => /\S/.test(l));
      const indent = firstText ? firstText.match(/^\s*/)[0].length : 0;
      const dedented = bodyLines.map(l => l.slice(Math.min(indent, l.match(/^\s*/)[0].length)));
      let value;
      if (isFolded) {
        // A single line break folds to a space; each blank line is one newline.
        value = '';
        let blankLines = 0;
        for (const l of dedented) {
          if (!/\S/.test(l)) { if (value) blankLines++; continue; }
          if (value) value += blankLines ? '\n'.repeat(blankLines) : ' ';
          value += l.trim();
          blankLines = 0;
        }
      } else {
        value = dedented.join('\n').replace(/\s+$/, '');
      }
      data[key] = value;
      continue;
    }

    // Quoted scalar, possibly spanning multiple lines.
    if (rest.startsWith('"') || rest.startsWith("'")) {
      const { value, next } = readQuoted(lines, i, rest);
      data[key] = value;
      i = next;
      continue;
    }

    // Plain unquoted scalar, possibly wrapped across lines.
    const valueLines = [stripComment(rest)];
    while (i < lines.length) {
      const nextLine = lines[i];
      const isContinuation =
        /^\s+\S/.test(nextLine) &&
        !/^\s*[A-Za-z_][\w-]*:[ \t]/.test(nextLine) &&
        !/^\s*[A-Za-z_][\w-]*:\s*$/.test(nextLine);
      if (!isContinuation) break;
      valueLines.push(stripComment(nextLine));
      i++;
    }
    data[key] = valueLines.filter(Boolean).join(' ');
  }

  return data;
}

function articleLink(section, slug) {
  return `/pages/article.html?section=${encodeURIComponent(section)}&slug=${encodeURIComponent(slug)}`;
}

function parseArticleFile(text, section, slug) {
  // Tolerate a byte-order mark, Windows line endings, and a file that ends
  // right after the closing `---`.
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n([\s\S]*))?$/);
  if (!match) return null;
  const data = parseFrontmatterBlock(match[1]);
  return {
    title: data.title || '',
    author: data.author || '',
    author_role: data.author_role || '',
    date: data.date || '',
    summary: data.summary || '',
    image: data.image || '',
    image_caption: data.image_caption || '',
    homepage_priority: data.homepage_priority || 'Normal',
    section,
    slug,
    url: articleLink(section, slug),
    body: match[2] || ''
  };
}

// Newest first; articles with a missing or invalid date go last.
function byDateDesc(a, b) {
  const t = s => { const n = Date.parse(s); return isNaN(n) ? 0 : n; };
  return t(b.date) - t(a.date);
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

function jsonResponse(body, status, cacheSeconds) {
  const headers = { ...CORS_HEADERS };
  if (cacheSeconds) headers['Cache-Control'] = `public, max-age=${cacheSeconds}`;
  return new Response(JSON.stringify(body), { status, headers });
}

// -- IN-MEMORY CACHE --
// workers.dev has no edge cache, so successful GitHub results are kept in the
// isolate's memory for a minute. Without this every visitor costs one GitHub
// API call per section, which runs into GitHub's hourly rate limit.
const CACHE_TTL_MS = 60 * 1000;
const memoryCache = new Map();

async function cached(key, load) {
  const hit = memoryCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await load();
  if (value.status === null) memoryCache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

const RAW_BASE = 'https://raw.githubusercontent.com/fsalas07/visions/main/_articles';

// Fetches and parses every article in one section. Returns { articles, status }.
// status is null on success; otherwise the HTTP status to return.
//
// Uses one GitHub GraphQL request that returns every file's text, instead of a
// directory listing plus one fetch per article: Cloudflare caps subrequests per
// request (50 on the free plan), so the old way broke once a section reached
// about 50 articles.
// Looks up `main:<path>` in the repo with one GraphQL request.
// Returns { object, status }: object is null when the path doesn't exist.
async function fetchRepoObject(path, fields, env) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `bearer ${env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'visions-app'
    },
    body: JSON.stringify({
      query: `query($expr: String!) {
        repository(owner: "fsalas07", name: "visions") {
          object(expression: $expr) { ${fields} }
        }
      }`,
      variables: { expr: `main:${path}` }
    })
  });
  if (!res.ok) return { object: null, status: res.status };
  const json = await res.json();
  if (json.errors || !json.data || !json.data.repository) return { object: null, status: 502 };
  return { object: json.data.repository.object, status: null };
}

async function fetchSectionArticles(section, env) {
  const { object: tree, status } = await fetchRepoObject(`_articles/${section}`,
    '... on Tree { entries { name type object { ... on Blob { text isTruncated } } } }', env);
  if (status) return { articles: [], status };
  if (!tree || !Array.isArray(tree.entries)) return { articles: [], status: 404 };

  const mdFiles = tree.entries.filter(e => e.type === 'blob' && e.name.endsWith('.md'));
  const articles = (await Promise.all(mdFiles.map(async e => {
    const slug = e.name.replace(/\.md$/, '');
    let text = e.object && e.object.text;
    // GraphQL leaves out the text of very large files; fetch those directly.
    if (text == null || e.object.isTruncated) {
      const fileRes = await fetch(`${RAW_BASE}/${section}/${encodeURIComponent(e.name)}`);
      if (!fileRes.ok) return null;
      text = await fileRes.text();
    }
    return parseArticleFile(text, section, slug);
  }))).filter(Boolean);

  articles.sort(byDateDesc);
  return { articles, status: null };
}

// Read through GraphQL rather than raw.githubusercontent.com, whose CDN can
// serve the old text for several minutes after an edit.
async function fetchSingleArticle(section, slug, env) {
  const { object: blob, status } = await fetchRepoObject(`_articles/${section}/${slug}.md`,
    '... on Blob { text isTruncated }', env);
  if (status) return { article: null, status };
  if (!blob) return { article: null, status: 404 };
  let text = blob.text;
  if (text == null || blob.isTruncated) {
    const res = await fetch(`${RAW_BASE}/${section}/${encodeURIComponent(slug)}.md`);
    if (!res.ok) return { article: null, status: res.status };
    text = await res.text();
  }
  const article = parseArticleFile(text, section, slug);
  if (!article) return { article: null, status: 500 };
  return { article, status: null };
}

async function handle(request, env) {
  const url = new URL(request.url);
  const section = url.searchParams.get('section');
  const slug = url.searchParams.get('slug');

  if (!section) return jsonResponse({ error: 'Missing section parameter' }, 400);

  // Section folders are lowercase slugs; slugs are file names. Rejecting
  // anything else keeps requests inside _articles/.
  if (!/^[a-z0-9-]+$/.test(section) || (slug !== null && (!slug || /[\/\\]|^\.+$/.test(slug)))) {
    return jsonResponse({ error: 'Invalid section or slug' }, 400);
  }

  // -- SINGLE ARTICLE MODE --
  if (slug) {
    const { article, status } = await cached(`article:${section}/${slug}`, () => fetchSingleArticle(section, slug, env));
    if (status === 500) return jsonResponse({ error: 'Malformed article file' }, 500);
    if (status) return jsonResponse({ error: 'Article not found' }, status);
    return jsonResponse(article, 200, 60);
  }

  // -- SECTION LISTING MODE --
  const { articles, status } = await cached(`section:${section}`, () => fetchSectionArticles(section, env));
  if (status) return jsonResponse({ error: 'Upstream GitHub error' }, status);
  return jsonResponse(articles, 200, 60);
}

export default {
  async fetch(request, env) {
    // Any unexpected failure still returns JSON with the CORS header, so the
    // browser sees an error response instead of a blocked request.
    try {
      return await handle(request, env);
    } catch (err) {
      return jsonResponse({ error: 'Worker error', detail: String(err && err.message || err) }, 502);
    }
  }
};
