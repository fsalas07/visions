var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/oauth.ts
var OAuthClient = class {
  static {
    __name(this, "OAuthClient");
  }
  constructor(config) {
    this.clientConfig = config;
  }
  authorizeURL(options) {
    const { clientConfig } = this;
    const { tokenHost, authorizePath } = clientConfig.target;
    const { redirect_uri, scope, state } = options;
    return `${tokenHost}${authorizePath}?response_type=code&client_id=${clientConfig.id}&redirect_uri=${redirect_uri}&scope=${scope}&state=${state}`;
  }
  async getToken(options) {
    const { clientConfig } = this;
    const { tokenHost, tokenPath } = clientConfig.target;
    const { code, redirect_uri } = options;
    const response = await fetch(`${tokenHost}${tokenPath}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: clientConfig.id,
        client_secret: clientConfig.secret,
        code,
        redirect_uri,
        grant_type: "authorization_code"
      })
    });
    const json = await response.json();
    return json.access_token;
  }
};

// src/index.ts
function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(randomHex, "randomHex");
var createOAuth = /* @__PURE__ */ __name((env) => {
  return new OAuthClient({
    id: env.GITHUB_OAUTH_ID,
    secret: env.GITHUB_OAUTH_SECRET,
    target: {
      tokenHost: "https://github.com",
      tokenPath: "/login/oauth/access_token",
      authorizePath: "/login/oauth/authorize"
    }
  });
}, "createOAuth");
var handleAuth = /* @__PURE__ */ __name(async (url, env) => {
  const provider = url.searchParams.get("provider");
  if (provider !== "github") {
    return new Response("Invalid provider", { status: 400 });
  }
  const repoIsPrivate = env.GITHUB_REPO_PRIVATE != void 0 && env.GITHUB_REPO_PRIVATE !== "0";
  const repoScope = repoIsPrivate ? "repo" : "public_repo";
  const oauth2 = createOAuth(env);
  // The state is also stored in a cookie so the callback can check that the
  // login it finishes is the one this browser started. A retry (see
  // handleCallback) is marked with a leading "r".
  const state = (url.searchParams.get("retry") === "1" ? "r" : "") + randomHex(16);
  const authorizationUri = oauth2.authorizeURL({
    redirect_uri: `https://${url.hostname}/callback?provider=github`,
    scope: repoScope,
    state
  });
  return new Response(null, {
    headers: {
      location: authorizationUri,
      "Set-Cookie": `decap_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/callback; Max-Age=600`,
      "Cache-Control": "no-store"
    },
    status: 302
  });
}, "handleAuth");
// The only pages allowed to receive the GitHub token: the CMS at /admin/ on
// these origins. Any other page that opens the login popup gets nothing.
var ALLOWED_ORIGINS = ["https://thepanthervision.com", "https://www.thepanthervision.com"];
var callbackScriptResponse = /* @__PURE__ */ __name((status, content) => {
  return new Response(
    `
<html>
<head>
  <script>
    const allowed = ${JSON.stringify(ALLOWED_ORIGINS)};
    const receiveMessage = (message) => {
      if (!allowed.includes(message.origin)) return;
      window.opener.postMessage(
        'authorization:github:${status}:${JSON.stringify(content)}',
        message.origin
      );
      window.removeEventListener("message", receiveMessage, false);
    }
    window.addEventListener("message", receiveMessage, false);
    allowed.forEach((origin) => window.opener.postMessage("authorizing:github", origin));
  <\/script>
  <body>
    <p>Authorizing Decap...</p>
  </body>
</head>
</html>
`,
    { headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } }
  );
}, "callbackScriptResponse");
var handleCallback = /* @__PURE__ */ __name(async (url, env, request) => {
  const provider = url.searchParams.get("provider");
  if (provider !== "github") {
    return new Response("Invalid provider", { status: 400 });
  }
  const state = url.searchParams.get("state") || "";
  const cookie = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)decap_state=([^;]+)/);
  if (!state || !cookie || cookie[1] !== state) {
    // /auth used to answer with a 301, which browsers cache, so an editor's
    // browser can replay an old redirect that has no matching cookie. Start
    // the login again once; if the retry fails too, stop.
    if (state.startsWith("r")) {
      return new Response("Invalid state", { status: 400 });
    }
    return new Response(null, {
      headers: { location: `https://${url.hostname}/auth?provider=github&retry=1`, "Cache-Control": "no-store" },
      status: 302
    });
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return new Response("Missing code", { status: 400 });
  }
  const oauth2 = createOAuth(env);
  const accessToken = await oauth2.getToken({
    code,
    redirect_uri: `https://${url.hostname}/callback?provider=github`
  });
  if (!accessToken) {
    return callbackScriptResponse("error", { message: "GitHub did not return a token" });
  }
  return callbackScriptResponse("success", { token: accessToken });
}, "handleCallback");
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    console.log(`url.pathname is ${url.pathname}`);
    if (url.pathname === "/auth") {
      return handleAuth(url, env);
    }
    if (url.pathname === "/callback") {
      return handleCallback(url, env, request);
    }
    return new Response("Hello \u{1F44B}");
  }
};
export {
  index_default as default
};
