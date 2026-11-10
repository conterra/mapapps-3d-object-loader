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

import SceneView from "@arcgis/core/views/SceneView";
import { MapWidgetModel } from "map-widget/api";

/**
 * Resolves the current map view, waiting for the first `view` change if it
 * is not yet set. Returns `undefined` when no `MapWidgetModel` is available.
 */
export function waitForView(mapWidgetModel: MapWidgetModel | undefined): Promise<SceneView | undefined> {
    if (!mapWidgetModel) return Promise.resolve(undefined);
    if (mapWidgetModel.view) return Promise.resolve(mapWidgetModel.view as SceneView);
    return new Promise((resolve) => {
        const handle = mapWidgetModel.watch("view", (event: any) => {
            if (event?.value) {
                handle.remove();
                resolve(event.value as SceneView);
            }
        });
    });
}
