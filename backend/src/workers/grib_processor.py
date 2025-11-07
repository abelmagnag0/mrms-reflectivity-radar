#!/usr/bin/env python3
"""Convert MRMS GRIB2 product into grid metadata suitable for the frontend."""

from __future__ import annotations

import argparse
import base64
import json
import math
import sys
from pathlib import Path

import numpy as np

try:
    import xarray as xr
except ImportError as exc:  # pragma: no cover - easier to inspect in stderr
    print("Missing python dependency: xarray", file=sys.stderr)
    raise SystemExit(1) from exc

try:
    import cfgrib  # noqa: F401  # pylint: disable=unused-import
except ImportError as exc:  # pragma: no cover
    print("Missing python dependency: cfgrib", file=sys.stderr)
    raise SystemExit(1) from exc


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Process MRMS GRIB file")
    parser.add_argument("--grib", required=True, help="Path to the GRIB2 file to parse")
    return parser.parse_args()


def detect_missing_value(variable) -> float | None:
    for key in ("missing_value", "_FillValue"):
        if key in variable.attrs:
            return variable.attrs[key]
    return None


def ensure_orientation(latitudes: np.ndarray, values: np.ndarray) -> tuple[np.ndarray, np.ndarray, bool]:
    """Flip the data vertically if the latitude decreases north-to-south."""
    first_lat = float(latitudes[0, 0]) if latitudes.ndim == 2 else float(latitudes[0])
    last_lat = float(latitudes[-1, 0]) if latitudes.ndim == 2 else float(latitudes[-1])

    if first_lat < last_lat:
        return np.flipud(latitudes), np.flipud(values), True

    return latitudes, values, False


def extract_bounds(latitudes: np.ndarray, longitudes: np.ndarray) -> tuple[float, float, float, float]:
    if latitudes.ndim == 2:
        north = float(latitudes[0, 0])
        south = float(latitudes[-1, 0])
    else:
        north = float(latitudes[0])
        south = float(latitudes[-1])

    if longitudes.ndim == 2:
        west = float(longitudes[0, 0])
        east = float(longitudes[0, -1])
    else:
        west = float(longitudes[0])
        east = float(longitudes[-1])

    # Guarantee ordering south < north and west < east for Leaflet bounds
    south, north = sorted((south, north))
    west, east = sorted((west, east))

    return south, west, north, east


def compute_step(values: np.ndarray) -> float:
    if values.size < 2:
        return 0.0
    return float(abs(values[1] - values[0]))


def extract_resolution(latitudes: np.ndarray, longitudes: np.ndarray) -> tuple[float, float]:
    if latitudes.ndim == 2:
        lat_vector = latitudes[:, 0]
    else:
        lat_vector = latitudes

    if longitudes.ndim == 2:
        lon_vector = longitudes[0, :]
    else:
        lon_vector = longitudes

    lat_step = compute_step(lat_vector)
    lon_step = compute_step(lon_vector)
    return lat_step, lon_step


def normalise_values(values: np.ndarray, missing_value: float | None) -> np.ndarray:
    if missing_value is not None:
        values = np.where(values == missing_value, np.nan, values)

    # Treat sentinel values as missing
    values = np.where(values <= -100, np.nan, values)
    return values.astype(np.float32)


def encode_values(values: np.ndarray) -> tuple[str, dict[str, float | int | str]]:
    """Encode the grid into a compact binary representation."""

    scale_multiplier = 10  # preserve one decimal place precision
    missing_sentinel = -32768

    scaled = np.where(np.isnan(values), missing_sentinel, np.rint(values * scale_multiplier))
    scaled = scaled.astype(np.int16)

    encoded_bytes = base64.b64encode(scaled.tobytes()).decode("ascii")
    encoding = {
        "format": "int16",
        "scale": 1.0 / scale_multiplier,
        "offset": 0.0,
        "missing": missing_sentinel,
        "description": "value = (raw * scale) + offset; missing indicates no data",
    }

    return encoded_bytes, encoding


def wrap_longitudes(longitudes: np.ndarray) -> np.ndarray:
    """Convert longitude values to the [-180, 180] range."""

    if np.issubdtype(longitudes.dtype, np.number):
        adjusted = np.where(longitudes > 180.0, longitudes - 360.0, longitudes)
        return adjusted

    return longitudes


def format_timestamp(dataset: xr.Dataset) -> str | None:
    time_var = dataset.coords.get("time") or dataset.variables.get("time")
    if time_var is None:
        return None

    time_value = time_var.values
    if isinstance(time_value, np.ndarray):
        time_value = time_value.item(0)

    try:
        iso = np.datetime_as_string(time_value, unit="s")
    except (TypeError, ValueError):
        return None

    if not iso.endswith("Z"):
        iso = f"{iso}Z"
    return iso

def process_grib(grib_path: Path) -> dict:
    dataset = xr.open_dataset(
        grib_path,
        engine="cfgrib",
        backend_kwargs={"indexpath": ""},
    )

    try:
        variable_name = next(iter(dataset.data_vars))
    except StopIteration as exc:  # pragma: no cover
        raise RuntimeError("No data variables found in GRIB file") from exc

    variable = dataset[variable_name]
    raw_values = variable.values
    latitudes = dataset["latitude"].values
    longitudes = wrap_longitudes(dataset["longitude"].values)

    latitudes, raw_values, flipped = ensure_orientation(latitudes, raw_values)
    if flipped:
        longitudes = np.flipud(longitudes)

    values = normalise_values(raw_values, detect_missing_value(variable))
    encoded_data, encoding = encode_values(values)

    rows, cols = values.shape
    south, west, north, east = extract_bounds(latitudes, longitudes)
    lat_step, lon_step = extract_resolution(latitudes, longitudes)
    timestamp = format_timestamp(dataset)

    try:
        min_candidate = float(np.nanmin(values))
    except ValueError:
        min_candidate = math.nan

    try:
        max_candidate = float(np.nanmax(values))
    except ValueError:
        max_candidate = math.nan

    min_value = min_candidate if math.isfinite(min_candidate) else None
    max_value = max_candidate if math.isfinite(max_candidate) else None

    payload = {
        "rows": int(rows),
        "cols": int(cols),
        "bounds": [south, west, north, east],
        "latStep": lat_step,
        "lonStep": lon_step,
        "timestamp": timestamp,
        "minValue": min_value,
        "maxValue": max_value,
        "origin": "upper-left",
        "dataEncoding": encoding,
        "data": encoded_data,
    }

    return payload


def main() -> None:
    args = parse_arguments()
    grib_path = Path(args.grib)

    if not grib_path.exists():
        print(f"File not found: {grib_path}", file=sys.stderr)
        raise SystemExit(2)

    payload = process_grib(grib_path)
    print(json.dumps(payload, separators=(",", ":")))


if __name__ == "__main__":
    main()
