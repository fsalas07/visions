export async function onRequest(context) {
  const section = new URL(context.request.url).searchParams.get('section');
  const token = context.env.GITHUB_TOKEN;

  if (!section) {
    return new Response(JSON.stringify({ error: 'Missing section parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = `https://api.github.com/repos/fsalas07/visions/contents/_articles/${section}?ref=main`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  const data = await res.json();

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}