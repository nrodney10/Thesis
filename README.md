RodRecover
=========
RodRecover
=========

Overview
- RodRecover is a rehabilitation web application with a Node/Express backend and a React frontend.

Prerequisites
- Node.js (v16 or later) and npm installed
- A MongoDB connection (Atlas URI or a local MongoDB instance)
- Git (to clone the repository)

Quick, copy-paste steps (Windows PowerShell)

1) Clone repository
```powershell
git clone <repo-url>
cd rodrecover
```

2) Create server environment file
In `server` create a file named `.env` with at minimum:
```
MONGO_URI=<your-mongo-connection-string>
PORT=5000
```
Optional variables (only if needed):
```
JWT_SECRET=some_secret
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...
FITBIT_CLIENT_ID=...
FITBIT_CLIENT_SECRET=...
FITBIT_REDIRECT_URI=...
```

3) Install and start the server
```powershell
cd server
npm install
npm start
```
Expected output:
- `MongoDB Connected to Atlas` (or a successful connection message)
- `Server running on port 5000`

Quick verification (new terminal):
```powershell
curl http://localhost:5000/
# should return: RodRecover API running...
```

4) Install and start the client (new terminal)
```powershell
cd ..\client
npm install
npm start
```
Expected: browser opens at `http://localhost:3000` and the frontend loads. The frontend will request the backend at `http://localhost:5000/api`.

Basic API checks
- Root: `curl http://localhost:5000/`
- Example API (may require auth): `curl http://localhost:5000/api/user`

Common problems & fixes
- `react-scripts` not recognized: run `npm install` inside `client`.
- Mongo connection error: verify `MONGO_URI` and ensure Atlas IP whitelist includes tester's IP, or run local Mongo and use `mongodb://localhost:27017/yourdb`.
- Port conflict: change `PORT` in `server/.env` or stop the conflicting process.
- Firewall issues: allow localhost ports 3000/5000 if necessary.

Optional additions I can create
- `server/.env.example` with recommended keys
- `run-all.ps1` (PowerShell) to install dependencies and start server + client for testers
- A one-page PDF with these steps for a professor

If you want, I can create `server/.env.example` and `run-all.ps1` now — which would you like?
