# MRMS Reflectivity Radar

A full-stack weather radar dashboard that downloads the most recent "Reflectivity at Lowest Altitude" MRMS product from NOAA's public S3 bucket, converts it into a colorized overlay, and displays both the live mosaic and request analytics in a React dashboard.

---

## Key Features

- Automated pipeline that finds, downloads, and validates the freshest MRMS GRIB2 artifact directly from S3 (no pre-generated assets).
- Python worker (`xarray` + `cfgrib`) converts GRIB2 grids into compact binary payloads consumed by the Node.js API.
- Colorized PNG overlay generated on the fly (`pngjs`) with matching grid metadata for interactive tooltips in the map.
- React + Leaflet frontend with Tailwind UI, dark/light theme support, and live status indicators.
- Optional MongoDB-backed analytics endpoints that aggregate request logs for admin insights.

## Repository Layout

```text
readme.md
backend/
  package.json
  requirements.txt
  src/
    server.js
    config/
    controllers/
    errors/
    middleware/
    routes/
    services/
    utils/
    workers/
frontend/
  package.json
  src/
    App.jsx
    components/
    hooks/
    services/
    utils/
  public/
```

## Tech Stack

- **Backend:** Node.js, Express, AWS SDK v3, PNGJS, MongoDB client
- **Data processing:** Python 3, xarray, cfgrib, numpy
- **Frontend:** React 18, Vite, react-leaflet, Leaflet, TailwindCSS
- **Tooling:** ESLint, Nodemon, PostCSS, Axios

## Prerequisites

- Node.js 20 LTS (or newer) and npm
- Python 3.10+ with pip (for the GRIB processor)
- Access to the public NOAA bucket `noaa-mrms-pds` (no credentials required)
- Optional: running MongoDB instance if you want admin analytics populated

## Environment Variables

Create a `.env` file inside `backend/` (values shown are defaults):

```bash
PORT=8080
LOG_LEVEL=info
MRMS_S3_BUCKET=noaa-mrms-pds
MRMS_S3_REGION=us-east-1
MRMS_REGION=CONUS
MRMS_PRODUCT=ReflectivityAtLowestAltitude_00.50
MRMS_MAX_DATA_AGE_MINUTES=20
CACHE_TTL_MS=300000
RADAR_REFRESH_INTERVAL_MS=60000
CACHE_PERSIST_DIR=./.cache
PYTHON_EXECUTABLE=python3
RADAR_WARMUP_ON_START=true
MONGO_URI=mongodb://localhost:27017
MONGO_DB=radar
MONGO_REQUEST_LOG_COLLECTION=requestLogs
MONGO_USER_COLLECTION=users
```

Notes:

- Set `CACHE_PERSIST_DIR=disabled` to skip disk persistence between restarts.
- The backend starts without MongoDB if the connection fails; admin routes will simply report no data.
- Override `PYTHON_EXECUTABLE` if your Python binary lives elsewhere (for example, inside a virtual environment).

## Backend Setup & Scripts

```bash
cd backend
npm install
python3 -m venv .venv           # optional but recommended
source .venv/bin/activate       # zsh/bash
pip install -r requirements.txt
```

Available npm scripts:

- `npm run dev` – start Express with Nodemon hot reload (listens on `PORT`, defaults to 8080)
- `npm start` – production start without Nodemon
- `npm run lint` – lint the backend sources

When the server boots it will:

1. Optionally hydrate cached artifacts from `CACHE_PERSIST_DIR`.
2. Attempt to connect to MongoDB for analytics (non-fatal on failure).
3. Warm the cache by downloading the latest MRMS artifact and producing:
   - `GET /api/radar/latest` metadata response
   - `GET /api/radar/tile.png` overlay image
   - `GET /api/radar/grid.json` metadata for the encoded grid
   - `GET /api/radar/grid.bin` binary grid payload (int16 stream)
4. Schedule refreshes using `RADAR_REFRESH_INTERVAL_MS`.

### Python Worker

The Node service saves the downloaded GRIB2 file to a temp directory and invokes `workers/grib_processor.py`. Make sure the Python dependencies listed in `requirements.txt` are installed in the environment specified by `PYTHON_EXECUTABLE`.

## Frontend Setup & Scripts

```bash
cd frontend
npm install
npm run dev        # starts Vite dev server on http://localhost:5173
```

During development, Vite proxies `/api/*` calls to `http://localhost:8080` (see `vite.config.js`). Ensure the backend is running before loading the dashboard.

Available npm scripts:

- `npm run dev` – Vite dev server with hot module reload
- `npm run build` – create a production build in `frontend/dist`
- `npm run preview` – serve the built assets locally
- `npm run lint` – lint React sources

For production you can either:

1. Deploy backend and frontend separately (configure your web server or CDN to forward `/api` to the backend), or
2. Copy `frontend/dist` into a static hosting location and configure Express (or a reverse proxy) to serve it while proxying API requests.

## API Overview

- `GET /api/health` – simple readiness probe
- `GET /api/radar/latest` – metadata describing the latest overlay (bounds, steps, timestamp, URLs)
- `GET /api/radar/tile.png` – colorized PNG overlay aligned with the metadata bounds
- `GET /api/radar/grid.json` – grid metadata including encoding details
- `GET /api/radar/grid.bin` – raw grid data encoded as little-endian int16 values
- `GET /api/admin/metrics` – aggregate request metrics (requires Mongo)
- `GET /api/admin/logs` – recent request log entries (requires Mongo)
- `DELETE /api/admin/logs` – cleanup helper for old logs (requires Mongo)
- `GET /api/admin/users` – leaderboard derived from request logs (requires Mongo)
- `GET /api/admin/users/:userId` – per-user insight document (requires Mongo)

The frontend consumes the radar endpoints to render the Leaflet overlay and the admin endpoints to populate telemetry widgets.

## Data Pipeline Notes

- The MRMS bucket delivers updates roughly every 2 minutes; freshness is enforced by `MRMS_MAX_DATA_AGE_MINUTES`.
- The grid binary is scaled/encoded (int16) to keep payloads small. Use the provided `dataEncoding` fields to convert values back to dBZ: `value = (raw * scale) + offset` (`missing` sentinel means "no data").
- Longitudes are normalized to the [-180, 180] range, and the grid orientation is corrected so that Leaflet bounds match the PNG overlay.

## Development Tips

- If the backend logs `GRIB processor exited with error`, verify the Python environment has `xarray`, `cfgrib`, and `numpy` installed.
- To force a fresh download/build, delete the cache directory (if enabled) and restart the backend or call `GET /api/radar/latest?force=true` after adding that behavior to `radarController`.
- MongoDB analytics run asynchronously; expect slight delays before metrics appear.

## Suggested Verification

1. Start MongoDB (optional) and the backend (`npm run dev`).
2. Visit `http://localhost:8080/api/radar/latest` to confirm metadata is returned.
3. Start the frontend (`npm run dev`) and open `http://localhost:5173`.
4. Hover the map to confirm tooltips update with reflectivity values.
5. Trigger a few API requests to see admin metrics populate.

## Render Monolith Deployment

- Configure a Render Web Service pointing to the repository root and set the working directory to `backend/`.
- Build Command (installs backend deps, Python worker deps, and builds the frontend bundle):

  ```bash
  npm --prefix backend install && pip install -r backend/requirements.txt && npm --prefix frontend install && npm --prefix frontend run build
  ```

- Start Command (serves API + prebuilt frontend from `frontend/dist`):

  ```bash
  cd backend && npm start
  ```

- During startup the backend logs whether the bundle directory was found; ensure the build command runs successfully so `frontend/dist` exists before boot.
- The backend now accesses the public MRMS bucket without AWS credentials, so no additional secrets are required for Render.

---

This documentation should help you stand up the project quickly, understand the data flow, and adapt the stack for deployments or further development.

