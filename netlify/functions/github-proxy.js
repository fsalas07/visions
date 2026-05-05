const fetch = require('node-fetch');

exports.handler = async function(event) {
  const section = event.queryStringParameters.section;
  const token = process.env.GITHUB_TOKEN;

  if (!section) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing section parameter' })
    };
  }

  const url = `https://api.github.com/repos/fsalas07/visions/contents/_articles/${section}?ref=main`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  const data = await res.json();

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  };
};