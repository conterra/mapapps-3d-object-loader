///
/// Copyright (C) 2025 con terra GmbH (info@conterra.de)
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///         http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

/**
 * Helpers to work with metric sizes (object footprints, mask paddings) in the
 * units of the scene's spatial reference.
 *
 * Object sizes are always meters, while coordinates are in map units. The
 * conversions below use a local scale factor at the given position, which is
 * accurate for the extent of a single placed object:
 * - geographic SRs (e.g. 4326): degrees, using the WGS84 ellipsoid radii
 * - Web Mercator (3857): projected meters, scaled by 1 / cos(latitude)
 * - other projected SRs: `metersPerUnit` (e.g. 1 for UTM, 0.3048 for feet)
 *
 * Only the members of `SpatialReference` used here are required, so the
 * functions can be unit-tested with plain objects.
 */
export interface SpatialReferenceLike {
    isGeographic?: boolean;
    isWebMercator?: boolean;
    metersPerUnit?: number;
}

const WGS84_A = 6378137;
const WGS84_E2 = 0.00669437999014;
const WEB_MERCATOR_R = 6378137;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * Converts an offset given in meters (east, north) at the position (x, y)
 * into an offset in map units of the given spatial reference.
 *
 * @returns `[dx, dy]` in map units.
 */
export function metersToMapOffset(
    sr: SpatialReferenceLike | undefined,
    x: number,
    y: number,
    eastMeters: number,
    northMeters: number
): [number, number] {
    if (sr?.isGeographic) {
        const lat = toRad(y);
        const sinLat = Math.sin(lat);
        const w = 1 - WGS84_E2 * sinLat * sinLat;
        // Radii of curvature in the prime vertical (n) and the meridian (m).
        const n = WGS84_A / Math.sqrt(w);
        const m = (WGS84_A * (1 - WGS84_E2)) / Math.pow(w, 1.5);
        const cosLat = Math.max(Math.cos(lat), 1e-12);
        return [toDeg(eastMeters / (n * cosLat)), toDeg(northMeters / m)];
    }
    if (sr?.isWebMercator) {
        const lat = 2 * Math.atan(Math.exp(y / WEB_MERCATOR_R)) - Math.PI / 2;
        const scale = 1 / Math.max(Math.cos(lat), 1e-12);
        return [eastMeters * scale, northMeters * scale];
    }
    const metersPerUnit = sr?.metersPerUnit && sr.metersPerUnit > 0 ? sr.metersPerUnit : 1;
    return [eastMeters / metersPerUnit, northMeters / metersPerUnit];
}

/**
 * Number of decimals that keeps coordinates of the given spatial reference at
 * roughly centimeter precision (7 for degrees, 2 for meters or feet).
 */
export function coordinateDecimals(sr: SpatialReferenceLike | undefined): number {
    return sr?.isGeographic ? 7 : 2;
}
