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

import Point from "@arcgis/core/geometry/Point";
import { loggerForName } from "apprt-core/Logger";
import ObjectsStorageController, { ObjectItem } from "./ObjectsStorageController";
import type { ObjectsModelProps } from "./ObjectsModel";
import { PresetModel } from "./PresetModel";

const LOG = loggerForName("dn_3dobjectloader/ObjectsPersistenceManager");
const PERSIST_DEBOUNCE_MS = 250;

/**
 * Handles persistence of placed 3D objects and acts as item factory.
 *
 * Debounces save operations, rehydrates stored items by resolving their
 * mesh URLs (preset lookup or blob-cache rehydration), and produces new
 * {@link ObjectItem} instances for preset, custom-blob and custom-URL
 * sources.
 */
export default class ObjectsPersistenceManager {
    private _persistTimeout: ReturnType<typeof setTimeout> | null = null;
    private _disposed = false;

    constructor(
        private readonly _storage: ObjectsStorageController,
        private readonly _model: ObjectsModelProps,
        private readonly _getPresetModels: () => PresetModel[]
    ) {}

    /** Debounced save; coalesces bursts of changes into a single write. */
    persist(): void {
        if (this._disposed) return;
        if (this._persistTimeout) clearTimeout(this._persistTimeout);
        this._persistTimeout = setTimeout(() => {
            this._persistTimeout = null;
            if (this._disposed) return;
            void this.persistNow();
        }, PERSIST_DEBOUNCE_MS);
    }

    /** Immediate save; also flushes any pending debounced call. */
    async persistNow(): Promise<void> {
        if (this._persistTimeout) {
            clearTimeout(this._persistTimeout);
            this._persistTimeout = null;
        }
        if (!this._storage) return;
        try {
            await this._storage.save([...this._model.items]);
        } catch (e) {
            LOG.error("persist failed", e);
        }
    }

    /** Flushes pending changes and disables further persists. Idempotent. */
    async dispose(): Promise<void> {
        if (this._disposed) return;
        this._disposed = true;
        await this.persistNow();
    }

    /** Returns true when `item` has not yet been added to `model.items`. */
    isDraft(item: ObjectItem): boolean {
        return !this._model.items.some((i: ObjectItem) => i.id === item.id);
    }

    /** Calls {@link persist} only when `item` is already part of the persisted list. */
    persistIfNotDraft(item: ObjectItem): void {
        if (!this.isDraft(item)) this.persist();
    }

    /**
     * Loads persisted items and resolves their mesh URLs.
     *
     * Preset items get their URL from the current preset list; custom
     * items are rehydrated from the blob cache. Items whose URL cannot be
     * resolved are dropped.
     *
     * @returns The restored items plus the number of dropped entries; the
     *          caller is expected to call {@link persist} again if any item
     *          was dropped so the storage matches in-memory state.
     */
    async loadAndHydrate(): Promise<{ items: ObjectItem[]; droppedCount: number }> {
        if (!this._storage) return { items: [], droppedCount: 0 };
        const stored = await this._storage.load();
        if (!stored.length) return { items: [], droppedCount: 0 };

        const presetById = new Map(this._getPresetModels().map(p => [p.id, p]));
        await Promise.all(stored.map(async (item) => {
            if (!("maskGeometryJson" in item)) item.maskGeometryJson = undefined;
            if (item.maskHeight == null) item.maskHeight = item.z ?? 0;
            if (item.source === "preset") {
                item.meshUrl = presetById.get(item.presetId ?? "")?.url ?? "";
            } else if (item.source === "custom" && item.customBlobKey) {
                const url = await this._storage.loadBlobUrl(item.customBlobKey);
                item.meshUrl = url ?? "";
            }
        }));

        const restored = stored.filter(item => !!item.meshUrl);
        const droppedCount = stored.length - restored.length;
        if (droppedCount > 0) {
            LOG.warn("dropped {} item(s) with missing mesh resource", droppedCount);
        }
        return { items: restored, droppedCount };
    }

    /**
     * Creates a fresh item from a base point and type-specific overrides.
     *
     * Starts at unit-cube dimensions and 100% scale so {@link isItemUntouched}
     * returns `true` until the user or a native-dimension read overwrites them.
     */
    createItem(
        point: Point,
        title: string,
        overrides: Partial<ObjectItem> & Pick<ObjectItem, "source" | "meshUrl">
    ): ObjectItem {
        return {
            id: this.generateId(),
            title: title || "3D object",
            x: point.x,
            y: point.y,
            z: point.z ?? 0,
            heading: 0,
            width: 1,
            depth: 1,
            height: 1,
            scalePercent: 100,
            maskGeometryJson: undefined,
            maskHeight: point.z ?? 0,
            createdAt: Date.now(),
            ...overrides
        };
    }

    /** Builds a preset-backed item whose mesh URL comes from the preset itself. */
    buildPresetItem(preset: PresetModel, point: Point, title: string): ObjectItem {
        return this.createItem(point, title, {
            source: "preset",
            presetId: preset.id,
            meshUrl: preset.url
        });
    }

    /**
     * Creates a custom item from an uploaded blob.
     *
     * The blob is stored under the new item's id so the mesh URL can be
     * rehydrated on reload.
     *
     * @returns `undefined` if the blob could not be written to the cache.
     */
    async buildCustomBlobItem(
        draft: { blob: Blob; url: string; title: string },
        point: Point,
        title: string
    ): Promise<ObjectItem | undefined> {
        // Dedicated blob URL per item — keeps the upload slot's preview URL
        // (draft.url) independent from the item's lifecycle so discarding the
        // item does not invalidate the widget's file preview.
        const item = this.createItem(point, title || draft.title, {
            source: "custom",
            meshUrl: URL.createObjectURL(draft.blob)
        });
        item.customBlobKey = item.id;
        const ok = (await this._storage?.saveBlob(item.id, draft.blob)) ?? false;
        if (!ok) {
            try { URL.revokeObjectURL(item.meshUrl); } catch { /* noop */ }
            LOG.warn("saveBlob failed — aborting placement");
            return undefined;
        }
        return item;
    }

    /** Builds a custom item whose mesh is loaded directly from a remote URL (no blob cache). */
    buildCustomUrlItem(url: string, point: Point, title: string): ObjectItem {
        return this.createItem(point, title, {
            source: "custom",
            meshUrl: url
        });
    }

    /** Cheap non-cryptographic id, good enough for per-session disambiguation. */
    generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }
}
