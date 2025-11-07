import 'leaflet/dist/leaflet.css';
import PropTypes from 'prop-types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageOverlay, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';

const valueFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
});

const coordFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

const formatLatitude = (lat) => {
  const cardinal = lat >= 0 ? 'N' : 'S';
  return `${coordFormatter.format(Math.abs(lat))}°${cardinal}`;
};

const formatLongitude = (lon) => {
  const cardinal = lon >= 0 ? 'E' : 'W';
  return `${coordFormatter.format(Math.abs(lon))}°${cardinal}`;
};

function RadarInteraction({ grid = null, onHover }) {
  const throttleRef = useRef(0);

  useMapEvents({
    mousemove(event) {
      if (!grid) {
        return;
      }

      const now = performance.now();
      if (now - throttleRef.current < 50) {
        return;
      }

      throttleRef.current = now;
      onHover({
        latlng: event.latlng,
        containerPoint: event.containerPoint,
      });
    },
    mouseout() {
      onHover(null);
    },
  });

  return null;
}

function FitBounds({ bounds = null }) {
  const map = useMap();

  useEffect(() => {
    if (!bounds) {
      return;
    }

    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 6 });
  }, [map, bounds]);

  return null;
}

const CONUS_CENTER = [39.5, -98.35];
const DEFAULT_ZOOM = 4;
const MRMS_BOUNDS = [
  [24, -125],
  [50, -66],
]; // Bounding box approximating MRMS coverage over CONUS
const MAX_ZOOM = 10;
const MIN_ZOOM = 3;
const VIEW_PADDING_DEGREES = 4;

const expandBounds = (bounds, paddingDegrees = 0) => {
  if (!bounds) {
    return bounds;
  }

  const [[south, west], [north, east]] = bounds;
  return [
    [south - paddingDegrees, west - paddingDegrees],
    [north + paddingDegrees, east + paddingDegrees],
  ];
};

const MRMS_VIEW_BOUNDS = expandBounds(MRMS_BOUNDS, VIEW_PADDING_DEGREES); // Slight slack for smoother panning

function MapView({ radar = null, status, error = null }) {
  const grid = radar?.grid;
  const metadata = radar?.metadata;

  const tileAttribution = useMemo(
    () =>
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    []
  );

  const bounds = useMemo(() => {
    if (!metadata?.bounds) {
      return null;
    }

    const [south, west, north, east] = metadata.bounds;
    return [
      [south, west],
      [north, east],
    ];
  }, [metadata]);

  const [hoverInfo, setHoverInfo] = useState(null);

  const handleHover = useCallback(
    (interaction) => {
      if (!interaction || !grid) {
        setHoverInfo(null);
        return;
      }

      const { latlng, containerPoint } = interaction;
      if (!latlng || !containerPoint) {
        setHoverInfo(null);
        return;
      }

      const value = grid.getValueAt(latlng.lat, latlng.lng);

      if (value === null || Number.isNaN(value)) {
        setHoverInfo(null);
        return;
      }

      setHoverInfo({
        lat: latlng.lat,
        lon: latlng.lng,
        value,
        x: containerPoint.x,
        y: containerPoint.y,
      });
    },
    [grid]
  );

  const hasOverlay = Boolean(metadata?.imageUrl && bounds);

  const mapRef = useRef(null);

  const syncViewToBounds = useCallback(
    ({ animate = true } = {}) => {
      const map = mapRef.current;

      if (!map) {
        return;
      }

      if (bounds) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: Math.min(MAX_ZOOM, 7), animate });
      } else {
        map.setView(CONUS_CENTER, DEFAULT_ZOOM, { animate });
      }
    },
    [bounds]
  );

  useEffect(() => {
    syncViewToBounds({ animate: false });
  }, [bounds, syncViewToBounds]);

  return (
    <div className="relative h-[68vh] min-h-[520px] w-full overflow-hidden rounded-[28px] border border-slate-200 bg-white/80 shadow-2xl shadow-slate-200/50 backdrop-blur transition-colors dark:border-slate-800/70 dark:bg-slate-950/40 dark:shadow-slate-950/40">
      <MapContainer
        center={CONUS_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        preferCanvas
        maxBounds={MRMS_VIEW_BOUNDS}
        maxBoundsViscosity={0.4}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        worldCopyJump={false}
        whenCreated={(map) => {
          mapRef.current = map;
          syncViewToBounds({ animate: false });
        }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={tileAttribution} />
        {hasOverlay ? (
          <ImageOverlay
            key={metadata.timestamp}
            url={metadata.imageUrl}
            bounds={bounds}
            opacity={0.7}
            interactive
          />
        ) : null}
        {bounds ? <FitBounds bounds={bounds} /> : null}
        {grid ? <RadarInteraction grid={grid} onHover={handleHover} /> : null}
      </MapContainer>

      <div className="pointer-events-none absolute right-6 top-6 z-[1200] flex flex-col items-end gap-2 text-sm">
        {status === 'loading' ? (
          <span className="rounded-full bg-white/90 px-4 py-2 text-slate-700 shadow-lg shadow-slate-200/60 dark:bg-slate-900/90 dark:text-slate-200 dark:shadow-slate-950/40">
            Loading radar...
          </span>
        ) : null}
        {status === 'error' ? (
          <span className="max-w-[320px] rounded-2xl bg-rose-100/95 px-4 py-3 text-right text-sm text-rose-800 shadow-lg shadow-rose-200/60 dark:bg-red-900/90 dark:text-red-100 dark:shadow-red-950/40">
            Failed to load radar: {error?.message ?? 'unknown error'}
          </span>
        ) : null}
      </div>

      {hoverInfo ? (
        <div
          className="pointer-events-none absolute z-[1300] -translate-y-1/2 translate-x-4 rounded-2xl bg-white/95 px-4 py-3 text-xs font-medium text-slate-800 shadow-xl shadow-slate-300/50 backdrop-blur transition-colors dark:bg-slate-950/90 dark:text-slate-100 dark:shadow-slate-950/50"
          style={{
            top: hoverInfo.y,
            left: hoverInfo.x,
          }}
        >
          <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Reflectivity</div>
          <div className="text-base text-slate-900 dark:text-slate-100">{valueFormatter.format(hoverInfo.value)} dBZ</div>
          <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
            {formatLatitude(hoverInfo.lat)} / {formatLongitude(hoverInfo.lon)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

RadarInteraction.propTypes = {
  grid: PropTypes.shape({
    getValueAt: PropTypes.func.isRequired,
  }),
  onHover: PropTypes.func.isRequired,
};

FitBounds.propTypes = {
  bounds: PropTypes.arrayOf(
    PropTypes.arrayOf(PropTypes.number)
  ),
};

MapView.propTypes = {
  radar: PropTypes.shape({
    metadata: PropTypes.shape({
      bounds: PropTypes.arrayOf(PropTypes.number),
      imageUrl: PropTypes.string,
      timestamp: PropTypes.string,
    }),
    grid: PropTypes.shape({
      getValueAt: PropTypes.func.isRequired,
    }),
  }),
  status: PropTypes.string.isRequired,
  error: PropTypes.shape({
    message: PropTypes.string,
  }),
};


export default MapView;
