// ── visions-api Worker ──
// Fetches article data from the fsalas07/visions GitHub repo and returns
// clean, pre-parsed JSON. Frontmatter parsing happens here (server-side)
// instead of in the browser, so the client never touches raw YAML.

// All section folders that exist under _articles/. Used by the "all" mode
// (site-wide search) to fetch every article across every section at once.
const ALL_SECTIONS = ['news', 'sports', 'opinion', 'features', 'multimedia', 'data', 'arts-culture', 'memorial'];

// ── FRONTMATTER PARSER ──
// Dependency-free parser tailored to Decap CMS's YAML output. Handles:
//   - single-line values
//   - quoted values wrapped across multiple lines
//   - unquoted plain values wrapped across multiple lines
//   - folded block scalars (`>`, `>+`, `>-`)
// Tested against all 28 live articles in the repo before deployment.

function endsWithUnescapedQuote(str, quoteChar) {
  if (!str.endsWith(quoteChar)) return false;
  let backslashes = 0;
  for (let j = str.length - 2; j >= 0 && str[j] === '\\'; j--) backslashes++;
  return backslashes % 2 === 0;
}

// Single-character escapes allowed inside YAML double-quoted scalars.
const YAML_ESCAPES = {
  '0': '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r',
  e: '\x1b', ' ': ' ', '"': '"', '/': '/', '\\': '\\',
  N: '\u0085', _: '\u00a0', L: '\u2028', P: '\u2029'
};

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
    let rest = keyMatch[2];
    i++;

    // Block scalar: e.g. "summary: >+"
    const blockScalarMatch = rest.match(/^([>|][+-]?)\s*$/);
    if (blockScalarMatch) {
      const isFolded = blockScalarMatch[1][0] === '>';
      const bodyLines = [];
      while (i < lines.length && (lines[i] === '' || /^\s+\S/.test(lines[i]))) {
        bodyLines.push(lines[i].replace(/^  /, ''));
        i++;
      }
      let value;
      if (isFolded) {
        value = bodyLines.join('\n')
          .split(/\n{2,}/)
          .map(para => para.replace(/\n/g, ' ').trim())
          .join('\n\n')
          .trim();
      } else {
        value = bodyLines.join('\n').replace(/\s+$/, '');
      }
      data[key] = value;
      continue;
    }

    // Quoted scalar, possibly spanning multiple lines.
    if (rest.startsWith('"') || rest.startsWith("'")) {
      const quoteChar = rest[0];
      let content = rest.slice(1);
      let closed = false;
      let valueLines = [];

      if (endsWithUnescapedQuote(content, quoteChar)) {
        valueLines.push(content.slice(0, -1));
        closed = true;
      } else {
        valueLines.push(content);
      }

      while (!closed && i < lines.length) {
        let l = lines[i];
        i++;
        if (endsWithUnescapedQuote(l, quoteChar)) {
          valueLines.push(l.slice(0, -1).trim());
          closed = true;
        } else {
          valueLines.push(l.trim());
        }
      }

      let value;
      if (quoteChar === '"') {
        // A line ending in an odd number of backslashes is a YAML escaped
        // line break: drop the backslash and join with no space. Then decode
        // the standard double-quoted escapes.
        value = '';
        let glue = '';
        for (const vl of valueLines) {
          value += glue;
          let bs = 0;
          for (let j = vl.length - 1; j >= 0 && vl[j] === '\\'; j--) bs++;
          if (bs % 2 === 1) { value += vl.slice(0, -1); glue = ''; }
          else { value += vl; glue = ' '; }
        }
        value = value.trim().replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[\s\S])/g, (m, c) => {
          if (c.length > 1) return String.fromCodePoint(parseInt(c.slice(1), 16));
          return YAML_ESCAPES[c] ?? m;
        });
      } else {
        value = valueLines.join(' ').trim().replace(/''/g, "'");
      }
      data[key] = value;
      continue;
    }

    // Plain unquoted scalar, possibly wrapped across lines.
    let valueLines = [rest];
    while (i < lines.length) {
      const nextLine = lines[i];
      const isContinuation =
        /^\s+\S/.test(nextLine) &&
        !/^\s*[A-Za-z_][\w-]*:[ \t]/.test(nextLine) &&
        !/^\s*[A-Za-z_][\w-]*:\s*$/.test(nextLine);
      if (isContinuation) {
        valueLines.push(nextLine.trim());
        i++;
      } else {
        break;
      }
    }
    data[key] = valueLines.join(' ').trim();
  }

  return data;
}

function parseArticleFile(text, section, slug) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
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
    url: `/pages/article.html?section=${section}&slug=${slug}`,
    body: match[2]
  };
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

// Fetches and parses every article in one section. Returns { articles, status }.
// status is null on success; on failure it's the upstream HTTP status so the
// caller can decide whether to propagate it or treat it as "no articles."
async function fetchSectionArticles(section, env) {
  const listUrl = `https://api.github.com/repos/fsalas07/visions/contents/_articles/${section}?ref=main`;
  const listRes = await fetch(listUrl, {
    headers: {
      'Authorization': `token ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'visions-app'
    }
  });

  if (!listRes.ok) {
    return { articles: [], status: listRes.status };
  }

  const files = await listRes.json();
  if (!Array.isArray(files)) {
    return { articles: [], status: 502 };
  }

  const mdFiles = files.filter(f => f.name.endsWith('.md'));

  const articles = (await Promise.all(
    mdFiles.map(async f => {
      const fileRes = await fetch(f.download_url);
      if (!fileRes.ok) return null;
      const text = await fileRes.text();
      return parseArticleFile(text, section, f.name.replace('.md', ''));
    })
  )).filter(Boolean);

  return { articles, status: null };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const section = url.searchParams.get('section');
    const slug = url.searchParams.get('slug');
    const all = url.searchParams.get('all');

    // ── SITE-WIDE MODE (for search) — every article, every section, full body ──
    if (all) {
      const results = await Promise.all(
        ALL_SECTIONS.map(sec => fetchSectionArticles(sec, env))
      );

      // Auth/rate-limit failures affect every section identically — surface
      // immediately rather than silently returning an empty result set.
      const authFailure = results.find(r => r.status === 401 || r.status === 403);
      if (authFailure) {
        return jsonResponse({ error: 'Upstream GitHub auth error' }, authFailure.status);
      }

      const flat = results.flatMap(r => r.articles);
      flat.sort((a, b) => new Date(b.date) - new Date(a.date));

      return new Response(JSON.stringify(flat), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=60' }
      });
    }

    if (!section) {
      return jsonResponse({ error: 'Missing section parameter' }, 400);
    }

    // ── SINGLE ARTICLE MODE ──
    if (slug) {
      const rawUrl = `https://raw.githubusercontent.com/fsalas07/visions/main/_articles/${section}/${slug}.md`;
      const res = await fetch(rawUrl);

      if (!res.ok) {
        return jsonResponse({ error: 'Article not found' }, res.status);
      }

      const text = await res.text();
      const article = parseArticleFile(text, section, slug);

      if (!article) {
        return jsonResponse({ error: 'Malformed article file' }, 500);
      }

      return new Response(JSON.stringify(article), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=60' }
      });
    }

    // ── SECTION LISTING MODE ──
    const { articles, status } = await fetchSectionArticles(section, env);
    if (status) {
      return jsonResponse({ error: 'Upstream GitHub error' }, status);
    }

    articles.sort((a, b) => new Date(b.date) - new Date(a.date));

    return new Response(JSON.stringify(articles), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=60' }
    });
  }
};
