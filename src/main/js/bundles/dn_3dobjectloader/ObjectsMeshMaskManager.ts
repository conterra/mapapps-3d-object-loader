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

import IntegratedMeshLayer from "@arcgis/core/layers/IntegratedMeshLayer";
import SceneModification from "@arcgis/core/layers/support/SceneModification";
import SceneModifications from "@arcgis/core/layers/support/SceneModifications";
import Polygon from "@arcgis/core/geometry/Polygon";
import { fromJSON } from "@arcgis/core/geometry/support/jsonUtils";
import { InjectedReference } from "apprt-core/InjectedReference";
import { loggerForName } from "apprt-core/Logger";
import { MapWidgetModel } from "map-widget/api";

const LOG = loggerForName("dn_3dobjectloader/ObjectsMeshMaskManager");

/**
 * Applies and removes `SceneModification`s ("mesh masks") on an
 * `IntegratedMeshLayer` so that placed 3D objects can carve holes into the
 * surrounding mesh.
 *
 * The configured mesh layer may not yet be part of the map when the manager is
 * first used, so `_getMeshLayer()` falls back to a bounded `after-add` watch.
 *
 * Masking is optional: without a `meshLayerId`, or if the layer is missing or
 * not an integrated mesh, all operations become no-ops and
 * {@link isAvailable} returns `false`.
 */
export default class ObjectsMeshMaskManager {
    private declare _properties: { meshLayerId?: string };
    _mapWidgetModel!: InjectedReference<MapWidgetModel>;

    /** Active modifications, keyed by owning object id. */
    private _modifications: Map<string, SceneModification> = new Map();

    /** Warn only once per layer id about a missing or unsuitable mesh layer. */
    private _warnedLayerId: string | undefined;

    /** Id of the target mesh layer; empty if masking is not configured. */
    get meshLayerId(): string {
        return this._properties?.meshLayerId || "";
    }

    /**
     * @returns `true` if a mesh layer is configured and the map currently
     *          contains an integrated mesh layer with that id.
     */
    isAvailable(): boolean {
        const meshLayerId = this.meshLayerId;
        if (!meshLayerId) return false;
        const layer = this._mapWidgetModel?.map?.findLayerById(meshLayerId);
        return this._isMeshLayer(layer);
    }

    /**
     * Applies (or replaces) the mesh mask for the given object id.
     *
     * Callers (`onMaskTranslate`, `reapplyAfterDrag`, sketch `_onMaskEdited`)
     * fire this fire-and-forget and can race through the `_getMeshLayer()`
     * await. The cache is therefore updated *before* the await (so a parallel
     * `remove()` sees the pending apply), superseded calls bail on resume,
     * and the mesh is swept by `dnObjectId` before the add — otherwise an
     * interleaved apply could leave a stale `SceneModification` behind.
     *
     * @param objectId Owner of the modification; stored as `dnObjectId` on the
     *                 `SceneModification` so it can be looked up later.
     * @param geometry ArcGIS JSON or a live `Polygon`; normalized internally.
     * @param height   Extrusion height in meters applied to every vertex.
     */
    async apply(objectId: string, geometry: any, height: number = 50): Promise<void> {
        const geom = geometry?.toJSON ? geometry : fromJSON(geometry);
        if (!geom) return;

        const geomWithZ = this._applyHeight(geom, height);

        const modification = new SceneModification({
            geometry: geomWithZ,
            type: "replace"
        });
        modification.set("dnObjectId", objectId);

        this._modifications.set(objectId, modification);

        const mesh = await this._getMeshLayer();
        if (!mesh) return;

        if (this._modifications.get(objectId) !== modification) {
            // A newer apply() or a remove() has taken over while we were
            // waiting for the mesh layer — their resolution will write the
            // authoritative state.
            return;
        }

        this._removeModificationsForObject(mesh, objectId);
        // A mesh layer without configured modifications has `modifications === null`.
        if (!mesh.modifications) {
            mesh.modifications = new SceneModifications();
        }
        mesh.modifications.add(modification);
    }

    /**
     * Removes every modification on the mesh that is tagged with the given
     * `dnObjectId`. The tag is written by `Accessor.set("dnObjectId", ...)`
     * which is a direct property assignment at runtime, so we read it back
     * as a plain property — `Accessor` does not expose a public `.get(name)`.
     */
    private _removeModificationsForObject(mesh: IntegratedMeshLayer, objectId: string): void {
        const mods = mesh.modifications;
        if (!mods) return;
        const victims = mods.filter((m) => (m as unknown as { dnObjectId?: string }).dnObjectId === objectId);
        if (victims.length) mods.removeMany(victims);
    }

    /** Returns a polygon copy with every vertex lifted to the given absolute Z. */
    private _applyHeight(polygon: any, height: number): any {
        if (!polygon?.rings) return polygon;
        const newRings = polygon.rings.map((ring: number[][]) =>
            ring.map((coord: number[]) => [coord[0], coord[1], height])
        );
        return new Polygon({
            rings: newRings,
            hasZ: true,
            spatialReference: polygon.spatialReference
        });
    }

    /**
     * Removes the stored modification of the given object from cache and mesh
     * layer. Sweeps by `dnObjectId` so any modification left behind by a raced
     * apply() is picked up as well, not just the one currently in the cache.
     */
    async remove(objectId: string): Promise<void> {
        if (!this._modifications.has(objectId)) return;
        this._modifications.delete(objectId);

        const mesh = await this._getMeshLayer();
        if (!mesh) return;
        this._removeModificationsForObject(mesh, objectId);
    }

    /**
     * Removes every modification tracked by this manager from the mesh layer and
     * clears the internal cache. Leaves modifications from other owners untouched.
     */
    async clear(): Promise<void> {
        const tracked = Array.from(this._modifications.values());
        this._modifications.clear();
        if (!tracked.length) return;
        const mesh = await this._getMeshLayer();
        if (!mesh) return;
        const mods = mesh.modifications;
        if (!mods) return;
        for (const mod of tracked) {
            const idx = mods.indexOf(mod);
            if (idx >= 0) {
                mods.removeAt(idx);
            }
        }
    }

    /**
     * Drops the in-memory lookup without touching the mesh layer.
     *
     * Used when the manager is rebuilt from scratch (e.g. after reload) and the
     * existing `SceneModification` instances on the mesh are still valid.
     */
    resetCache(): void {
        this._modifications.clear();
    }

    /**
     * Applies masks for every persisted item that carries a `maskGeometryJson`.
     *
     * Called after load, so restored objects re-punch their holes into the mesh.
     */
    async rehydrateFromItems(items: { id: string; maskGeometryJson?: any; maskHeight?: number }[]): Promise<void> {
        await Promise.all(
            items
                .filter(item => !!item.maskGeometryJson)
                .map(item => this.apply(item.id, item.maskGeometryJson, item.maskHeight ?? 50))
        );
    }

    /** @returns `true` if a modification is currently tracked for the given object. */
    hasModification(objectId: string): boolean {
        return this._modifications.has(objectId);
    }

    /** Exposes the configured mesh layer id for consumers that need to react to it. */
    getMeshLayerId(): string {
        return this.meshLayerId;
    }

    private _isMeshLayer(layer: any): layer is IntegratedMeshLayer {
        return layer?.type === "integrated-mesh";
    }

    private _warnUnavailable(meshLayerId: string, reason: string): void {
        if (this._warnedLayerId === meshLayerId) return;
        this._warnedLayerId = meshLayerId;
        LOG.warn("mesh masking disabled: layer '{}' {}", meshLayerId, reason);
    }

    /** Resolves the configured mesh layer, waiting briefly for an `after-add` event if it is not loaded yet. */
    private _getMeshLayer(): Promise<IntegratedMeshLayer | undefined> {
        const meshLayerId = this.meshLayerId;
        const mapWidgetModel = this._mapWidgetModel;
        return new Promise((resolve) => {
            if (!meshLayerId || !mapWidgetModel?.map) {
                resolve(undefined);
                return;
            }
            const found = mapWidgetModel.map.findLayerById(meshLayerId);
            if (found) {
                if (this._isMeshLayer(found)) {
                    resolve(found);
                } else {
                    this._warnUnavailable(meshLayerId, "is not an integrated mesh layer");
                    resolve(undefined);
                }
                return;
            }
            const refs: {
                handler?: { remove: () => void };
                timeout?: ReturnType<typeof setTimeout>;
            } = {};
            let done = false;
            const finish = (layer: any): void => {
                if (done) return;
                done = true;
                refs.handler?.remove();
                if (refs.timeout !== undefined) clearTimeout(refs.timeout);
                resolve(this._isMeshLayer(layer) ? layer : undefined);
            };
            refs.handler = mapWidgetModel.map.allLayers.on("after-add", (event: any) => {
                if (event.item.id === meshLayerId) {
                    finish(event.item);
                }
            });
            refs.timeout = setTimeout(() => {
                this._warnUnavailable(meshLayerId, "not available within timeout");
                finish(undefined);
            }, 2000);
        });
    }
}
