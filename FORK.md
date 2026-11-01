# About this fork

Fork of [nirholas/XActions](https://github.com/nirholas/XActions) at upstream
`bd18470` (2026-10-31), with fixes found while self-hosting the dashboard,
worker and MCP server. The changes are kept as small, separate commits on top
of upstream so they can be rebased or sent upstream.

## Fixes

| Area | Problem upstream | Fix |
|---|---|---|
| Docker build | `npm ci` fails on `node:22-slim`: better-sqlite3 13.0.3 has no prebuilt binary for the Node 22 patch release and node-gyp finds no Python/compiler | `python3 make g++` in the deps stage only |
| Dashboard CSP | helmet's default `script-src-attr 'none'` blocks the ~530 inline `onclick` handlers: Sign up, Sign in with X and most buttons do nothing | `scriptSrcAttr: ['unsafe-inline']` (`script-src` already allows it) |
| Automation engine | 275e00a removed the `BrowserAutomation` class methods that `session-auth.js` and every engine in `api/services/operations/puppeteer/` call: saving a session and every dashboard operation failed with a TypeError (500) | Restored `checkAuthentication`, `navigateToTwitter`, `getFollowing`, `getFollowers`, `unfollowUser` (+ `getOwnUsername`); methods that never existed now throw an explicit error |
| Unfollow safety | The unfollow engines ignored `dryRun`, `maxUnfollows` and Stop: "dry run, max 100" unfollowed every match | Both engines honour all three; the handle is detected when none was saved |
| Session cookie | Cookie pasted as `auth_token=…` was rejected; username was required in practice | Prefix stripped; handle read from x.com |
| Dashboard | The connect card markup was gone (no way to add a session); the Socket.IO client raced `initSocket()` (`io is not defined`) | Card restored (session cookie); client loaded from the server synchronously |

Tests: `tests/api/unfollowEngines.test.js`.

## Still not working (unchanged from upstream)

- `autoLike`, `autoComment`, `keywordFollow` and `followEngagers` through the
  dashboard worker: their browser helpers never existed. Use the MCP server or
  the CLI, which implement these actions.
- "Connect Browser" / the console agent: x.com's CSP blocks loading
  `cdn.socket.io` and connecting to another host from its pages.
- "Sign in with X" needs your own X developer OAuth app.

## Self-hosting

See [`deploy/selfhost/`](deploy/selfhost/README.md): Compose for API, worker,
MCP (+ CLI) and databases, reverse-proxy notes (HTTPS, MCP `Host: localhost`)
and helper scripts.

## Syncing with upstream

```sh
git fetch upstream
git rebase upstream/main     # resolve conflicts; drop commits upstream fixed
npx vitest run tests/api/unfollowEngines.test.js
```
