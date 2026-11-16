# visions-api Worker

Source of the deployed Cloudflare Worker `visions-api` (https://visions-api.fabiansalas1233.workers.dev/).
It reads article markdown from the `fsalas07/visions` GitHub repo and returns parsed JSON.

Pushing to `main` does **not** deploy this Worker. Deploy it separately (dashboard, `wrangler deploy`, or the Cloudflare API).

Settings that live only in Cloudflare (not in this repo):
- Secret `GITHUB_TOKEN` (keep it when redeploying; with the API, pass `keep_bindings: ["secret_text"]`)
- `compatibility_date`: 2026-05-05, no compatibility flags
- Observability logs enabled

Endpoints: `?section=X` (every article in a section) and `?section=X&slug=Y` (one article).
The old `?all=1` mode was removed: nothing used it, and it failed with error 1101 once
the site passed the per-request subrequest cap (50 on the free plan).

A section listing is one GitHub GraphQL request that returns every file's text, so it
stays under the subrequest cap no matter how many articles a section has. Successful
results are kept in memory for 60 seconds so repeat visits within a minute (on the same Worker instance) do not call GitHub again.
The `GITHUB_TOKEN` secret must be able to read the repo's contents (GraphQL needs a token).
