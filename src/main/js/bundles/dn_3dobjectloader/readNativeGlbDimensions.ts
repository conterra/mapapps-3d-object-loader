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

import Mesh from "@arcgis/core/geometry/Mesh";
import Point from "@arcgis/core/geometry/Point";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import { loggerForName } from "apprt-core/Logger";

/** Axis-aligned bounding box of a GLB in meters, mapped to the scene's x/y/z axes. */
export interface NativeDimensions {
    width: number;
    depth: number;
    height: number;
}

const LOG = loggerForName("dn_3dobjectloader/readNativeGlbDimensions");
const cache = new Map<string, NativeDimensions>();
const METRIC_ORIGIN = new Point({ x: 0, y: 0, z: 0, spatialReference: SpatialReference.WebMercator });

/**
 * Reads the native axis-aligned bounding box of a glTF/GLB resource by
 * loading it through `Mesh.createFromGLTF` in georeferenced vertex space.
 * The mesh is loaded at a fixed origin in Web Mercator at the equator, where
 * map units are true meters, so the result is in meters independent of the
 * scene's spatial reference (one glTF unit is one meter).
 *
 * Returns the extent as `{ width, depth, height }` mapped from the
 * mesh extent's x, y and z axes respectively. `undefined` is returned
 * when the mesh cannot be loaded or exposes no extent (e.g. network
 * error, unsupported glTF feature, blob-URL rejection).
 */
export async function readNativeGlbDimensions(meshUrl: string): Promise<NativeDimensions | undefined> {
    const cached = cache.get(meshUrl);
    if (cached) return cached;
    try {
        const mesh = await Mesh.createFromGLTF(METRIC_ORIGIN, meshUrl, { vertexSpace: "georeferenced" });
        if (mesh && mesh.loadStatus !== "loaded") {
            await mesh.load();
        }
        const ext = mesh?.extent;
        if (!ext) return undefined;
        const zExtent = (ext.zmax ?? 0) - (ext.zmin ?? 0);
        const round = (v: number) => +v.toFixed(4);
        const width = round(ext.width);
        const depth = round(ext.height);
        const height = round(zExtent);
        if (!(width > 0) || !(depth > 0) || !(height > 0)) return undefined;
        const dims: NativeDimensions = { width, depth, height };
        cache.set(meshUrl, dims);
        return dims;
    } catch (e) {
        LOG.warn("glTF dimension read failed", e);
        return undefined;
    }
}
