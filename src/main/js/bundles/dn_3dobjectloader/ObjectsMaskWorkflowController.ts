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

import Graphic from "@arcgis/core/Graphic";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Point from "@arcgis/core/geometry/Point";
import Polygon from "@arcgis/core/geometry/Polygon";
import type SpatialReference from "@arcgis/core/geometry/SpatialReference";
import * as containsOperator from "@arcgis/core/geometry/operators/containsOperator";
import { fromJSON } from "@arcgis/core/geometry/support/jsonUtils";
import { loggerForName } from "apprt-core/Logger";
import { MapWidgetModel } from "map-widget/api";
import { ObjectItem, isItemUntouched } from "./ObjectsStorageController";
import ObjectsGraphicsManager from "./ObjectsGraphicsManager";
import ObjectsMeshMaskManager from "./ObjectsMeshMaskManager";
import ObjectsSketchManager from "./ObjectsSketchManager";
import type { ObjectsModelProps } from "./ObjectsModel";
import { metersToMapOffset } from "./spatialReferenceUtils";

const LOG = loggerForName("dn_3dobjectloader/ObjectsMaskWorkflowController");

export interface MaskWorkflowOptions {
    /** Resolves the spatial reference of mask polygons (configured or taken from the map). */
    getSpatialReference: () => SpatialReference | undefined;
}

export interface MaskWorkflowCallbacks {
    /** Called after a state-mutating update; caller decides whether to actually persist. */
    onPersist: (item: ObjectItem) => void;
}

/**
 * Owns the mesh-mask workflow: drawing, editing, resetting and re-leveling the
 * polygon that carves a hole into the underlying `IntegratedMeshLayer`.
 *
 * Coordinates with the {@link ObjectsGraphicsManager} to read/write the mask
 * graphic, with the {@link ObjectsMeshMaskManager} for `SceneModification`
 * lifecycle, and with the {@link ObjectsSketchManager} for polygon draw/edit
 * gestures.
 */
export default class ObjectsMaskWorkflowController {
    private _maskLayer: GraphicsLayer | null = null;
    private _lastValidMaskGeometryJson: any | undefined = undefined;
    private _lastValidMaskHeight: number | undefined = undefined;

    constructor(
        private readonly _mapWidgetModel: MapWidgetModel,
        private readonly _graphicsManager: ObjectsGraphicsManager,
        private readonly _meshMaskManager: ObjectsMeshMaskManager,
        private readonly _sketchManager: ObjectsSketchManager,
        private readonly _model: ObjectsModelProps,
        private readonly _opts: MaskWorkflowOptions,
        private readonly _callbacks: MaskWorkflowCallbacks
    ) {}

    /** Removes the mask layer from the map. */
    destroy(): void {
        if (this._maskLayer) {
            const map = this._mapWidgetModel?.map;
            if (map) map.remove(this._maskLayer);
            this._maskLayer = null;
        }
        this._lastValidMaskGeometryJson = undefined;
        this._lastValidMaskHeight = undefined;
    }

    /** Returns (or lazily creates) a dedicated GraphicsLayer for mask polygons, separate from the object layers. */
    private _ensureMaskLayer(): GraphicsLayer {
        if (this._maskLayer) return this._maskLayer;
        this._maskLayer = new GraphicsLayer({
            listMode: "hide",
            elevationInfo: { mode: "absolute-height" }
        });
        const map = this._mapWidgetModel?.map;
        if (map) map.add(this._maskLayer);
        return this._maskLayer;
    }

    /**
     * Opens (or re-opens) the mesh-mask editor for the currently selected item.
     *
     * If the item has no mask yet, a polygon is approximated from the object's
     * footprint (width/depth/heading/scalePercent, with native-dim fallback),
     * persisted and applied as a `SceneModification` before the sketch update
     * starts.
     */
    async openMask(): Promise<void> {
        const model = this._model;
        const item = model?.currentItem;
        if (!item) return;
        if (!this._graphicsManager?.getLayerForItem(item.id)) return;
        const maskLayer = this._ensureMaskLayer();

        this._sketchManager?.destroy();
        this._graphicsManager.clearHighlight();
        this.removeMaskGraphic(item.id);

        let polygon: Polygon;
        if (item.maskGeometryJson) {
            polygon = fromJSON(item.maskGeometryJson) as Polygon;
            if (!polygon.hasZ) {
                polygon.hasZ = true;
                polygon.rings = polygon.rings.map(ring =>
                    ring.map((c: number[]) => [c[0], c[1], item.maskHeight ?? item.z])
                );
            }
        } else {
            polygon = this._approximateMaskFromObject(item, item.z);
            item.maskGeometryJson = polygon.toJSON();
            item.maskHeight = item.z;
        }

        const maskGraphic = new Graphic({
            geometry: polygon,
            attributes: { dnMaskId: item.id }
        });
        maskLayer.add(maskGraphic);

        this._syncObjectToMaskHeight(item);
        await this._meshMaskManager?.apply(item.id, polygon, item.maskHeight ?? item.z);
        this._callbacks.onPersist(item);
        this._lastValidMaskGeometryJson = polygon.toJSON();
        this._lastValidMaskHeight = item.maskHeight;

        await this._sketchManager?.startMaskUpdate(maskGraphic, maskLayer, this._buildMaskSketchCallbacks(item));

        model.mode = "maskEditing";
        model.currentItem = item;
    }

    /**
     * Enters mask-draw mode: clears any existing mask for the current item and
     * starts a polygon draw. On completion the polygon is projected to the
     * object's Z (the absolute elevation from step 2) and {@link openMask} takes
     * over for further editing.
     */
    async startMaskDraw(): Promise<void> {
        const model = this._model;
        const item = model?.currentItem;
        if (!item) return;
        if (!this._graphicsManager?.getLayerForItem(item.id)) return;
        const maskLayer = this._ensureMaskLayer();
        this._sketchManager?.cancel();
        this.removeMaskGraphic(item.id);
        await this._meshMaskManager?.remove(item.id);
        await this._sketchManager?.startMaskDraw(maskLayer, {
            onMove: () => { /* ignore */ },
            onRotate: () => { /* ignore */ },
            onScale: () => { /* ignore */ },
            onMaskComplete: async (polygon: any) => {
                const withZ = this._applyZToPolygon(polygon, item.z);
                item.maskGeometryJson = withZ.toJSON ? withZ.toJSON() : withZ;
                item.maskHeight = item.z;
                maskLayer.removeAll();
                this._callbacks.onPersist(item);
                await this.openMask();
            }
        });
        model.mode = "maskDrawing";
    }

    /**
     * Clears the current item's mask (graphic + `SceneModification`) and, if the
     * mask step is open, immediately re-opens it with a fresh default polygon.
     */
    async resetMask(): Promise<void> {
        const model = this._model;
        const item = model?.currentItem;
        if (!item) return;
        item.maskGeometryJson = undefined;
        this._sketchManager?.cancel();
        this.removeMaskGraphic(item.id);
        await this._meshMaskManager?.remove(item.id);
        this._callbacks.onPersist(item);
        if (model.workflowStep === 3) {
            await this.openMask();
        }
    }

    /**
     * Re-levels the mask polygon to the given absolute Z value and re-applies
     * it to the mesh. The object's Z is adjusted in sync.
     */
    async updateMaskHeight(item: ObjectItem, height: number): Promise<void> {
        if (!isFinite(height)) height = 0;
        item.maskHeight = height;
        this._syncObjectToMaskHeight(item);
        if (!item.maskGeometryJson) return;

        const polygon = this._applyZToPolygon(fromJSON(item.maskGeometryJson), height);
        item.maskGeometryJson = polygon.toJSON();
        this._lastValidMaskGeometryJson = item.maskGeometryJson;
        this._lastValidMaskHeight = height;

        const graphic = this.findMaskGraphic(item.id);
        if (graphic) {
            graphic.geometry = polygon;
            if (this._sketchManager && this._maskLayer) {
                this._sketchManager.cancel();
                await this._sketchManager.startMaskUpdate(
                    graphic, this._maskLayer, this._buildMaskSketchCallbacks(item)
                );
            }
        }

        await this._meshMaskManager?.apply(item.id, polygon, height);
        this._callbacks.onPersist(item);
        const model = this._model;
        if (model?.currentItem?.id === item.id) {
            model.currentItem = item;
        }
    }

    /**
     * Translates the mask polygon by (dx, dy, dz) when the owning object moves.
     *
     * Also re-applies the `SceneModification` once the move is not part of an
     * ongoing sketch drag — the sketch-drag end-hook handles re-application
     * once, avoiding cache churn during the drag.
     */
    translateMask(item: ObjectItem, dx: number, dy: number, dz: number): void {
        if (!item.maskGeometryJson) return;
        const poly = fromJSON(item.maskGeometryJson) as Polygon;
        if (!poly?.rings) return;
        const rings = poly.rings.map((ring: number[][]) =>
            ring.map((c: number[]) => [c[0] + dx, c[1] + dy, (c[2] ?? 0) + dz])
        );
        const newPoly = new Polygon({
            rings,
            hasZ: true,
            spatialReference: poly.spatialReference
        });
        item.maskGeometryJson = newPoly.toJSON();
        item.maskHeight = (item.maskHeight ?? 0) + dz;

        const maskGraphic = this.findMaskGraphic(item.id);
        if (maskGraphic) {
            maskGraphic.geometry = newPoly;
        }
        if (!this._graphicsManager.sketchDragActive) {
            this._meshMaskManager?.apply(item.id, newPoly, item.maskHeight).catch((e: unknown) => {
                LOG.warn("mesh apply (translate) failed", e);
            });
        }
    }

    /**
     * Discards the current mask polygon and rebuilds it from the object's
     * current width/depth/heading/scalePercent. Called after the object is
     * rotated, scaled, or has its dimensions edited — the new footprint must
     * be the approximation around the transformed object, any manual polygon
     * edits are intentionally dropped.
     *
     * Mesh re-apply is skipped during an active sketch drag; the drag-end
     * hook (`reapplyAfterDrag`) will pick up the updated polygon.
     */
    reapproximateMask(item: ObjectItem): void {
        if (!item.maskGeometryJson) return;
        const baseZ = item.maskHeight ?? 0;
        const polygon = this._approximateMaskFromObject(item, baseZ);
        item.maskGeometryJson = polygon.toJSON();
        item.maskHeight = baseZ;

        const graphic = this.findMaskGraphic(item.id);
        if (graphic) {
            graphic.geometry = polygon;
        }

        if (!this._graphicsManager.sketchDragActive) {
            this._meshMaskManager?.apply(item.id, polygon, baseZ).catch((e: unknown) => {
                LOG.warn("mesh apply (reapproximate) failed", e);
            });
        }
    }

    /** Re-applies the mesh mask after a sketch drag ends. */
    reapplyAfterDrag(item: ObjectItem): void {
        if (!item.maskGeometryJson) return;
        const poly = fromJSON(item.maskGeometryJson) as Polygon;
        if (!poly) return;
        this._meshMaskManager
            ?.apply(item.id, poly, item.maskHeight ?? 0)
            .catch((e: unknown) => {
                LOG.warn("mesh apply (drag end) failed", e);
            });
    }

    /** Finds the mask polygon graphic belonging to the given object (tagged by `dnMaskId`). */
    findMaskGraphic(id: string): Graphic | undefined {
        if (!this._maskLayer) return undefined;
        return this._maskLayer.graphics.find((g: Graphic) => g.attributes?.dnMaskId === id);
    }

    /** Removes the mask polygon graphic from the mask layer (keeps the `SceneModification`). */
    removeMaskGraphic(id: string): void {
        const g = this.findMaskGraphic(id);
        if (g) this._maskLayer?.remove(g);
    }

    /**
     * Live preview during a mask drag — runs per frame, must stay cheap.
     *
     * Re-levels the mask height from the polygon's average Z so the object
     * Z stays snapped to the mask plane; persistence and the expensive
     * `IntegratedMeshLayer` re-clip are deferred to {@link _onMaskEditCommit}.
     * The object's XY are intentionally not touched — the polygon must stay
     * around the object, not the other way around.
     */
    private _onMaskEditPreview(item: ObjectItem, polygon: Polygon): void {
        if (polygon.hasZ && polygon.rings?.[0]) {
            const zs = polygon.rings[0].map((c: number[]) => c[2] ?? 0);
            const avg = zs.reduce((a: number, b: number) => a + b, 0) / zs.length;
            item.maskHeight = +avg.toFixed(2);
        }
        this._syncObjectToMaskHeight(item);
    }

    /**
     * Called once per drag release — commits the final polygon to storage and
     * re-applies the `SceneModification` to the `IntegratedMeshLayer`.
     *
     * If the committed polygon no longer contains the object (in XY), the
     * edit is discarded and the last valid polygon is restored — the object
     * itself is fixed in step 3 and the mask must always wrap it.
     */
    private _onMaskEditCommit(item: ObjectItem, polygon: Polygon): void {
        if (!this._polygonContainsObject(polygon, item)) {
            this._revertMaskEdit(item);
            return;
        }
        const polygonJson = polygon.toJSON ? polygon.toJSON() : polygon;
        item.maskGeometryJson = polygonJson;
        this._lastValidMaskGeometryJson = polygonJson;
        this._lastValidMaskHeight = item.maskHeight;
        this._meshMaskManager?.apply(item.id, polygon, item.maskHeight ?? 0).catch((e: unknown) => {
            LOG.warn("mesh apply failed", e);
        });
        this._callbacks.onPersist(item);
        const model = this._model;
        if (model?.currentItem?.id === item.id) {
            model.currentItem = item;
        }
    }

    /**
     * 2D containment test of the object position against the polygon footprint.
     *
     * Polygon and point are flattened to XY before the check — `containsOperator`
     * with mixed-Z geometries can yield surprising results when the polygon
     * sits on a non-zero Z plane.
     */
    private _polygonContainsObject(polygon: Polygon, item: ObjectItem): boolean {
        const rings = polygon.rings || [];
        if (!rings.length) return false;
        const flatRings = rings.map(ring => ring.map(c => [c[0], c[1]]));
        const polygon2D = new Polygon({
            rings: flatRings,
            spatialReference: polygon.spatialReference
        });
        const point2D = new Point({
            x: item.x,
            y: item.y,
            spatialReference: polygon.spatialReference
        });
        return containsOperator.execute(polygon2D, point2D);
    }

    /**
     * Restores the polygon graphic, mesh modification and sketch handles to
     * the last valid polygon snapshot. Used when an edit would push the
     * object out of the mask.
     *
     * Order matters: cancel the sketch update first so the SketchViewModel
     * releases its edit copy of the graphic, then overwrite the geometry,
     * re-apply the mesh modification and finally rearm the sketch. Setting
     * the geometry while the sketch is still in update mode is silently
     * dropped because the SketchViewModel keeps its own working copy.
     */
    private _revertMaskEdit(item: ObjectItem): void {
        const snapshot = this._lastValidMaskGeometryJson;
        if (!snapshot) return;
        const restored = fromJSON(snapshot) as Polygon;
        if (!restored) return;

        // The live preview already wrote the (about-to-be-rejected) average Z
        // into item.maskHeight/item.z; roll those back to the snapshot height
        // before re-applying anything mesh- or sketch-side.
        if (this._lastValidMaskHeight !== undefined) {
            item.maskHeight = this._lastValidMaskHeight;
            this._syncObjectToMaskHeight(item);
        }

        const maskGraphic = this.findMaskGraphic(item.id);

        this._sketchManager?.cancel();

        if (maskGraphic) {
            maskGraphic.geometry = restored;
        }
        this._meshMaskManager?.apply(item.id, restored, item.maskHeight ?? 0).catch((e: unknown) => {
            LOG.warn("mesh apply (revert) failed", e);
        });

        if (this._sketchManager && this._maskLayer && maskGraphic) {
            this._sketchManager.startMaskUpdate(
                maskGraphic, this._maskLayer, this._buildMaskSketchCallbacks(item)
            ).catch((e: unknown) => {
                LOG.warn("sketch restart (revert) failed", e);
            });
        }

        const model = this._model;
        if (model?.currentItem?.id === item.id) {
            model.currentItem = item;
        }
    }

    /** Build the polygon-edit callbacks for the sketch manager — shared between openMask, updateMaskHeight and revert. */
    private _buildMaskSketchCallbacks(item: ObjectItem) {
        return {
            onMaskUpdate: (updated: Polygon) => this._onMaskEditPreview(item, updated),
            onMaskDragEnd: (updated: Polygon) => this._onMaskEditCommit(item, updated)
        };
    }

    /** Mirrors `item.maskHeight` into `item.z` so the object floor rests on the mask level. */
    private _syncObjectToMaskHeight(item: ObjectItem): void {
        const height = item.maskHeight;
        if (typeof height !== "number" || !isFinite(height)) return;
        item.z = height;
        const graphic = this._graphicsManager.findGraphic(item.id);
        if (graphic) {
            graphic.geometry = this._graphicsManager.makePoint(item);
        }
    }

    /** Returns a copy of the polygon with every vertex set to the given absolute Z. */
    private _applyZToPolygon(polygon: any, height: number): Polygon {
        const rings = (polygon.rings || []).map((ring: number[][]) =>
            ring.map((c: number[]) => [c[0], c[1], height])
        );
        return new Polygon({
            rings,
            hasZ: true,
            spatialReference: polygon.spatialReference
        });
    }

    /**
     * Builds a default mask polygon from the object's footprint.
     *
     * Effective width/depth come from `item.width * scalePercent/100` (and
     * respective depth). For items still holding unit-cube defaults the native
     * GLB dimensions are used; if those are not yet available (native-dim read
     * runs asynchronously after placement), a 5 m fallback is used.
     *
     * A heading-rotated rectangle (CW about +Z, matching
     * `ObjectSymbol3DLayer.heading`) is built around the object's (x, y) with
     * a small padding (max of 0.5 m and 10 % of the larger dimension).
     */
    private _approximateMaskFromObject(item: ObjectItem, baseZ: number): Polygon {
        const untouched = isItemUntouched(item);
        const FALLBACK = 5;
        const effWidth = untouched
            ? (item.nativeWidth ?? FALLBACK)
            : item.width * (item.scalePercent / 100);
        const effDepth = untouched
            ? (item.nativeDepth ?? FALLBACK)
            : item.depth * (item.scalePercent / 100);
        const padding = Math.max(0.5, 0.1 * Math.max(effWidth, effDepth));
        const hw = effWidth / 2 + padding;
        const hd = effDepth / 2 + padding;
        const h = (item.heading * Math.PI) / 180;
        const cos = Math.cos(h);
        const sin = Math.sin(h);
        const corners: Array<[number, number]> = [
            [hw, hd], [-hw, hd], [-hw, -hd], [hw, -hd]
        ];
        const sr = this._opts.getSpatialReference();
        // Corner offsets are meters; convert them to map units at the object's position.
        const rotated = corners.map(([u, v]) => {
            const [dx, dy] = metersToMapOffset(sr, item.x, item.y, u * cos + v * sin, -u * sin + v * cos);
            return [item.x + dx, item.y + dy, baseZ];
        });
        rotated.push(rotated[0]);
        return new Polygon({
            rings: [rotated],
            hasZ: true,
            spatialReference: sr
        });
    }

}
