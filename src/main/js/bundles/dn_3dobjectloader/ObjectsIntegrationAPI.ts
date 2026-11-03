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

import { InjectedReference } from "apprt-core/InjectedReference";
import Point from "@arcgis/core/geometry/Point";
import ObjectsController, { PresetModel } from "./ObjectsController";
import { ObjectItem } from "./ObjectsStorageController";

/**
 * Thin facade over `ObjectsController` that is registered as a service
 * (`provides: "dn_3dobjectloader.ObjectsIntegrationAPI"`) so other bundles can
 * drive the 3D objects workflow without depending on the full controller API.
 */
export default class ObjectsIntegrationAPI {
    _controller!: InjectedReference<ObjectsController>;

    /**
     * @returns All configured presets (3D object templates) or an empty array
     *          if the controller is not yet injected.
     */
    getPresets(): PresetModel[] {
        return this._controller?.getPresets() ?? [];
    }

    /**
     * Places a preset at the given map point and returns the newly created item.
     * Opens the tool if it is closed, so the object can be edited right away.
     *
     * @param point Target location in the view's spatial reference.
     * @param presetId Preset to place; defaults to the preset last selected.
     * @returns `undefined` if the preset is unknown.
     */
    async placeAt(point: Point, presetId?: string): Promise<ObjectItem | undefined> {
        return this._controller?.placePresetAt(point, presetId);
    }

    /**
     * Selects the object with the given id (pass `undefined` to clear selection).
     */
    async selectObject(id: string | undefined): Promise<void> {
        return this._controller?.selectObject(id);
    }

    /** Removes an existing object, its graphic and any mesh mask. */
    async removeObject(id: string): Promise<void> {
        return this._controller?.removeObject(id);
    }

    /**
     * Opens the tool (if it is closed) and arms a single placement of a preset
     * on the next map click.
     *
     * @param presetId Preset to place; defaults to the preset last selected.
     * @returns `false` if the preset is unknown.
     */
    startPlacement(presetId?: string): boolean {
        return this._controller?.startPresetPlacement(presetId) ?? false;
    }
}
