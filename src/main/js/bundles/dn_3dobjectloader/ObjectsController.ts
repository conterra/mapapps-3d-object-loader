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
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import { InjectedReference } from "apprt-core/InjectedReference";
import { loggerForName } from "apprt-core/Logger";
import { MapWidgetModel } from "map-widget/api";
import { I18N } from "apprt/api";
import { I18NKeys } from "./nls/bundle";
import ObjectsStorageController, { ObjectItem, isItemUntouched } from "./ObjectsStorageController";
import ObjectsMeshMaskManager from "./ObjectsMeshMaskManager";
import ObjectsSketchManager from "./ObjectsSketchManager";
import ObjectsPersistenceManager from "./ObjectsPersistenceManager";
import ObjectsGraphicsManager, { POPUP_ACTION_EDIT, POPUP_ACTION_DELETE } from "./ObjectsGraphicsManager";
import ObjectsMaskWorkflowController from "./ObjectsMaskWorkflowController";
import type { ObjectsModelProps } from "./ObjectsModel";
import { PresetModel, mergePresetModels } from "./PresetModel";
import { readNativeGlbDimensions } from "./readNativeGlbDimensions";
import { waitForView } from "./waitForView";
import { CompactItem, RestoreStrategy, round } from "./Obj3dUrlCodec";
import { coordinateDecimals } from "./spatialReferenceUtils";

export type { PresetModel };

const LOG = loggerForName("dn_3dobjectloader/ObjectsController");
const PLACEMENT_CURSOR = "crosshair";

interface WatchHandle { remove(): void; }
interface ToggleTool {
    active: boolean;
    set(name: "active", value: boolean): void;
    watch(property: "active", callback: (name: string, oldValue: boolean, newValue: boolean) => void): WatchHandle;
}

/**
 * Orchestrates the 3D objects workflow and the public API consumed by the
 * widget factory and integration API.
 *
 * Owns the tool/view/popup lifecycle and the workflow state machine; delegates
 * persistence to {@link ObjectsPersistenceManager}, graphics and sketch
 * transforms to {@link ObjectsGraphicsManager}, and the mesh-mask workflow to
 * {@link ObjectsMaskWorkflowController}.
 *
 * Lifecycle: `activate()` is called by the framework when the bundle's tool is
 * opened and must be paired with `deactivate()` on tool close — otherwise
 * view listeners and sketch handles leak.
 */
export default class ObjectsController {
    private declare _properties: {
        groupLayerId: string;
        highlightColor: number[];
        /** Presets shipped with the bundle. */
        defaultPresetModels?: PresetModel[];
        /** Presets configured by the app; added to (or replacing) the defaults. */
        presetModels?: PresetModel[];
        /** `false` to hide the bundle's default presets. */
        includeDefaultPresets?: boolean;
    };

    _mapWidgetModel!: InjectedReference<MapWidgetModel>;
    _model!: InjectedReference<ObjectsModelProps>;
    _storage!: InjectedReference<ObjectsStorageController>;
    _meshMaskManager!: InjectedReference<ObjectsMeshMaskManager>;
    _sketchManager!: InjectedReference<ObjectsSketchManager>;
    _tool!: InjectedReference<ToggleTool>;
    private _i18n!: InjectedReference<I18N<I18NKeys>>;

    private _clickHandle: WatchHandle | null = null;
    private _popupActionHandle: WatchHandle | null = null;
    private _toolWatchHandle: WatchHandle | null = null;
    private _viewWatchHandle: WatchHandle | null = null;
    private _viewmodeWatchHandle: WatchHandle | null = null;
    private _viewCursorBefore: string | undefined = undefined;
    private _persistenceManager!: ObjectsPersistenceManager;
    private _graphicsManager!: ObjectsGraphicsManager;
    private _maskWorkflowController!: ObjectsMaskWorkflowController;

    /** True once {@link activate} finished its IndexedDB rehydrate. */
    private _activated = false;
    /** Guards the shared-URL restore against running more than once. */
    private _sharedRestoreDone = false;
    /** True while {@link placeAt} is running; blocks a second placement by a fast double click. */
    private _placing = false;
    /** Holds a decoded URL state that arrived before {@link activate} completed. */
    private _pendingShared: { items: CompactItem[]; strategy: RestoreStrategy } | null = null;

    /** @returns The bundle's default presets combined with the presets configured by the app. */
    getPresets(): PresetModel[] {
        return mergePresetModels(
            this._properties?.defaultPresetModels,
            this._properties?.presetModels,
            this._properties?.includeDefaultPresets !== false
        );
    }

    /**
     * Ensures the placement point has a usable elevation.
     *
     * A click delivers the elevation of the surface that is rendered under the
     * cursor. Right after startup, terrain and mesh tiles may not be loaded
     * yet, so the click hits the flat default surface and reports `z = 0`. In
     * that case the elevation is queried from the ground layers directly,
     * which does not depend on rendered tiles. A real elevation of exactly 0 is
     * also confirmed by the query, so the check is safe.
     */
    private async _withElevation(point: Point): Promise<Point> {
        if (point.hasZ && typeof point.z === "number" && point.z !== 0) return point;
        const ground = this._mapWidgetModel?.map?.ground;
        if (!ground?.layers?.length) return point;
        try {
            const result = await ground.queryElevation(point);
            const z = (result.geometry as Point | undefined)?.z;
            if (typeof z !== "number" || !Number.isFinite(z) || Math.abs(z) > 1e6) return point;
            const withZ = point.clone();
            withZ.hasZ = true;
            withZ.z = z;
            return withZ;
        } catch (e) {
            LOG.warn("ground elevation query failed", e);
            return point;
        }
    }

    /** @returns The maximum size of an uploaded GLB file in bytes. */
    getMaxFileSize(): number {
        return this._storage?.maxFileSize ?? 10485760;
    }

    /**
     * @returns The spatial reference of the map. Placed objects always use it.
     */
    private _getSpatialReference(): SpatialReference | undefined {
        return this._mapWidgetModel?.spatialReference ?? this._mapWidgetModel?.view?.spatialReference ?? undefined;
    }

    /**
     * Re-evaluates whether mesh masking is possible and which coordinate
     * format applies, and publishes both to the model for the widget.
     *
     * @returns `true` if mesh masking is available.
     */
    private _refreshMaskAvailability(): boolean {
        const available = !!this._meshMaskManager?.isAvailable();
        if (this._model) {
            this._model.maskAvailable = available;
            this._model.coordinateDecimals = coordinateDecimals(this._getSpatialReference());
            const sr = this._getSpatialReference();
            this._model.geographicCoordinates = !!sr?.isGeographic;
            const wkid = sr?.wkid;
            this._model.spatialReferenceLabel = wkid ? `EPSG:${wkid}` : "";
        }
        return available;
    }

    /**
     * Framework hook: initializes the group layer, rehydrates persisted items
     * and attaches the tool/view watches.
     *
     * Must be called once per bundle activation; pair with {@link deactivate}.
     */
    async activate(): Promise<void> {
        this._persistenceManager = new ObjectsPersistenceManager(
            this._storage!,
            this._model!,
            () => this.getPresets()
        );
        this._graphicsManager = new ObjectsGraphicsManager(
            this._mapWidgetModel!,
            this._sketchManager!,
            this._model!,
            this._i18n,
            {
                groupLayerId: this._properties.groupLayerId,
                getSpatialReference: () => this._getSpatialReference(),
                highlightColor: this._properties.highlightColor
            },
            {
                onPersist: (item) => this._persistenceManager.persistIfNotDraft(item),
                onMaskTranslate: (item, dx, dy, dz) => this._maskWorkflowController.translateMask(item, dx, dy, dz),
                onMaskReapproximate: (item) => this._maskWorkflowController.reapproximateMask(item),
                onSketchDragEnd: (item) => this._maskWorkflowController.reapplyAfterDrag(item),
                getItem: (id) => this._getItem(id)
            }
        );
        this._maskWorkflowController = new ObjectsMaskWorkflowController(
            this._mapWidgetModel!,
            this._graphicsManager,
            this._meshMaskManager!,
            this._sketchManager!,
            this._model!,
            { getSpatialReference: () => this._getSpatialReference() },
            { onPersist: (item) => this._persistenceManager.persistIfNotDraft(item) }
        );
        await this._graphicsManager.waitForGroupLayer();
        this._refreshMaskAvailability();
        await this._rehydrate();
        // Activation order between this immediate component and the ParameterManager
        // is not guaranteed; a URL state decoded before now was buffered and is
        // applied here, strictly after the IndexedDB rehydrate to avoid racing
        // on `model.items`.
        this._activated = true;
        if (this._pendingShared) {
            const pending = this._pendingShared;
            this._pendingShared = null;
            await this._applySharedRestore(pending.items, pending.strategy);
        }
        this._toolWatchHandle = this._tool?.watch("active", (_n: string, _o: boolean, active: boolean) => {
            if (active) {
                this._refreshMaskAvailability();
                this._onToolActivated();
            } else {
                this._onToolDeactivated();
            }
        }) ?? null;
        // The tool may already be active (e.g. `activateOnStartToolIds`) before
        // the watch above was attached; the watch would then never fire.
        if (this._tool?.active) {
            this._refreshMaskAvailability();
            this._onToolActivated().catch((e: unknown) => LOG.warn("tool activation failed", e));
        }
        this._attachPopupActionListener().catch((e: unknown) => {
            LOG.warn("popup listener failed", e);
        });
        this._viewWatchHandle = this._mapWidgetModel?.watch("view", () => {
            this._onViewChanged().catch((e: unknown) => {
                LOG.warn("view change failed", e);
            });
        }) ?? null;
        this._viewmodeWatchHandle = this._mapWidgetModel?.watch("viewmode", (event) => {
            if (event.value === "2D" && this._tool?.active) {
                this.closeTool();
            }
        }) ?? null;
    }

    /**
     * Framework hook: persists any pending changes, removes all watches and
     * destroys the sketch manager. Must be called before the bundle unloads.
     */
    async deactivate(): Promise<void> {
        if (this._persistenceManager) {
            await this._persistenceManager.dispose();
        }
        this._revokeDraftUploadUrl();
        this._detachViewListeners();
        this._detachPopupActionListener();
        if (this._toolWatchHandle) {
            this._toolWatchHandle.remove();
            this._toolWatchHandle = null;
        }
        if (this._viewWatchHandle) {
            this._viewWatchHandle.remove();
            this._viewWatchHandle = null;
        }
        if (this._viewmodeWatchHandle) {
            this._viewmodeWatchHandle.remove();
            this._viewmodeWatchHandle = null;
        }
        this._sketchManager?.destroy();
        this._maskWorkflowController?.destroy();
        this._graphicsManager?.clearHighlight();
        this._graphicsManager?.uninstallHighlightPreset();
    }

    /** Rewires view-dependent state after the underlying SceneView is swapped (e.g. after viewmode toggle). */
    private async _onViewChanged(): Promise<void> {
        this._refreshMaskAvailability();
        this._detachViewListeners();
        this._detachPopupActionListener();
        this._sketchManager?.destroy();
        this._maskWorkflowController?.destroy();
        this._graphicsManager?.clearHighlight();

        this._graphicsManager.resolveGroupLayer();
        this._graphicsManager.rebuildForNewView(this._model?.items ?? []);

        await this._meshMaskManager?.clear();
        this._meshMaskManager?.rehydrateFromItems(
            (this._model?.items ?? []).map((i: ObjectItem) => {return {
                id: i.id,
                maskGeometryJson: i.maskGeometryJson,
                maskHeight: i.maskHeight
            };})
        );

        await this._attachPopupActionListener();
        if (this._tool?.active) {
            await this._attachViewListeners();
            await this._graphicsManager?.installHighlightPreset();
        }
    }

    /**
     * Switches the model into `placing` mode so the next map click creates a
     * new object. Sets the placement cursor as a visual affordance.
     *
     * @param presetId Optional override for `model.activePresetId`.
     */
    startPlacement(presetId?: string): void {
        const model = this._model;
        if (!model) return;
        if (presetId) model.activePresetId = presetId;
        model.mode = "placing";
        this._setCursor(PLACEMENT_CURSOR);
    }

    /** Leaves `placing` mode without creating an object and restores the cursor. */
    cancelPlacement(): void {
        const model = this._model;
        if (!model) return;
        if (model.mode === "placing") {
            model.mode = model.currentItem ? "editing" : "idle";
            this._restoreCursor();
        }
    }

    /**
     * Creates a new object at the given map point using the current model state
     * (active preset or custom upload/URL draft).
     *
     * Also starts the sketch transform so the item is immediately movable.
     *
     * @returns The freshly placed item, or `undefined` if no valid source is set.
     */
    async placeAt(point: Point): Promise<ObjectItem | undefined> {
        if (!this._model || this._placing) return undefined;
        this._placing = true;
        try {
            return await this._placeAt(point);
        } finally {
            this._placing = false;
        }
    }

    private async _placeAt(point: Point): Promise<ObjectItem | undefined> {
        const model = this._model;
        if (!model) return undefined;
        // The view (and with it the spatial reference) may not have existed at activation.
        this._refreshMaskAvailability();
        point = await this._withElevation(point);

        const preset = this.getPresets().find(p => p.id === model.activePresetId);
        const draft = model.draftUpload;
        const draftUrl = model.draftUrl;
        let item: ObjectItem | undefined;

        if (model.sourceTab === 0 && preset) {
            item = this._persistenceManager.buildPresetItem(preset, point, model.draftTitle || preset.name);
        } else if (model.sourceTab === 1) {
            if (draft?.blob) {
                const title = model.draftTitle || draft.title;
                item = await this._persistenceManager.buildCustomBlobItem(draft, point, title);
            } else if (draftUrl) {
                item = this._persistenceManager.buildCustomUrlItem(draftUrl, point, model.draftTitle || "3D object");
            }
        }
        if (!item) {
            this._restoreCursor();
            model.mode = "idle";
            return undefined;
        }

        this._graphicsManager.resolveGroupLayer();
        this._graphicsManager.addGraphic(item);

        model.currentItem = item;
        model.scalePercent = item.scalePercent;
        model.proportional = true;
        model.mode = "editing";
        model.workflowStep = 2;
        this._restoreCursor();

        await this._graphicsManager.selectGraphic(item.id);
        const [, dims] = await Promise.all([
            this._graphicsManager.startSketchTransform(item.id),
            readNativeGlbDimensions(item.meshUrl)
        ]);
        if (dims) {
            item.nativeWidth = dims.width;
            item.nativeDepth = dims.depth;
            item.nativeHeight = dims.height;
            // Only adopt native sizing if the user has not started editing while
            // the mesh was loading — their edits must win the race.
            if (isItemUntouched(item)) {
                item.width = dims.width;
                item.depth = dims.depth;
                item.height = dims.height;
                this._graphicsManager.applySymbol(item);
                this._graphicsManager.refreshCurrentItem();
                this._graphicsManager.refreshSketchReference(item.id);
            }
        }
        return item;
    }

    /** True when the currently selected item has not yet been committed to `model.items`. */
    private _isDraft(): boolean {
        const cur = this._model?.currentItem;
        return !!cur && !!this._persistenceManager?.isDraft(cur);
    }

    /** Releases the object-URL of an uploaded draft if no persisted item still references it. */
    private _revokeDraftUploadUrl(): void {
        const model = this._model;
        const url = model?.draftUpload?.url;
        if (!url?.startsWith("blob:")) return;
        const stillInUse =
            model?.currentItem?.meshUrl === url ||
            (model?.items ?? []).some((i: ObjectItem) => i.meshUrl === url);
        if (stillInUse) return;
        try { URL.revokeObjectURL(url); } catch { /* noop */ }
    }

    /** Drops an uncommitted draft item incl. graphic, mask and cached blob — safe when no draft exists. */
    private _discardDraftIfAny(): void {
        const model = this._model;
        if (!model || !this._isDraft()) return;
        const draft = model.currentItem;
        if (!draft) return;
        this._graphicsManager?.removeGraphic(draft.id);
        this._maskWorkflowController?.removeMaskGraphic(draft.id);
        this._meshMaskManager?.remove(draft.id).catch(() => { /* noop */ });
        if (draft.customBlobKey) {
            if (draft.meshUrl?.startsWith("blob:")) {
                try { URL.revokeObjectURL(draft.meshUrl); } catch { /* noop */ }
            }
            this._storage?.deleteBlob(draft.customBlobKey).catch(() => { /* noop */ });
        }
        model.currentItem = undefined;
        this._graphicsManager?.clearHighlight();
        this._sketchManager?.cancel();
    }

    /**
     * Selects the object with the given id and highlights it. Pass `undefined`
     * to clear the current selection (any unpersisted draft is discarded).
     *
     * @param opts.openStep Optional workflow step to jump to after selection.
     */
    async selectObject(id: string | undefined, opts?: { openStep?: number }): Promise<void> {
        const model = this._model;
        if (!model) return;
        this._refreshMaskAvailability();
        if (!id) {
            this._discardDraftIfAny();
            model.currentItem = undefined;
            this._graphicsManager?.clearHighlight();
            this._sketchManager?.cancel();
            return;
        }
        const item = model.items.find((i: ObjectItem) => i.id === id);
        if (!item) return;
        if (model.currentItem && model.currentItem.id !== id) {
            this._discardDraftIfAny();
        }
        model.currentItem = item;
        // Hydrate Step-1 source fields too — the user can return to Step 1 via
        // the back button and would otherwise see stale draftTitle/sourceTab
        // values from a previous flow.
        this._hydrateStep1FromItem(item);
        model.scalePercent = item.scalePercent;
        model.proportional = true;
        model.listView = false;
        if (opts?.openStep) {
            model.workflowStep = opts.openStep;
        } else if (model.workflowStep === "final" || model.workflowStep === "list") {
            model.workflowStep = 2;
        }
        await this._graphicsManager.selectGraphic(id);
        if (model.workflowStep === 2) {
            await this._graphicsManager.startSketchTransform(id);
        }
    }

    /**
     * Mirrors a persisted item into the Step-1 source fields (`draftTitle`,
     * `sourceTab`, `activePresetId`, `draftUrl`, `draftUpload`) so the user
     * sees the originally chosen model when entering or returning to Step 1.
     *
     * The `draftUpload` placeholder for custom-blob items intentionally carries
     * no live `Blob` — it is only used by Step 1 to render the file-name slot
     * read-only; the actual mesh is served from IndexedDB.
     */
    private _hydrateStep1FromItem(item: ObjectItem): void {
        const model = this._model;
        if (!model) return;
        model.draftTitle = item.title;
        model.sourceTab = item.source === "preset" ? 0 : 1;
        model.activePresetId = item.source === "preset" ? item.presetId : undefined;
        model.draftUrl = item.source === "custom" && !item.customBlobKey ? item.meshUrl : "";
        model.draftUpload = item.source === "custom" && item.customBlobKey
            ? { blob: undefined as unknown as Blob, url: item.meshUrl, title: item.title }
            : undefined;
    }

    /**
     * Translates the object (and its optional mesh mask) to the given coordinates.
     *
     * Only the axes provided in `coords` are overwritten — unset fields keep
     * their current value.
     */
    updatePosition(id: string | undefined, coords: { x?: number; y?: number; z?: number }): void {
        const item = this._getItem(id);
        if (!item) return;
        this._graphicsManager.updatePosition(item, coords);
    }

    /** Sets the heading in degrees; the value is normalized into [0, 360). */
    updateHeading(id: string | undefined, heading: number): void {
        const item = this._getItem(id);
        if (!item) return;
        this._graphicsManager.updateHeading(item, heading);
    }

    /**
     * Updates width/depth/height (in meters at 100% scale).
     *
     * When `opts.proportional` is `true`, the first changed dimension defines a
     * uniform scale ratio that is applied to all three axes; otherwise each
     * provided dimension is set independently.
     */
    updateDimensions(
        id: string | undefined,
        dims: { width?: number; depth?: number; height?: number },
        opts?: { proportional?: boolean }
    ): void {
        const item = this._getItem(id);
        if (!item) return;
        this._graphicsManager.updateDimensions(item, dims, opts);
    }

    /** Sets the scale slider value (percent); values below 1% are clamped. */
    updateScale(id: string | undefined, percent: number): void {
        const item = this._getItem(id);
        if (!item) return;
        this._graphicsManager.updateScale(item, percent);
    }

    /**
     * Updates the human-readable title of an item.
     *
     * Delegates to {@link ObjectsGraphicsManager.updateTitle}, which also
     * refreshes the per-item `GraphicsLayer.title` (TOC) and
     * `Graphic.attributes.title` (popup) and triggers the shared `onPersist`
     * callback — so an already-saved item is auto-saved (debounced 250 ms)
     * while a draft is held until {@link saveCurrent}.
     */
    updateTitle(id: string | undefined, title: string): void {
        const item = this._getItem(id);
        if (!item) return;
        this._graphicsManager.updateTitle(item, title);
    }

    /**
     * Multiplies the current scale by `factor`. Used by the sketch manager
     * while the user is dragging a scale handle — uses the scale at drag start
     * as the base so repeated `update` events do not compound.
     */
    applyScaleFactor(id: string | undefined, factor: number): void {
        const item = this._getItem(id);
        if (!item) return;
        this._graphicsManager.applyScaleFactor(item, factor);
    }

    setProportional(proportional: boolean): void {
        if (!this._model) return;
        this._graphicsManager.setProportional(proportional);
    }

    /**
     * Opens (or re-opens) the mesh-mask editor for the currently selected item.
     */
    async openMask(): Promise<void> {
        return this._maskWorkflowController.openMask();
    }

    /**
     * Enters mask-draw mode: clears any existing mask for the current item and
     * starts a polygon draw. On completion the polygon is projected to the
     * ground elevation and {@link openMask} takes over for further editing.
     */
    async startMaskDraw(): Promise<void> {
        return this._maskWorkflowController.startMaskDraw();
    }

    /**
     * Clears the current item's mask (graphic + `SceneModification`) and, if the
     * mask step is open, immediately re-opens it with a fresh default polygon.
     */
    async resetMask(): Promise<void> {
        return this._maskWorkflowController.resetMask();
    }

    /**
     * Re-levels the mask polygon to the given absolute Z value and re-applies
     * it to the mesh. The object's Z is adjusted in sync.
     */
    async updateMaskHeight(id: string | undefined, height: number): Promise<void> {
        const item = this._getItem(id);
        if (!item) return;
        return this._maskWorkflowController.updateMaskHeight(item, height);
    }

    /**
     * Commits the current draft/edit to the items list, switches to the "final"
     * workflow step and flushes the persistence queue.
     */
    async saveCurrent(): Promise<void> {
        const model = this._model;
        if (!model) return;
        const item = model.currentItem;
        if (!item) return;
        if (!model.items.some((i: ObjectItem) => i.id === item.id)) {
            model.items.push(item);
        }
        model.lastSavedId = item.id;
        model.workflowStep = "final";
        model.mode = "idle";
        this._sketchManager?.destroy();
        this._maskWorkflowController?.removeMaskGraphic(item.id);
        this._graphicsManager?.clearHighlight();
        this._persistNow();
    }

    /**
     * Deletes an object and its associated graphic, mesh mask and uploaded blob
     * (for custom objects). Persists immediately. If the removed item was the
     * current one, the sketch/mask workflow is torn down so the UI never sits
     * in editing/maskEditing with an empty `currentItem`.
     */
    async removeObject(id: string): Promise<void> {
        const model = this._model;
        if (!model) return;
        const idx = model.items.findIndex((i: ObjectItem) => i.id === id);
        if (idx < 0) return;
        const item = model.items[idx];
        const wasCurrent = model.currentItem?.id === id;
        model.items.splice(idx, 1);
        if (wasCurrent) {
            this._sketchManager?.cancel();
            this._graphicsManager?.clearHighlight();
            this._restoreCursor();
            model.currentItem = undefined;
            model.mode = "idle";
            model.workflowStep = 1;
            model.listView = model.items.length > 0;
        }
        if (model.lastSavedId === id) {
            model.lastSavedId = undefined;
        }
        this._graphicsManager?.removeGraphic(id);
        this._maskWorkflowController?.removeMaskGraphic(id);
        await this._meshMaskManager?.remove(id);
        if (item.customBlobKey) {
            if (item.meshUrl?.startsWith("blob:")) {
                try { URL.revokeObjectURL(item.meshUrl); } catch { /* noop */ }
            }
            await this._storage?.deleteBlob(item.customBlobKey);
        }
        this._persistNow();
    }

    /** Resets the model to a clean step-1 state ready for a new object. */
    newObject(): void {
        this._discardDraftIfAny();
        this._graphicsManager?.clearHighlight();
        this._sketchManager?.cancel();
        this._resetToStartScreen();
    }

    /** Resets the reactive model to the clean step-1 start screen. */
    private _resetToStartScreen(): void {
        const model = this._model;
        if (!model) return;
        this._revokeDraftUploadUrl();
        model.currentItem = undefined;
        model.activePresetId = undefined;
        model.draftUpload = undefined;
        model.draftUrl = "";
        model.draftTitle = "";
        model.sourceTab = 0;
        model.workflowStep = 1;
        model.mode = "idle";
        model.listView = false;
        model.proportional = true;
        model.scalePercent = 100;
    }

    /** Re-opens the most recently saved object in the edit step. */
    editLast(): void {
        const model = this._model;
        if (!model) return;
        const id = model.lastSavedId;
        if (!id) return;
        void this.selectObject(id, { openStep: 2 });
    }

    /** Switches the widget into its list view. */
    showList(): void {
        const model = this._model;
        if (!model) return;
        model.listView = true;
    }

    /** Leaves the list view back to the workflow view. */
    hideList(): void {
        const model = this._model;
        if (!model) return;
        model.listView = false;
    }

    /** Discards any draft and deactivates the hosting tool. */
    closeTool(): void {
        this._discardDraftIfAny();
        try {
            this._tool?.set("active", false);
        } catch (e) {
            LOG.warn("closeTool failed", e);
        }
    }

    /**
     * Advances the workflow state machine by one step.
     *
     * Step 1 → 2 starts placement if no item is selected yet;
     * 2 → 3 cancels the transform and opens the mask editor;
     * 3 → final commits via {@link saveCurrent}.
     */
    nextStep(): void {
        const model = this._model;
        if (!model) return;
        if (model.workflowStep === 1) {
            if (!model.currentItem) {
                this.startPlacement(model.activePresetId);
            } else if (!this._isDraft()) {
                // Edit-Flow: a persisted item entered Step 1 via editObjectById;
                // resume the Transform handles when moving on to Step 2.
                model.mode = "editing";
                const itemId = model.currentItem.id;
                Promise.all([
                    this._graphicsManager.selectGraphic(itemId),
                    this._graphicsManager.startSketchTransform(itemId)
                ]).catch(() => { /* ignore */ });
            }
            model.workflowStep = 2;
        } else if (model.workflowStep === 2) {
            if (!this._refreshMaskAvailability()) {
                // No mesh layer to mask: step 2 is the last step.
                this.saveCurrent();
                return;
            }
            model.workflowStep = 3;
            model.mode = "idle";
            this._sketchManager?.destroy();
            this._graphicsManager?.clearHighlight();
            this.openMask().catch((e: unknown) => {
                LOG.warn("openMask failed", e);
            });
        } else if (model.workflowStep === 3) {
            this.saveCurrent();
        }
    }

    /**
     * Moves the workflow state machine one step back. Cleans up mask graphic or
     * discards any draft as appropriate for the previous step.
     */
    prevStep(): void {
        const model = this._model;
        if (!model) return;
        if (model.workflowStep === 3) {
            this._sketchManager?.destroy();
            if (model.currentItem) {
                // Drop overlay + SceneModification + stored geometry together
                // so storage and mesh stay consistent; a later 2 → 3 will
                // rebuild a fresh default mask from the footprint.
                const item = model.currentItem;
                this._maskWorkflowController?.removeMaskGraphic(item.id);
                this._meshMaskManager?.remove(item.id).catch(() => { /* noop */ });
                item.maskGeometryJson = undefined;
                item.maskHeight = undefined;
                this._persist();
            }
            model.workflowStep = 2;
            model.mode = "editing";
            if (model.currentItem) {
                this._graphicsManager.selectGraphic(model.currentItem.id).catch(() => { /* ignore */ });
                this._graphicsManager.startSketchTransform(model.currentItem.id).catch(() => { /* ignore */ });
            }
        } else if (model.workflowStep === 2) {
            if (model.mode === "placing") {
                this.cancelPlacement();
                return;
            }
            if (model.currentItem && !this._isDraft()) {
                // Edit-Flow: keep the persisted item, tear down the sketch
                // transform and highlight before returning to Step 1.
                this._sketchManager?.destroy();
                this._graphicsManager.clearHighlight();
            } else {
                // Placement-Flow: discard the uncommitted draft on the way back.
                this._discardDraftIfAny();
            }
            model.workflowStep = 1;
            model.mode = "idle";
        }
    }

    /**
     * Restores the defaults for the values edited in the current step.
     *
     * In step 2 dimensions/scale/heading fall back to the native GLB bounding
     * box (captured at placement) or to a unit cube if the native size is
     * unknown. In step 3 the mask is cleared.
     */
    resetCurrentStep(): void {
        const model = this._model;
        if (!model) return;
        if (model.workflowStep === 2 && model.currentItem) {
            const item = model.currentItem;
            item.width = item.nativeWidth ?? 1;
            item.depth = item.nativeDepth ?? 1;
            item.height = item.nativeHeight ?? 1;
            item.heading = 0;
            item.scalePercent = 100;
            model.scalePercent = 100;
            model.proportional = true;
            this._graphicsManager.applySymbol(item);
            this._graphicsManager.refreshCurrentItem();
            this._persist();
            this._graphicsManager.refreshSketchReference(item.id);
        } else if (model.workflowStep === 3 && model.currentItem) {
            this.resetMask();
        }
    }

    /** Debounced persist — forwards to {@link ObjectsPersistenceManager.persist}. */
    private _persist(): void {
        this._persistenceManager?.persist();
    }

    /** Immediate persist — forwards to {@link ObjectsPersistenceManager.persistNow}. */
    private _persistNow(): void {
        this._persistenceManager?.persistNow();
    }

    /** Loads persisted items, rebuilds graphics, re-applies mesh masks and resyncs the model on activation. */
    private async _rehydrate(): Promise<void> {
        const { items: restored, droppedCount } = await this._persistenceManager.loadAndHydrate();
        if (!restored.length && droppedCount === 0) return;

        // Re-resolve here in case the map became ready during the async loadAndHydrate
        // above — activate()'s earlier call may have hit an empty map.
        this._graphicsManager.resolveGroupLayer();
        for (const item of restored) {
            this._graphicsManager.addGraphic(item);
        }

        const model = this._model;
        if (!model) return;
        model.items.splice(0, model.items.length, ...restored);
        if (droppedCount > 0) {
            this._persist();
        }
        this._meshMaskManager?.rehydrateFromItems(
            restored.map(i => {return { id: i.id, maskGeometryJson: i.maskGeometryJson, maskHeight: i.maskHeight };})
        );
    }

    /**
     * Builds the compact, URL-serializable view of the placed objects.
     *
     * Only `source === "preset"` items are shareable — custom uploads live as
     * blobs in IndexedDB and are far too large for a URL. Coordinates and sizes
     * are rounded to keep the encoded parameter short, and the title is only
     * carried when it differs from the preset's default name.
     */
    getSharedCompactItems(): CompactItem[] {
        const items = this._model?.items ?? [];
        const presetsById = new Map(this.getPresets().map(p => [p.id, p]));
        // Centimeter precision in map units (more decimals for degrees).
        const xy = coordinateDecimals(this._getSpatialReference());
        const result: CompactItem[] = [];
        for (const it of items) {
            if (it.source !== "preset" || !it.presetId) continue;
            const compact: CompactItem = {
                p: it.presetId,
                x: round(it.x, xy),
                y: round(it.y, xy),
                z: round(it.z, 2),
                h: round(it.heading, 1),
                w: round(it.width, 3),
                d: round(it.depth, 3),
                e: round(it.height, 3),
                s: round(it.scalePercent, 1)
            };
            const preset = presetsById.get(it.presetId);
            if (it.title && it.title !== preset?.name) {
                compact.t = it.title;
            }
            const mask = it.maskGeometryJson as { rings?: number[][][] } | undefined;
            if (mask?.rings?.length) {
                compact.m = {
                    r: mask.rings.map(ring => ring.map(c => [round(c[0], xy), round(c[1], xy)])),
                    mh: round(it.maskHeight ?? it.z, 2)
                };
            }
            result.push(compact);
        }
        return result;
    }

    /**
     * Entry point for restoring a shared URL state. Order-independent: if the
     * decode happened before {@link activate} completed, the state is buffered
     * and replayed from `activate`; otherwise it is applied right away.
     */
    restoreSharedItems(compact: CompactItem[], strategy: RestoreStrategy): void {
        if (this._sharedRestoreDone) return;
        if (!this._activated) {
            this._pendingShared = { items: compact, strategy };
            return;
        }
        void this._applySharedRestore(compact, strategy);
    }

    /**
     * Maps the decoded items to live objects and merges them into the scene
     * according to `strategy`. Runs at most once per session.
     *
     * `replace` clears existing objects first; `append` keeps them; `ifEmpty`
     * only restores when nothing is placed locally. If none of the shared
     * presets are known to this app, the local state is left untouched — no
     * destructive replace without a replacement.
     */
    private async _applySharedRestore(compact: CompactItem[], strategy: RestoreStrategy): Promise<void> {
        // `restoreSharedItems` already guards re-entry; setting this here also
        // covers the direct-call path so a later decode is ignored.
        this._sharedRestoreDone = true;
        const model = this._model;
        if (!model) return;
        if (strategy === "ifEmpty" && model.items.length > 0) return;

        const restored = this._compactToItems(compact);
        if (!restored.length) return;

        if (strategy === "replace") {
            await this._clearAllObjects();
        }
        const existingIds = new Set(model.items.map((i: ObjectItem) => i.id));
        this._graphicsManager.resolveGroupLayer();
        const added: ObjectItem[] = [];
        for (const item of restored) {
            if (existingIds.has(item.id)) continue;
            this._graphicsManager.addGraphic(item);
            added.push(item);
        }
        if (!added.length) return;
        model.items.splice(model.items.length, 0, ...added);
        // Items come from an untrusted URL — guard the fire-and-forget mask
        // apply so a corrupt geometry can't surface as an unhandled rejection.
        this._meshMaskManager?.rehydrateFromItems(
            added.map(i => {return { id: i.id, maskGeometryJson: i.maskGeometryJson, maskHeight: i.maskHeight };})
        )?.catch((e: unknown) => LOG.warn("mask rehydrate (shared restore) failed", e));
        this._persistNow();
    }

    /** Reconstructs full {@link ObjectItem}s from compact URL items; unknown presets are dropped. */
    private _compactToItems(compact: CompactItem[]): ObjectItem[] {
        const presetsById = new Map(this.getPresets().map(p => [p.id, p]));
        const spatialReference = this._getSpatialReference()?.toJSON();
        const items: ObjectItem[] = [];
        for (const c of compact) {
            const preset = presetsById.get(c.p);
            if (!preset?.url) continue;
            const mask = c.m;
            // A manipulated URL may carry a mask without a finite height; fall
            // back to the object's z and skip the polygon rather than emitting
            // vertices with an undefined z.
            const mh = mask && Number.isFinite(mask.mh) ? mask.mh : undefined;
            const item: ObjectItem = {
                id: this._persistenceManager.generateId(),
                source: "preset",
                presetId: c.p,
                meshUrl: preset.url,
                title: c.t || preset.name,
                x: c.x,
                y: c.y,
                z: c.z,
                heading: c.h ?? 0,
                width: c.w ?? 1,
                depth: c.d ?? 1,
                height: c.e ?? 1,
                scalePercent: c.s ?? 100,
                maskGeometryJson: undefined,
                maskHeight: mh ?? c.z,
                createdAt: Date.now()
            };
            if (mask?.r?.length && mh !== undefined) {
                item.maskGeometryJson = {
                    rings: mask.r.map(ring => ring.map(([x, y]) => [x, y, mh])),
                    hasZ: true,
                    spatialReference
                };
            }
            items.push(item);
        }
        return items;
    }

    /** Removes every placed object incl. graphics, masks and cached blobs, leaving the model empty. */
    private async _clearAllObjects(): Promise<void> {
        const model = this._model;
        if (!model) return;
        this._sketchManager?.cancel();
        this._graphicsManager?.clearHighlight();
        this._restoreCursor();
        const items = [...model.items];
        for (const item of items) {
            this._graphicsManager?.removeGraphic(item.id);
            this._maskWorkflowController?.removeMaskGraphic(item.id);
            await this._meshMaskManager?.remove(item.id);
            if (item.customBlobKey) {
                if (item.meshUrl?.startsWith("blob:")) {
                    try { URL.revokeObjectURL(item.meshUrl); } catch { /* noop */ }
                }
                await this._storage?.deleteBlob(item.customBlobKey);
            }
        }
        model.currentItem = undefined;
        model.lastSavedId = undefined;
        model.mode = "idle";
        model.items.splice(0, model.items.length);
    }

    /** Hook for tool activation: wires click/popup listeners and resets the workflow if no draft is in flight. */
    private async _onToolActivated(): Promise<void> {
        await this._attachViewListeners();
        await this._graphicsManager?.installHighlightPreset();
        const model = this._model;
        if (!model) return;
        const step = model.workflowStep;
        const preserveStep = step === "final" || step === "list";
        if (!preserveStep && (!model.items.length || !model.currentItem)) {
            model.workflowStep = 1;
            model.listView = false;
        }
    }

    /** Hook for tool deactivation: tears down listeners, sketch and draft state and restores the map cursor. */
    private _onToolDeactivated(): void {
        const model = this._model;
        if (model?.currentItem) {
            this._maskWorkflowController?.removeMaskGraphic(model.currentItem.id);
        }
        this._discardDraftIfAny();
        this._detachViewListeners();
        this._sketchManager?.destroy();
        this._maskWorkflowController?.destroy();
        this._graphicsManager?.clearHighlight();
        this._graphicsManager?.uninstallHighlightPreset();
        this._restoreCursor();
        this._resetToStartScreen();
    }

    /** Attaches the map-click listener that drives placement; no-op when already attached. */
    private async _attachViewListeners(): Promise<void> {
        if (this._clickHandle) return;
        const view = await waitForView(this._mapWidgetModel);
        if (!view || this._clickHandle) return;
        this._clickHandle = view.on("click", async (evt: any) => {
            if (!evt.mapPoint) return;
            const model = this._model;
            if (!model) return;

            if (model.mode === "placing") {
                evt.stopPropagation();
                await this.placeAt(evt.mapPoint as Point);
            }
        });
    }

    /** Detaches the map-click listener. Idempotent. */
    private _detachViewListeners(): void {
        if (this._clickHandle) {
            this._clickHandle.remove();
            this._clickHandle = null;
        }
    }

    /** Subscribes to the view's popup so zoom/edit/delete actions on placed objects route back into the controller. */
    private async _attachPopupActionListener(): Promise<void> {
        if (this._popupActionHandle) return;
        const view = await waitForView(this._mapWidgetModel);
        if (this._popupActionHandle) return;
        const popup = view?.popup;
        if (!popup) return;
        this._popupActionHandle = popup.on("trigger-action", (event: any) => {
            const actionId = event.action?.id;
            if (actionId !== POPUP_ACTION_EDIT
                && actionId !== POPUP_ACTION_DELETE) return;
            const id = popup.selectedFeature?.attributes?.dnObjectId;
            if (!id) return;
            switch (actionId) {
                case POPUP_ACTION_EDIT:
                    try { popup.close(); } catch { /* noop */ }
                    this.editObjectById(id).catch((e: unknown) => {
                        LOG.warn("editObjectById failed", e);
                    });
                    return;
                case POPUP_ACTION_DELETE:
                    try { popup.close(); } catch { /* noop */ }
                    this.removeObject(id).catch((e: unknown) => {
                        LOG.warn("removeObject failed", e);
                    });
                    return;
            }
        });
    }

    /** Detaches the popup trigger-action listener. Idempotent. */
    private _detachPopupActionListener(): void {
        if (this._popupActionHandle) {
            this._popupActionHandle.remove();
            this._popupActionHandle = null;
        }
    }

    /**
     * Invoked from the popup "edit" action: activates the tool (if not already
     * active), selects the object and opens the edit step.
     */
    async editObjectById(id: string): Promise<void> {
        const model = this._model;
        if (!model) return;
        const item = model.items.find((i: ObjectItem) => i.id === id);
        if (!item) return;

        if (model.mode === "placing") {
            this.cancelPlacement();
        }
        if (model.currentItem && model.currentItem.id !== id) {
            this._maskWorkflowController?.removeMaskGraphic(model.currentItem.id);
            this._discardDraftIfAny();
        } else if (model.currentItem) {
            this._maskWorkflowController?.removeMaskGraphic(model.currentItem.id);
        }
        this._sketchManager?.destroy();

        model.currentItem = item;
        this._hydrateStep1FromItem(item);
        model.scalePercent = item.scalePercent;
        model.proportional = true;
        model.listView = false;
        model.workflowStep = 1;
        // Step 1 is the source/title view — no sketch transform yet. `mode`
        // flips to "editing" only when the user advances to Step 2 (see
        // {@link nextStep}).
        model.mode = "idle";

        try {
            if (this._tool && !this._tool.active) {
                this._tool.set("active", true);
            }
        } catch (e) {
            LOG.warn("activate tool failed", e);
        }
    }

    /** Resolves an item by id; also returns the current draft if its id matches. */
    private _getItem(id: string | undefined): ObjectItem | undefined {
        if (!id) return undefined;
        const model = this._model;
        if (!model) return undefined;
        const saved = model.items.find((i: ObjectItem) => i.id === id);
        if (saved) return saved;
        if (model.currentItem?.id === id) return model.currentItem;
        return undefined;
    }

    /** Overrides the view's cursor (e.g. to the placement crosshair) and remembers the previous value. */
    private _setCursor(cursor: string): void {
        const view = this._mapWidgetModel?.view as any;
        if (view?.container?.style) {
            if (this._viewCursorBefore === undefined) {
                this._viewCursorBefore = view.container.style.cursor;
            }
            view.container.style.cursor = cursor;
        }
    }

    /** Restores the view cursor saved by {@link _setCursor}. No-op if nothing was saved. */
    private _restoreCursor(): void {
        const view = this._mapWidgetModel?.view as any;
        if (view?.container?.style && this._viewCursorBefore !== undefined) {
            view.container.style.cursor = this._viewCursorBefore;
            this._viewCursorBefore = undefined;
        }
    }
}
