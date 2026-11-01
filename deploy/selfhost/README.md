# Self-hosted XActions (dashboard + worker + MCP + CLI)

One Docker host, built from this checkout (Compose project `xactions-selfhost`).
The same setup runs on Debian 13 / Docker 29 behind an nginx (SWAG) HTTPS
reverse proxy.

```sh
cd deploy/selfhost
./bin/init-env                 # .env with random secrets, mode 0600
$EDITOR .env                   # PUBLIC_URL, TRUST_PROXY, BIND_ADDR
docker compose up -d --build
```

| Service | Port | Purpose |
|---|---|---|
| `api` | 3001 | Dashboard and REST API; applies Prisma migrations on start |
| `worker` | — | Job queue: runs dashboard operations in headless Chromium |
| `mcp` | 8787 | MCP server (Streamable HTTP, `/mcp`, Bearer `XACTIONS_MCP_TOKEN`) |
| `postgres`, `redis` | — | Not published |

## Reverse proxy

Serve both over HTTPS. Over plain `http://` on a non-localhost address the
dashboard's CSP (`upgrade-insecure-requests`) makes the browser upgrade API
calls to HTTPS, and the login form fails with "Sign-in is temporarily
unavailable…".

The MCP SDK rejects any `Host` other than `localhost` (DNS-rebinding guard),
including on `/health`, so the proxy must rewrite it. Disable buffering for
the streaming responses. nginx:

```nginx
# dashboard
location / {
    proxy_pass http://DOCKER_HOST:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;          # Socket.IO
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# MCP (separate server block / hostname)
location / {
    proxy_pass http://DOCKER_HOST:8787;
    proxy_http_version 1.1;
    proxy_set_header Host localhost;
    proxy_set_header Connection "";
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 3600;
}
```

Set `BIND_ADDR` to the Docker host's LAN address when the proxy runs on
another machine, `PUBLIC_URL` to the dashboard's HTTPS origin, and
`TRUST_PROXY` to the proxy's IP.

## Connecting an X account

Copy the `auth_token` cookie from a logged-in x.com tab (DevTools →
Application → Cookies → `https://x.com`). Logging out of that browser session
invalidates it.

- **Dashboard:** create a local account (Sign up), then paste the token in
  *Connect Your X Account*. The server opens x.com to validate it (~20 s) and
  stores it encrypted. Start with *Detect Unfollowers* (read-only) and use
  *Dry run* with a small limit before any real unfollow. The *Waiting for
  Browser* panel belongs to the console-agent mode, which x.com's own CSP
  blocks; dashboard operations do not need it.
- **MCP and CLI:** `./bin/set-x-cookie` (reads without echo, recreates `mcp`),
  then `./bin/xactions whoami`.

"Sign in with X" needs an X developer OAuth 2.0 app
(`TWITTER_CLIENT_ID`/`TWITTER_CLIENT_SECRET`, callback
`<PUBLIC_URL>/api/twitter/callback`), not wired into this compose.

## MCP clients

```sh
TOKEN=$(grep ^XACTIONS_MCP_TOKEN= deploy/selfhost/.env | cut -d= -f2-)
claude mcp add --transport http --scope user xactions https://MCP_HOST/mcp \
  --header "Authorization: Bearer $TOKEN"
unset TOKEN
```

With `XACTIONS_MCP_REQUIRE_APPROVAL=1` (the default here), write tools
(post, like, follow, unfollow, DM…) are stored as drafts:
`./bin/xactions drafts list`, `./bin/xactions drafts approve <id>`.
Claude Desktop cannot reach a private URL through remote connectors; bridge it
with `npx mcp-remote <url> --header "Authorization:${AUTH}"`.

## Notes

- Data lives in the `postgres`, `redis` and `home` volumes; back them up.
- x402 payments stay disabled (no wallet). The API logs a configuration error
  about it at startup; that is expected.
- Telemetry is off (`XACTIONS_NO_TELEMETRY=1`).
