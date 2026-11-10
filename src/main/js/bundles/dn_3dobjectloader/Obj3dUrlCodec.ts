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
 * URL serialization codec for shared 3D preset objects.
 *
 * Pure, DOM- and ArcGIS-free: transforms a compact item array to/from the
 * string that lives in the `obj3d` URL parameter. Mapping to/from
 * {@link ObjectItem} (preset lookup, id generation, ArcGIS polygon
 * reconstruction) stays in `ObjectsController` — this module only owns the wire
 * format, rounding and version handling, which keeps it unit-testable without a
 * map runtime.
 */

/** How a decoded URL state is merged with locally persisted objects. */
export type RestoreStrategy = "replace" | "append" | "ifEmpty";

/** Current wire-format version; bump when the {@link CompactItem} shape changes. */
export const FORMAT_VERSION = 1;

/**
 * Compact, URL-friendly representation of one placed preset object.
 *
 * Short keys keep the encoded URL small. Coordinates are in the units of the
 * configured spatial reference (a projected SR in meters is expected). The mesh mask is always planar, so only a single height (`mh`) is
 * stored and re-applied to every vertex on decode.
 */
export interface CompactItem {
    /** presetId */
    p: string;
    /** x / easting */
    x: number;
    /** y / northing */
    y: number;
    /** absolute elevation in meters */
    z: number;
    /** heading in degrees */
    h: number;
    /** width in meters @ 100% scale */
    w: number;
    /** depth in meters @ 100% scale */
    d: number;
    /** extent height in meters @ 100% scale (`e`, since `h` is heading) */
    e: number;
    /** scale percent */
    s: number;
    /** title, only present when it differs from the preset name */
    t?: string;
    /** optional mesh mask: 2D rings `[x, y]` plus the planar mask height */
    m?: { r: number[][][]; mh: number };
}

interface Payload {
    v: number;
    o: CompactItem[];
}

/** Rounds to a fixed number of decimals; non-finite input collapses to 0. */
export function round(value: number, decimals: number): number {
    if (!isFinite(value)) return 0;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/**
 * Serializes the compact items into the `obj3d` parameter value.
 *
 * Returns a versioned JSON string; URL-encoding is handled by the
 * ParameterManager, so the raw string is returned as-is.
 */
export function encodeCompact(items: CompactItem[]): string {
    const payload: Payload = { v: FORMAT_VERSION, o: items };
    return JSON.stringify(payload);
}

/**
 * Parses the `obj3d` parameter value back into compact items.
 *
 * Tolerant by design: returns an empty array for missing, malformed or
 * version-mismatched input instead of throwing, so a broken parameter never
 * blocks app startup. A duplicated query key (`string[]`) uses the first entry.
 */
export function decodeCompact(raw: string | string[] | undefined): CompactItem[] {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return [];
    }
    const payload = parsed as Partial<Payload> | null;
    if (!payload || payload.v !== FORMAT_VERSION || !Array.isArray(payload.o)) {
        return [];
    }
    // The input is a user-editable URL, so a manipulated payload must not yield
    // NaN/undefined values downstream. Items with an invalid required field are
    // dropped; an invalid optional title or mask is removed from the item.
    return payload.o.filter(isValidItem).map(sanitizeOptionalFields);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isValidItem(it: unknown): it is CompactItem {
    if (!it || typeof it !== "object") return false;
    const c = it as Partial<CompactItem>;
    return typeof c.p === "string" &&
        isFiniteNumber(c.x) && isFiniteNumber(c.y) && isFiniteNumber(c.z) &&
        isFiniteNumber(c.h) &&
        isFiniteNumber(c.w) && c.w >= 0 &&
        isFiniteNumber(c.d) && c.d >= 0 &&
        isFiniteNumber(c.e) && c.e >= 0 &&
        isFiniteNumber(c.s) && c.s > 0;
}

function isValidMask(m: unknown): m is CompactItem["m"] {
    if (!m || typeof m !== "object") return false;
    const { r, mh } = m as { r?: unknown; mh?: unknown };
    return isFiniteNumber(mh) &&
        Array.isArray(r) && r.length > 0 &&
        r.every(ring => Array.isArray(ring) && ring.length >= 3 &&
            ring.every(pt => Array.isArray(pt) && pt.length === 2 && isFiniteNumber(pt[0]) && isFiniteNumber(pt[1])));
}

function sanitizeOptionalFields(it: CompactItem): CompactItem {
    const result = { ...it };
    if (result.t !== undefined && typeof result.t !== "string") delete result.t;
    if (result.m !== undefined && !isValidMask(result.m)) delete result.m;
    return result;
}
