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

import { loggerForName } from "apprt-core/Logger";
import IdbAdapter from "./IdbAdapter";

const LOG = loggerForName("dn_3dobjectloader/ObjectsStorageController");

/**
 * Persistable description of a single placed 3D object.
 *
 * `meshUrl` is rehydrated on load: for `source === "custom"` items a fresh
 * `blob:` URL is re-created from the cached blob referenced by `customBlobKey`.
 */
export interface ObjectItem {
    id: string;
    /** `"preset"` references a configured template; `"custom"` uses an uploaded GLB. */
    source: "preset" | "custom";
    presetId?: string;
    /** Key into the blob store for custom uploads; undefined for presets. */
    customBlobKey?: string;
    meshUrl: string;
    title: string;
    x: number;
    y: number;
    z: number;
    /** Heading in degrees. */
    heading: number;
    width: number;
    depth: number;
    height: number;
    scalePercent: number;
    /** Native GLB bounding-box dimensions in meters, captured at placement time. */
    nativeWidth?: number;
    nativeDepth?: number;
    nativeHeight?: number;
    /** Optional mesh-mask polygon, stored as ArcGIS JSON. */
    maskGeometryJson?: unknown;
    maskHeight?: number;
    createdAt: number;
}

/**
 * True when the item still holds unit-cube defaults and no user-driven
 * scale, i.e. no explicit sizing has been applied yet. Used both to
 * decide whether a fresh native-dimension read may overwrite current
 * values, and to decide whether the 3D symbol layer needs explicit
 * width/depth/height at all.
 */
export function isItemUntouched(item: Pick<ObjectItem, "width" | "depth" | "height" | "scalePercent">): boolean {
    return item.width === 1 && item.depth === 1 && item.height === 1 && item.scalePercent === 100;
}

/**
 * Persists the list of placed 3D objects and uploaded GLB blobs in a single
 * IndexedDB database with two object stores (`items`, `blobs`).
 *
 * Schema migrations are driven by IDB's `onupgradeneeded` hook in
 * {@link IdbAdapter}; the manifest property `schemaVersion` doubles as IDB
 * version. Bumping it triggers the next migration step.
 *
 * `blob:` URLs are session-only and therefore stripped during {@link save};
 * callers must recreate them via {@link loadBlobUrl} on load.
 */
export default class ObjectsStorageController {
    private declare _properties: {
        dbName: string;
        schemaVersion: number;
        maxFileSize: number;
    };

    private _adapter: IdbAdapter | undefined;

    /** Name of the IndexedDB database backing this storage. */
    get dbName(): string {
        return this._properties?.dbName || "dn_3dobjectloader";
    }

    /**
     * Logical schema version. Doubles as IndexedDB `version` — bumping it
     * triggers `onupgradeneeded` so future schema changes can migrate
     * existing rows instead of discarding them.
     */
    get schemaVersion(): number {
        return this._properties?.schemaVersion ?? 1;
    }

    /** Maximum allowed upload size in bytes (default 10 MiB). */
    get maxFileSize(): number {
        return this._properties?.maxFileSize || 10485760;
    }

    private _getAdapter(): IdbAdapter {
        if (!this._adapter) {
            this._adapter = new IdbAdapter({
                dbName: this.dbName,
                version: this.schemaVersion
            });
        }
        return this._adapter;
    }

    /**
     * Persists the given items to IndexedDB.
     *
     * Session-only `blob:` URLs of custom items are reset to an empty string so
     * the next {@link load} knows they need to be rehydrated from the blobs store.
     */
    async save(items: ObjectItem[]): Promise<void> {
        try {
            const serializable = items.map(it => {
                if (it.source === "custom" && typeof it.meshUrl === "string" && it.meshUrl.startsWith("blob:")) {
                    return { ...it, meshUrl: "" };
                }
                return it;
            });
            await this._getAdapter().putItems(serializable);
        } catch (e) {
            LOG.error("save failed", e);
        }
    }

    /**
     * Loads the stored items and filters out any record missing required fields.
     *
     * Returns an empty array if the database is unreachable or the read fails.
     */
    async load(): Promise<ObjectItem[]> {
        try {
            const items = await this._getAdapter().getAllItems();
            return items.filter((item: any) =>
                item &&
                typeof item.id === "string" &&
                typeof item.source === "string" &&
                typeof item.x === "number" &&
                typeof item.y === "number"
            );
        } catch (e) {
            LOG.error("load failed", e);
            return [];
        }
    }

    /**
     * Stores an uploaded GLB blob under the given key.
     *
     * @returns `true` on success, `false` if the write failed.
     */
    async saveBlob(blobKey: string, blob: Blob): Promise<boolean> {
        try {
            await this._getAdapter().putBlob(blobKey, blob);
            return true;
        } catch (e) {
            LOG.error("saveBlob failed", e);
            return false;
        }
    }

    /**
     * Resolves a stored blob into a fresh `blob:` URL usable as a mesh source.
     *
     * @returns `undefined` if the blob is not in storage or the read fails.
     */
    async loadBlobUrl(blobKey: string): Promise<string | undefined> {
        try {
            const blob = await this._getAdapter().getBlob(blobKey);
            if (!blob) return undefined;
            return URL.createObjectURL(blob);
        } catch (e) {
            LOG.error("loadBlobUrl failed", e);
            return undefined;
        }
    }

    /** Removes a stored blob; errors are swallowed. */
    async deleteBlob(blobKey: string): Promise<void> {
        try {
            await this._getAdapter().deleteBlob(blobKey);
        } catch (e) {
            LOG.error("deleteBlob failed", e);
        }
    }
}
