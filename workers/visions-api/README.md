# visions-api Worker

Source of the deployed Cloudflare Worker `visions-api` (https://visions-api.fabiansalas1233.workers.dev/).
It reads article markdown from the `fsalas07/visions` GitHub repo and returns parsed JSON.

Pushing to `main` does **not** deploy this Worker. Deploy it separately (dashboard, `wrangler deploy`, or the Cloudflare API).

Settings that live only in Cloudflare (not in this repo):
- Secret `GITHUB_TOKEN` (keep it when redeploying; with the API, pass `keep_bindings: ["secret_text"]`)
- `compatibility_date`: 2026-05-05, no compatibility flags
- Observability logs enabled

Known limit: `?all=1` makes 8 GitHub list calls plus one fetch per article, all in one request.
The likely cause of the break past ~50 articles is the Workers per-request subrequest cap
(50 on the free plan; not confirmed which plan this account is on).
