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

import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import GroupLayer from "@arcgis/core/layers/GroupLayer";
import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import type SpatialReference from "@arcgis/core/geometry/SpatialReference";
import { coordinateDecimals } from "./spatialReferenceUtils";
import PointSymbol3D from "@arcgis/core/symbols/PointSymbol3D";
import ObjectSymbol3DLayer from "@arcgis/core/symbols/ObjectSymbol3DLayer";
import Collection from "@arcgis/core/core/Collection";
import SceneView from "@arcgis/core/views/SceneView";
import HighlightOptions from "@arcgis/core/views/support/HighlightOptions";
import PopupTemplate from "@arcgis/core/PopupTemplate";
import { loggerForName } from "apprt-core/Logger";
import { MapWidgetModel } from "map-widget/api";
import { I18N } from "apprt/api";
import { I18NKeys } from "./nls/bundle";
import { ObjectItem, isItemUntouched } from "./ObjectsStorageController";
import type { ObjectsModelProps } from "./ObjectsModel";
import ObjectsSketchManager from "./ObjectsSketchManager";
import { waitForView } from "./waitForView";

const LOG = loggerForName("dn_3dobjectloader/ObjectsGraphicsManager");

export const HIGHLIGHT_NAME = "dn-3dobjectloader";
export const OBJECTS_LAYER_MARKER = "dnObjectsLayer";

export const POPUP_ACTION_EDIT = "dn-3dobjectloader-edit";
export const POPUP_ACTION_DELETE = "dn-3dobjectloader-delete";

export interface GraphicsManagerOptions {
    groupLayerId: string;
    /** Resolves the spatial reference of placed objects (configured or taken from the map). */
    getSpatialReference: () => SpatialReference | undefined;
    highlightColor: number[];
}

export interface GraphicsManagerCallbacks {
    /** Called after a state-mutating update; caller decides whether to actually persist. */
    onPersist: (item: ObjectItem) => void;
    /** Called when {@link ObjectsGraphicsManager.updatePosition} detects a mask-bearing item has moved. */
    onMaskTranslate: (item: ObjectItem, dx: number, dy: number, dz: number) => void;
    /** Called after heading/scale/dimensions change so the mask footprint can be re-approximated. */
    onMaskReapproximate: (item: ObjectItem) => void;
    /** Called after a sketch drag ends so callers can re-apply mesh masks. */
    onSketchDragEnd: (item: ObjectItem) => void;
    /** Resolves an item by id, including the current draft. */
    getItem: (id: string | undefined) => ObjectItem | undefined;
}

/**
 * Owns the per-object `GraphicsLayer`s (grouped under a shared `GroupLayer`)
 * that render placed 3D objects and the symbol transformations (position,
 * rotation, dimensions, scale) that keep them in sync with the `ObjectsModel`.
 *
 * Each placed object lives in its own `GraphicsLayer` so it appears as a
 * dedicated, toggleable entry in the TOC/layer-widget.
 *
 * Also provides selection highlighting, builds the `PopupTemplate` with the
 * zoom/edit/delete actions, and drives the {@link ObjectsSketchManager} for
 * interactive transforms. Persistence and mesh-mask coupling stay out of the
 * manager and are routed through {@link GraphicsManagerCallbacks}; mask
 * polygon graphics are not managed here — they live in a separate shared
 * layer owned by `ObjectsMaskWorkflowController`.
 */
export default class ObjectsGraphicsManager {
    private _groupLayer: GroupLayer | null = null;
    private _layersByItemId = new Map<string, GraphicsLayer>();
    private _highlightHandle: any = null;
    private _highlightedId: string | null = null;
    private _sketchDragActive: boolean = false;
    private _scalePercentAtDragStart: number = 100;
    private _popupTemplate: PopupTemplate | null = null;
    private _resolveLoggedError: boolean = false;

    constructor(
        private readonly _mapWidgetModel: MapWidgetModel,
        private readonly _sketchManager: ObjectsSketchManager,
        private readonly _model: ObjectsModelProps,
        private readonly _i18n: I18N<I18NKeys> | undefined,
        private readonly _opts: GraphicsManagerOptions,
        private readonly _callbacks: GraphicsManagerCallbacks
    ) {}

    get groupLayer(): GroupLayer | null { return this._groupLayer; }
    get sketchDragActive(): boolean { return this._sketchDragActive; }

    /** Returns the per-item GraphicsLayer for a placed object, or `undefined` if none exists yet. */
    getLayerForItem(id: string): GraphicsLayer | undefined {
        return this._layersByItemId.get(id);
    }

    /**
     * Binds the GroupLayer that holds the per-object layers.
     *
     * If the app declares a `GROUP` layer with the id given by
     * {@link GraphicsManagerOptions.groupLayerId} in `map-init.Config.map.layers`,
     * that layer is used, so apps control its title and position in the table
     * of contents. Otherwise the group layer is created and added on top of
     * the map.
     *
     * @returns `true` when the layer is now bound to `_groupLayer`; `false`
     *   when the map is not yet available or the id is used by a non-group
     *   layer. In the latter case a single `LOG.error` is emitted and all
     *   further layer-touching operations become no-ops.
     */
    resolveGroupLayer(): boolean {
        const map = this._mapWidgetModel?.map;
        if (!map) return false;
        const groupId = this._opts.groupLayerId;
        // Identity check via `type === "group"` rather than `instanceof GroupLayer`:
        // map-init can load its own `@arcgis/core/layers/GroupLayer` copy with a
        // distinct class identity, which would make `instanceof` fail even when the
        // layer is a fully functional GroupLayer.
        const layer = map.findLayerById(groupId);
        if (!layer) {
            const created = new GroupLayer({
                id: groupId,
                title: this._i18n?.get().groupLayer.title || "3D objects"
            });
            map.add(created);
            this._groupLayer = created;
            this._resolveLoggedError = false;
            return true;
        }
        if (layer.type !== "group") {
            this._groupLayer = null;
            if (!this._resolveLoggedError) {
                LOG.error("layer '{}' is not a group layer; change groupLayerId — bundle inactive", groupId);
                this._resolveLoggedError = true;
            }
            return false;
        }
        this._groupLayer = layer as GroupLayer;
        this._resolveLoggedError = false;
        return true;
    }

    /**
     * Waits until the map is available (map-init publishes it together with
     * all configured layers), then binds or creates the group layer via
     * {@link resolveGroupLayer}.
     */
    async waitForGroupLayer(timeoutMs: number = 10000, pollMs: number = 100): Promise<boolean> {
        const start = Date.now();
        while (!this._mapWidgetModel?.map && Date.now() - start < timeoutMs) {
            await new Promise((r) => setTimeout(r, pollMs));
        }
        return this.resolveGroupLayer();
    }

    /** Clears all per-item layers and re-adds them for every item that still has a mesh URL. */
    rebuildForNewView(items: ObjectItem[]): void {
        if (this._groupLayer) {
            for (const layer of this._layersByItemId.values()) {
                this._groupLayer.remove(layer);
            }
        }
        this._layersByItemId.clear();
        for (const item of items) {
            if (!item.meshUrl) continue;
            this._createItemLayer(item);
        }
    }

    /** Creates a per-item layer, adds the graphic, registers it with the group layer, and returns the graphic. */
    addGraphic(item: ObjectItem): Graphic | undefined {
        if (!this._groupLayer) return undefined;
        const layer = this._layersByItemId.get(item.id);
        if (!layer) {
            return this._createItemLayer(item);
        }
        const previous = layer.graphics.find((g: Graphic) => g.attributes?.dnObjectId === item.id);
        if (previous) layer.remove(previous);
        const g = this.createGraphic(item);
        layer.add(g);
        layer.title = this._layerTitleFor(item);
        return g;
    }

    /** Removes the per-item layer (and its graphics) entirely. */
    removeGraphic(id: string): void {
        if (this._highlightedId === id) this.clearHighlight();
        const layer = this._layersByItemId.get(id);
        if (layer) {
            this._groupLayer?.remove(layer);
            this._layersByItemId.delete(id);
        }
    }

    private _createItemLayer(item: ObjectItem): Graphic | undefined {
        if (!this._groupLayer) return undefined;
        const layer = new GraphicsLayer({
            id: `${this._opts.groupLayerId}-item-${item.id}`,
            title: this._layerTitleFor(item),
            listMode: "show",
            elevationInfo: { mode: "absolute-height" }
        });
        (layer as any)[OBJECTS_LAYER_MARKER] = true;
        (layer as any).dnObjectId = item.id;
        const g = this.createGraphic(item);
        layer.add(g);
        this._groupLayer.add(layer);
        this._layersByItemId.set(item.id, layer);
        return g;
    }

    private _layerTitleFor(item: ObjectItem): string {
        return item.title || this._i18n?.get().groupLayer.title || "3D Object";
    }

    private _attributesFor(item: ObjectItem): Record<string, unknown> {
        const factor = item.scalePercent / 100;
        return {
            dnObjectId: item.id,
            title: item.title,
            width: item.width * factor,
            depth: item.depth * factor,
            height: item.height * factor,
            x: item.x,
            y: item.y,
            z: item.z,
            createdAt: item.createdAt
        };
    }

    createGraphic(item: ObjectItem): Graphic {
        const geometry = this.makePoint(item);
        const factor = item.scalePercent / 100;
        const useExplicit = !isItemUntouched(item);

        const symbolLayer = new ObjectSymbol3DLayer({
            resource: { href: item.meshUrl },
            heading: item.heading,
            anchor: "bottom",
            ...(useExplicit
                ? {
                    width: item.width * factor,
                    depth: item.depth * factor,
                    height: item.height * factor
                }
                : {})
        });

        return new Graphic({
            geometry,
            attributes: this._attributesFor(item),
            symbol: new PointSymbol3D({
                symbolLayers: new Collection([symbolLayer])
            }),
            popupTemplate: this._getPopupTemplate()
        });
    }

    applySymbol(item: ObjectItem): void {
        const graphic = this.findGraphic(item.id);
        if (!graphic) return;
        const factor = item.scalePercent / 100;
        const sym = (graphic.symbol as PointSymbol3D).clone();
        const layer = sym.symbolLayers.getItemAt(0) as ObjectSymbol3DLayer;
        layer.width = item.width * factor;
        layer.depth = item.depth * factor;
        layer.height = item.height * factor;
        layer.heading = item.heading;
        graphic.symbol = sym;
        graphic.attributes = this._attributesFor(item);
    }

    findGraphic(id: string): Graphic | undefined {
        const layer = this._layersByItemId.get(id);
        if (!layer) return undefined;
        return layer.graphics.find((g: Graphic) => g.attributes?.dnObjectId === id);
    }

    makePoint(item: { x: number; y: number; z: number }): Point {
        return new Point({
            x: item.x,
            y: item.y,
            z: item.z,
            spatialReference: this._opts.getSpatialReference()
        });
    }

    async selectGraphic(id: string): Promise<void> {
        const layer = this._layersByItemId.get(id);
        const graphic = this.findGraphic(id);
        if (!graphic || !layer) return;
        const view = await waitForView(this._mapWidgetModel);
        if (!view) return;
        this.clearHighlight();
        try {
            const lv = await view.whenLayerView(layer) as any;
            if (lv?.highlight) {
                this._highlightHandle = lv.highlight(graphic, { name: HIGHLIGHT_NAME });
                this._highlightedId = id;
            }
        } catch (e) {
            LOG.warn("highlight failed", e);
        }
    }

    clearHighlight(): void {
        if (this._highlightHandle) {
            try {
                this._highlightHandle.remove();
            } catch {
                // ignore
            }
            this._highlightHandle = null;
        }
        this._highlightedId = null;
    }

    async installHighlightPreset(): Promise<void> {
        const view = await waitForView(this._mapWidgetModel);
        if (!view) return;
        try {
            this.uninstallHighlightPreset();
            view.highlights.add(new HighlightOptions({
                name: HIGHLIGHT_NAME,
                color: this._opts.highlightColor,
                haloOpacity: 0.9,
                fillOpacity: 0.2
            }));
        } catch (e) {
            LOG.warn("highlight preset setup failed", e);
        }
    }

    uninstallHighlightPreset(): void {
        const view = this._mapWidgetModel?.view as SceneView | undefined;
        if (!view) return;
        const toRemove = view.highlights.filter(h => h.name === HIGHLIGHT_NAME);
        view.highlights.removeMany(toRemove);
    }

    /** Applies new position coordinates; delegates mask translation via callback. */
    updatePosition(item: ObjectItem, coords: { x?: number; y?: number; z?: number }): void {
        const newX = typeof coords.x === "number" ? coords.x : item.x;
        const newY = typeof coords.y === "number" ? coords.y : item.y;
        const newZ = typeof coords.z === "number" ? coords.z : item.z;
        const dx = newX - item.x;
        const dy = newY - item.y;
        const dz = newZ - item.z;
        if (dx === 0 && dy === 0 && dz === 0) return;
        item.x = newX;
        item.y = newY;
        item.z = newZ;
        if (item.maskGeometryJson) {
            this._callbacks.onMaskTranslate(item, dx, dy, dz);
        }
        if (!this._sketchDragActive) {
            const graphic = this.findGraphic(item.id);
            if (graphic) {
                graphic.geometry = this.makePoint(item);
                graphic.attributes = this._attributesFor(item);
            }
        }
        this.refreshCurrentItem();
        this._callbacks.onPersist(item);
    }

    /** Sets the heading in degrees; the value is normalized into [0, 360). */
    updateHeading(item: ObjectItem, heading: number): void {
        const normalized = ((heading % 360) + 360) % 360;
        if (Math.abs(normalized - item.heading) < 0.001) return;
        item.heading = normalized;
        if (!this._sketchDragActive) {
            this.applySymbol(item);
        }
        this.refreshCurrentItem();
        this._callbacks.onMaskReapproximate(item);
        this._callbacks.onPersist(item);
    }

    /**
     * Updates the item's title and refreshes the derived surfaces that cache
     * the title independently: the per-item `GraphicsLayer.title` (visible in
     * the TOC) and the `Graphic.attributes.title` that the shared
     * `PopupTemplate` resolves via `"{title}"`.
     */
    updateTitle(item: ObjectItem, title: string): void {
        if (item.title === title) return;
        item.title = title;
        const layer = this._layersByItemId.get(item.id);
        if (layer) {
            layer.title = this._layerTitleFor(item);
        }
        const graphic = this.findGraphic(item.id);
        if (graphic) {
            graphic.attributes = this._attributesFor(item);
        }
        this.refreshCurrentItem();
        this._callbacks.onPersist(item);
    }

    /**
     * Updates width/depth/height (in meters at 100% scale).
     *
     * When `opts.proportional` is `true`, the first changed dimension defines a
     * uniform scale ratio that is applied to all three axes; otherwise each
     * provided dimension is set independently.
     */
    updateDimensions(
        item: ObjectItem,
        dims: { width?: number; depth?: number; height?: number },
        opts?: { proportional?: boolean }
    ): void {
        const proportional = opts?.proportional ?? this._model.proportional;
        const factor = item.scalePercent > 0 ? item.scalePercent / 100 : 1;

        const candidate = {
            width: dims.width !== undefined ? dims.width / factor : undefined,
            depth: dims.depth !== undefined ? dims.depth / factor : undefined,
            height: dims.height !== undefined ? dims.height / factor : undefined
        };

        const prev = { width: item.width, depth: item.depth, height: item.height };
        if (proportional) {
            const changed = Object.entries(candidate).find(([, v]) => typeof v === "number" && v > 0);
            if (changed) {
                const [field, newBase] = changed as [keyof typeof candidate, number];
                const oldBase = item[field];
                const ratio = oldBase > 0 ? newBase / oldBase : 1;
                item.width = +(item.width * ratio).toFixed(4);
                item.depth = +(item.depth * ratio).toFixed(4);
                item.height = +(item.height * ratio).toFixed(4);
            }
        } else {
            if (candidate.width !== undefined && candidate.width > 0) item.width = +candidate.width.toFixed(4);
            if (candidate.depth !== undefined && candidate.depth > 0) item.depth = +candidate.depth.toFixed(4);
            if (candidate.height !== undefined && candidate.height > 0) item.height = +candidate.height.toFixed(4);
        }

        const noChange =
            Math.abs(prev.width - item.width) < 1e-4 &&
            Math.abs(prev.depth - item.depth) < 1e-4 &&
            Math.abs(prev.height - item.height) < 1e-4;
        if (noChange) return;

        if (!this._sketchDragActive) {
            this.applySymbol(item);
        }
        this.refreshCurrentItem();
        this._callbacks.onMaskReapproximate(item);
        this._callbacks.onPersist(item);
        if (!this._sketchDragActive) {
            this.refreshSketchReference(item.id);
        }
    }

    updateScale(item: ObjectItem, percent: number): void {
        if (!isFinite(percent) || percent <= 0) percent = 1;
        if (Math.abs(percent - item.scalePercent) < 0.01) return;
        item.scalePercent = percent;
        if (!this._sketchDragActive) {
            this.applySymbol(item);
        }
        this.refreshCurrentItem();
        this._model.scalePercent = percent;
        this._callbacks.onMaskReapproximate(item);
        this._callbacks.onPersist(item);
        if (!this._sketchDragActive) {
            this.refreshSketchReference(item.id);
        }
    }

    applyScaleFactor(item: ObjectItem, factor: number): void {
        if (!factor || !isFinite(factor) || factor <= 0) return;
        const base = this._sketchDragActive ? this._scalePercentAtDragStart : item.scalePercent;
        const raw = base * factor;
        if (!isFinite(raw)) return;
        const nextScale = Math.max(1, raw);
        this.updateScale(item, +nextScale.toFixed(2));
    }

    setProportional(proportional: boolean): void {
        this._model.proportional = proportional;
        const item = this._model.currentItem;
        if (item) this.refreshSketchReference(item.id);
    }

    /**
     * Starts interactive transform (move/rotate/scale) of the graphic tied to
     * the given object id. Requires that `workflowStep === 2`.
     */
    async startSketchTransform(id: string): Promise<void> {
        const model = this._model;
        if (!model) return;
        const isCurrentTransform = () => model.workflowStep === 2 && model.currentItem?.id === id;
        if (!isCurrentTransform()) return;
        const item = this._callbacks.getItem(id);
        const layer = this._layersByItemId.get(id);
        const graphic = this.findGraphic(id);
        if (!item || !graphic || !layer) return;
        const enableScaling = !!model.proportional;
        await this._sketchManager.startTransform(graphic, layer, {
            onMove: (point: Point) => {
                const fresh = this._callbacks.getItem(id);
                if (fresh) this.updatePosition(fresh, { x: point.x, y: point.y, z: point.z });
            },
            onRotate: (heading: number) => {
                const fresh = this._callbacks.getItem(id);
                if (fresh) this.updateHeading(fresh, heading);
            },
            onScale: (factor: number) => {
                const fresh = this._callbacks.getItem(id);
                if (fresh) this.applyScaleFactor(fresh, factor);
            },
            onMaskComplete: () => { /* ignored in transform mode */ },
            onDragStart: () => {
                const start = this._callbacks.getItem(id);
                this._scalePercentAtDragStart = start?.scalePercent ?? 100;
                this._sketchDragActive = true;
            },
            // The cancel path in ObjectsSketchManager bypasses `shouldStart` to
            // run cleanup, so this callback can fire for a stale operation.
            onDragEnd: () => {
                this._sketchDragActive = false;
                if (!isCurrentTransform()) return;
                const finalItem = this._callbacks.getItem(id);
                if (finalItem) {
                    this.applySymbol(finalItem);
                    this.refreshSketchReference(id);
                    this._callbacks.onSketchDragEnd(finalItem);
                }
            }
        }, { enableScaling, shouldStart: isCurrentTransform });
    }

    refreshSketchReference(id: string): void {
        if (this._sketchDragActive) return;
        this.startSketchTransform(id).catch((e: unknown) => {
            LOG.warn("sketch reinit failed", e);
        });
    }

    /** Rebinds `model.currentItem` to the persisted item reference with the same id. */
    refreshCurrentItem(): void {
        const model = this._model;
        const current = model?.currentItem;
        if (!current) return;
        const fresh = model.items.find((i: ObjectItem) => i.id === current.id);
        if (fresh) {
            model.currentItem = fresh;
        }
    }

    private _getPopupTemplate(): PopupTemplate {
        if (this._popupTemplate) return this._popupTemplate;
        const i18n = this._i18n?.get();
        const popupI18n = i18n?.popup;
        const numberFormat = { places: 2, digitSeparator: true };
        const sr = this._opts.getSpatialReference();
        const coordinateFormat = { places: coordinateDecimals(sr), digitSeparator: !sr?.isGeographic };
        const xLabel = sr?.isGeographic ? popupI18n?.longitude || "Longitude" : popupI18n?.easting || "Easting";
        const yLabel = sr?.isGeographic ? popupI18n?.latitude || "Latitude" : popupI18n?.northing || "Northing";
        this._popupTemplate = new PopupTemplate({
            title: "{title}",
            content: [{
                type: "fields",
                fieldInfos: [
                    { fieldName: "height",    label: popupI18n?.height    || "Height",    format: numberFormat },
                    { fieldName: "width",     label: popupI18n?.width     || "Width",     format: numberFormat },
                    { fieldName: "depth",     label: popupI18n?.depth     || "Depth",     format: numberFormat },
                    { fieldName: "createdAt", label: popupI18n?.placedAt  || "Placed at", format: { dateFormat: "short-date-short-time" } },
                    { fieldName: "x",         label: xLabel,                              format: coordinateFormat },
                    { fieldName: "y",         label: yLabel,                              format: coordinateFormat },
                    { fieldName: "z",         label: popupI18n?.elevation || "Elevation", format: numberFormat }
                ]
            }],
            outFields: ["*"],
            actions: [
                {
                    id: POPUP_ACTION_EDIT,
                    title: i18n?.action?.edit || "Edit",
                    className: "esri-icon-edit",
                    type: "button"
                },
                {
                    id: POPUP_ACTION_DELETE,
                    title: i18n?.action?.delete || "Delete",
                    className: "esri-icon-trash",
                    type: "button"
                }
            ] as any
        });
        return this._popupTemplate;
    }

}
