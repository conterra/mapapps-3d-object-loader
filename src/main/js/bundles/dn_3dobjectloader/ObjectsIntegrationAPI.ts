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
     * Places the currently active preset (or custom draft) at the given map point
     * and returns the newly created item.
     *
     * @param point Target location in the view's spatial reference.
     */
    async placeAt(point: Point): Promise<ObjectItem | undefined> {
        return this._controller?.placeAt(point);
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
     * Arms the controller for a single placement on the next map click.
     *
     * @param presetId Optional preset to activate; falls back to the model's
     *                 currently active preset.
     */
    startPlacement(presetId?: string): void {
        this._controller?.startPlacement(presetId);
    }
}
