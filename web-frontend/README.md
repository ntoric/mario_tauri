# Mario Juicy — Web Frontend

Browser-hosted clone of the React POS frontend. Unlike the Tauri desktop app
(`../frontend`), this build talks **directly to the cloud backend over HTTPS**
— no local embedded server, no offline mode. Requires internet connectivity.

Mirrored from the `frontend/` app on the `main` branch, with the Tauri-only
pieces replaced:

| Desktop (Tauri)                  | Web (this app)                              |
| -------------------------------- | ------------------------------------------- |
| `invoke('api_request')` → SQLite | `fetch()` → `VITE_API_URL` (cloud backend)  |
| Tauri events (table status)      | WebSocket `/api/ws/tables-status?token=…`   |
| Native thermal printer           | Browser print dialog (rendered receipt)     |
| Tauri auto-updater               | No-op — a redeploy updates every client     |

## Configuration

The API base URL is baked in at build time via `VITE_API_URL`
(must end with `/api`):

- `.env.development` → `npm run dev` (defaults to `http://localhost:8088/api`)
- `.env.production` → `npm run build` (defaults to the cloud backend
  `https://mario-v2-backend.ntoric.com/api`)

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
```

The dev server proxies `/api` to the backend derived from `VITE_API_URL`.

## Deploy (Docker)

```bash
# Default cloud backend
docker build -t mario-web .

# Custom backend URL
docker build --build-arg VITE_API_URL=https://your-backend.example.com/api -t mario-web .

docker run -p 80:80 mario-web
```

Then expose port 80 behind your reverse proxy / TLS terminator — the app is a
static bundle served by nginx and reachable at whatever URL you assign.

## Deploy (static hosting)

`npm run build` outputs plain static files to `dist/` — works on any static
host (nginx, S3+CDN, Vercel, Netlify, …). The app uses `HashRouter`, so no
server-side route rewrites are required.

## Notes

- Auth tokens are kept in `localStorage` (`cafe_token`); JWT sent as
  `Authorization: Bearer …`, and as a `?token=` query param for the WebSocket.
- Printing opens the browser print dialog with a formatted receipt — select a
  printer there (system, PDF, or thermal via OS driver).
