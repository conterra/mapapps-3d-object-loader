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

import SketchViewModel from "@arcgis/core/widgets/Sketch/SketchViewModel";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from "@arcgis/core/Graphic";
import Polygon from "@arcgis/core/geometry/Polygon";
import Point from "@arcgis/core/geometry/Point";
import PointSymbol3D from "@arcgis/core/symbols/PointSymbol3D";
import ObjectSymbol3DLayer from "@arcgis/core/symbols/ObjectSymbol3DLayer";
import { InjectedReference } from "apprt-core/InjectedReference";
import { MapWidgetModel } from "map-widget/api";
import { waitForView } from "./waitForView";

/**
 * Callbacks invoked during the different `SketchViewModel` events.
 *
 * `onScale` receives an accumulated scale factor relative to the dimensions at
 * the start of the current transform (see `_initialScaleReference`).
 */
export interface SketchCallbacks {
    onMove: (point: Point) => void;
    onRotate: (heading: number) => void;
    onScale: (factor: number) => void;
    onMaskComplete: (polygon: Polygon) => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
}

interface TransformStartOptions {
    enableScaling?: boolean;
    shouldStart?: () => boolean;
}

/**
 * Wraps a single, lazily created `SketchViewModel` that powers both object
 * transforms (move/rotate/scale) and mesh-mask drawing.
 *
 * The manager only keeps one active operation at a time — starting a new one
 * cancels the previous handlers so the `SketchViewModel` is never double-armed.
 */
export default class ObjectsSketchManager {
    _mapWidgetModel!: InjectedReference<MapWidgetModel>;

    private _sketchVM: SketchViewModel | null = null;
    private _updateHandle: any = null;
    private _createHandle: any = null;
    private _initialScaleReference: { width: number; depth: number; height: number } | null = null;
    private _dragInProgress: boolean = false;
    private _operationGeneration: number = 0;

    /**
     * Starts a move/rotate/scale transform on the given graphic.
     *
     * Records the symbol's initial width/depth/height so `onScale` can emit a
     * uniform scale factor even when the user drags a corner handle.
     *
     * @param opts.enableScaling Defaults to `true`; pass `false` to lock size.
     * @param opts.shouldStart Optional guard for async starts that may become stale while waiting for the view.
     */
    async startTransform(
        graphic: Graphic,
        layer: GraphicsLayer,
        callbacks: SketchCallbacks,
        opts?: TransformStartOptions
    ): Promise<void> {
        const operationId = this._beginOperation();
        const shouldContinue = () => this._isCurrentOperation(operationId) && (opts?.shouldStart?.() ?? true);

        await this._ensureSketch(layer, shouldContinue);
        if (!this._sketchVM || !shouldContinue()) return;
        this._resetForReuse();
        if (!this._sketchVM || !shouldContinue()) return;

        const symbol = graphic.symbol as PointSymbol3D;
        const layerSymbol = symbol?.symbolLayers?.getItemAt(0) as ObjectSymbol3DLayer | undefined;
        if (layerSymbol) {
            this._initialScaleReference = {
                width: layerSymbol.width || 1,
                depth: layerSymbol.depth || 1,
                height: layerSymbol.height || 1
            };
        } else {
            this._initialScaleReference = null;
        }

        this._sketchVM.defaultUpdateOptions = {
            tool: "transform",
            enableZ: true,
            enableRotation: true,
            enableScaling: opts?.enableScaling !== false,
            multipleSelectionEnabled: false,
            toggleToolOnClick: false
        };

        this._updateHandle = this._sketchVM.on("update", (event: any) => {
            if (event.state === "cancel") {
                if (this._dragInProgress) {
                    this._dragInProgress = false;
                    callbacks.onDragEnd?.();
                }
                return;
            }
            if (!shouldContinue()) return;
            if (event.state !== "active" && event.state !== "complete") return;
            const g = event.graphics?.[0];
            const toolType: string = event.toolEventInfo?.type || "";

            if (toolType.endsWith("-start")) {
                this._dragInProgress = true;
                callbacks.onDragStart?.();
                return;
            }
            if (toolType.endsWith("-stop") || event.state === "complete") {
                if (this._dragInProgress) {
                    this._dragInProgress = false;
                    callbacks.onDragEnd?.();
                }
                if (event.state !== "complete") return;
            }
            if (!g) return;

            if (toolType.startsWith("move")) {
                callbacks.onMove(g.geometry as Point);
            }
            if (toolType.startsWith("rotate")) {
                const sym = g.symbol as PointSymbol3D;
                const sl = sym?.symbolLayers?.getItemAt(0) as ObjectSymbol3DLayer | undefined;
                if (sl && typeof sl.heading === "number") {
                    callbacks.onRotate(sl.heading);
                }
            }
            if (toolType.startsWith("scale")) {
                const sym = g.symbol as PointSymbol3D;
                const sl = sym?.symbolLayers?.getItemAt(0) as ObjectSymbol3DLayer | undefined;
                if (sl && this._initialScaleReference) {
                    const ref = this._initialScaleReference;
                    const candidates: number[] = [];
                    if (ref.width > 0 && sl.width) candidates.push(sl.width / ref.width);
                    if (ref.depth > 0 && sl.depth) candidates.push(sl.depth / ref.depth);
                    if (ref.height > 0 && sl.height) candidates.push(sl.height / ref.height);
                    if (candidates.length) {
                        const factor = candidates.reduce((a, b) => a + b, 0) / candidates.length;
                        if (isFinite(factor) && factor > 0) {
                            callbacks.onScale(factor);
                        }
                    }
                }
            }
        });

        if (!shouldContinue()) return;
        this._sketchVM.update(graphic);
    }

    /**
     * Starts a polygon draw used to define a new mesh mask.
     *
     * Only `callbacks.onMaskComplete` is fired — the intermediate sketch events
     * are ignored because the mask is only persisted on completion.
     */
    async startMaskDraw(layer: GraphicsLayer, callbacks: SketchCallbacks): Promise<void> {
        const operationId = this._beginOperation();
        const shouldContinue = () => this._isCurrentOperation(operationId);

        await this._ensureSketch(layer, shouldContinue);
        if (!this._sketchVM || !shouldContinue()) return;
        this._resetForReuse();
        if (!this._sketchVM || !shouldContinue()) return;

        this._createHandle = this._sketchVM.on("create", (event: any) => {
            if (!shouldContinue()) return;
            if (event.state === "complete" && event.graphic?.geometry) {
                callbacks.onMaskComplete(event.graphic.geometry as Polygon);
            }
        });

        if (!shouldContinue()) return;
        this._sketchVM.create("polygon", { hasZ: true });
    }

    /**
     * Starts editing an existing mask polygon.
     *
     * - `onMaskUpdate` fires on every interaction (including during a drag) and
     *   should only do lightweight preview work.
     * - `onMaskDragEnd` fires once per drag release — callers put expensive
     *   work here (e.g. re-applying a `SceneModification` to an
     *   `IntegratedMeshLayer`, persistence).
     *
     * Drag release is detected via `event.toolEventInfo.type` ending in
     * `-stop` (e.g. `reshape-stop`, `vertex-move-stop`, `move-stop`); the
     * `SketchViewModel` keeps `event.state` `"active"` between drags within
     * the same update session and only flips to `"complete"` when the whole
     * edit is torn down, so the `-stop` suffix is the real mouse-up signal.
     */
    async startMaskUpdate(
        graphic: Graphic,
        layer: GraphicsLayer,
        callbacks: {
            onMaskUpdate: (polygon: Polygon) => void;
            onMaskDragEnd?: (polygon: Polygon) => void;
        }
    ): Promise<void> {
        const operationId = this._beginOperation();
        const shouldContinue = () => this._isCurrentOperation(operationId);

        await this._ensureSketch(layer, shouldContinue);
        if (!this._sketchVM || !shouldContinue()) return;
        this._resetForReuse();
        if (!this._sketchVM || !shouldContinue()) return;

        this._sketchVM.defaultUpdateOptions = {
            enableZ: true,
            enableRotation: true,
            enableScaling: true,
            multipleSelectionEnabled: false,
            toggleToolOnClick: false
        };

        this._updateHandle = this._sketchVM.on("update", (event: any) => {
            if (!shouldContinue()) return;
            if (event.state !== "active" && event.state !== "complete") return;
            const g = event.graphics?.[0];
            if (!g?.geometry) return;
            const polygon = g.geometry as Polygon;
            callbacks.onMaskUpdate(polygon);
            const toolType: string = event.toolEventInfo?.type || "";
            if (toolType.endsWith("-stop") || event.state === "complete") {
                callbacks.onMaskDragEnd?.(polygon);
            }
        });

        if (!shouldContinue()) return;
        this._sketchVM.update(graphic);
    }

    /**
     * Cancels any in-flight sketch operation and detaches event handlers.
     *
     * Safe to call repeatedly; the underlying `SketchViewModel` is kept alive
     * for reuse — use `destroy()` to also release it.
     */
    cancel(): void {
        this._operationGeneration++;
        // Cancel before tearing down handlers so listeners observe the
        // cancel event (e.g. to fire onDragEnd for cleanup).
        this._cancelSketchVM();
        this._tearDownHandlers();
    }

    /**
     * Internal cleanup before re-arming the sketch view model with a new
     * operation: handlers come down first so the implicit cancel event
     * doesn't fire stale callbacks for the previous operation.
     */
    private _resetForReuse(): void {
        this._tearDownHandlers();
        this._cancelSketchVM();
    }

    private _cancelSketchVM(): void {
        if (!this._sketchVM) return;
        try {
            this._sketchVM.cancel();
        } catch {
            // noop
        }
    }

    private _tearDownHandlers(): void {
        if (this._updateHandle) {
            this._updateHandle.remove();
            this._updateHandle = null;
        }
        if (this._createHandle) {
            this._createHandle.remove();
            this._createHandle = null;
        }
        this._dragInProgress = false;
    }

    /** Cancels and tears down the underlying `SketchViewModel`. */
    destroy(): void {
        this.cancel();
        if (this._sketchVM) {
            try {
                this._sketchVM.destroy();
            } catch {
                // ignore
            }
            this._sketchVM = null;
        }
    }

    /** Lazily builds the `SketchViewModel` and rebinds it when the layer or view changes. */
    private _beginOperation(): number {
        this._operationGeneration++;
        return this._operationGeneration;
    }

    private _isCurrentOperation(operationId: number): boolean {
        return operationId === this._operationGeneration;
    }

    private async _ensureSketch(layer: GraphicsLayer, shouldContinue?: () => boolean): Promise<void> {
        const view = await waitForView(this._mapWidgetModel);
        if (!view) return;
        if (shouldContinue && !shouldContinue()) return;
        if (this._sketchVM && this._sketchVM.layer === layer && this._sketchVM.view === view) return;
        if (this._sketchVM) {
            try {
                this._sketchVM.destroy();
            } catch {
                // ignore
            }
            this._sketchVM = null;
        }
        if (shouldContinue && !shouldContinue()) return;
        this._sketchVM = new SketchViewModel({
            layer,
            view,
            defaultCreateOptions: { hasZ: true },
            defaultUpdateOptions: {
                tool: "transform",
                enableZ: true,
                enableRotation: true,
                enableScaling: true,
                multipleSelectionEnabled: false,
                toggleToolOnClick: false
            }
        });
    }

}
