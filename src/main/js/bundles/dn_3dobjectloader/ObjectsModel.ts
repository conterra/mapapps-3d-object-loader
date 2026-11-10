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

import { declare } from "apprt-core/Mutable";
import type { ObjectItem } from "./ObjectsStorageController";

/**
 * Typed shape of the reactive model properties.
 *
 * Consumed by `ObjectsController`, `ObjectsGraphicsManager`,
 * `ObjectsMaskWorkflowController` and `ObjectsWidgetFactory` so that
 * property access is statically checked.
 */
export interface ObjectsModelProps {
    workflowStep: number | string;
    mode: "idle" | "placing" | "editing" | "maskEditing" | "maskDrawing";
    activePresetId: string | undefined;
    sourceTab: number;
    draftUpload: { blob: Blob; url: string; title: string } | undefined;
    draftUrl: string;
    draftTitle: string;
    currentItem: ObjectItem | undefined;
    lastSavedId: string | undefined;
    items: ObjectItem[];
    proportional: boolean;
    scalePercent: number;
    listView: boolean;
    /** False when no integrated mesh layer is configured or found; the mask step is skipped then. */
    maskAvailable: boolean;
    /** Decimals for displaying and editing coordinates (depends on the spatial reference). */
    coordinateDecimals: number;
    /** True for geographic spatial references (longitude/latitude in degrees). */
    geographicCoordinates: boolean;
    /** Short name of the spatial reference shown next to the position, e.g. "EPSG:25832". */
    spatialReferenceLabel: string;
}

/**
 * Reactive state container for the 3D objects workflow.
 *
 * The model is bound two-way to `ObjectsWidget` via `apprt-binding/Binding`
 * and exposes the UI state machine (workflow step, current item, upload draft, …)
 * that `ObjectsController` mutates in response to user and map events.
 */
export default declare({
    workflowStep: 1,
    mode: "idle",
    activePresetId: undefined,
    sourceTab: 0,
    draftUpload: undefined,
    draftUrl: "",
    draftTitle: "",
    currentItem: undefined,
    lastSavedId: undefined,
    items: [],
    proportional: true,
    scalePercent: 100,
    listView: false,
    maskAvailable: true,
    coordinateDecimals: 2,
    geographicCoordinates: false,
    spatialReferenceLabel: ""
});
