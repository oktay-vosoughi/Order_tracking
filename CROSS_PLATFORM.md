# Cross-Platform Development Guide (Windows + macOS)

## Prerequisites (both OS)

1. **Node.js** ≥ 18 — [nodejs.org](https://nodejs.org)
2. **MySQL** 8+ — via installer (Windows) or Homebrew/installer (macOS)
3. **Git** — comes with Xcode CLI tools (macOS) or [git-scm.com](https://git-scm.com) (Windows)

## First-time setup

```bash
git clone <repo-url>
cd Order_tracking

# Install dependencies (includes cross-env, concurrently)
npm install

# Create your local env file
cp server/.env.example server/.env
# Then edit server/.env with your MySQL credentials
```

On **Windows** use `copy` instead of `cp`:
```cmd
copy server\.env.example server\.env
```

## Running the app (both OS, single command)

```bash
npm start
```

This runs both the backend (port 4000) and frontend (port 3002) simultaneously.

Or run them separately in two terminals:
```bash
npm run server   # Terminal 1 — API on :4000
npm run dev      # Terminal 2 — UI on :3002
```

## OS-specific notes

### macOS
- **Port 5000** is occupied by AirPlay Receiver. The backend defaults to **4000** — no issue.
- If you see `EADDRINUSE :4000`, check: `lsof -nP -iTCP:4000 -sTCP:LISTEN`

### Windows
- If you see `EADDRINUSE`, check: `netstat -ano | findstr :4000`
- Shell scripts (`scripts/*.sh`) require **Git Bash** or **WSL**. For day-to-day dev, just use `npm start` — no shell scripts needed.
- MySQL service: ensure it's running via `services.msc` or `net start mysql`.

## Key npm scripts (cross-platform)

| Command | Description |
|---------|-------------|
| `npm start` | Run backend + frontend together |
| `npm run dev` | Frontend only (Vite, port 3002) |
| `npm run server` | Backend only (Express, port 4000) |
| `npm run build` | Production build → `dist/` |
| `npm run server:prod` | Start backend in production mode |

## Shell scripts (Linux/macOS server only)

The `scripts/*.sh` files are for **deployment on the Linux server** and are not needed for local development on either OS. All local dev workflows are covered by the npm scripts above.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `MODULE_NOT_FOUND` | Run `npm install` |
| `ECONNREFUSED` to MySQL | Ensure MySQL service is running and credentials in `server/.env` are correct |
| Port already in use | Kill the process or change `PORT` in `server/.env` |
| `\r\n` line ending errors | Run `git config core.autocrlf true` on Windows |
