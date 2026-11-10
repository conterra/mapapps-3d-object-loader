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

/**
 * Public entry point of the `dn_3dobjectloader` bundle.
 *
 * Exposes all component classes that are wired up via `manifest.json`
 * so other bundles (and the map.apps runtime) can reference them by
 * their module name.
 */
export { default as ObjectsModel } from "./ObjectsModel";
export { default as ObjectsStorageController } from "./ObjectsStorageController";
export { default as ObjectsMeshMaskManager } from "./ObjectsMeshMaskManager";
export { default as ObjectsSketchManager } from "./ObjectsSketchManager";
export { default as ObjectsController } from "./ObjectsController";
export { default as ObjectsIntegrationAPI } from "./ObjectsIntegrationAPI";
export { default as ObjectsParameterResolver } from "./ObjectsParameterResolver";
export { default as ObjectsWidgetFactory } from "./ObjectsWidgetFactory";
export { default as ObjectsZoomActionDefinitionFactory } from "./ObjectsZoomActionDefinitionFactory";
export { default as ObjectsEditActionDefinitionFactory } from "./ObjectsEditActionDefinitionFactory";
export { default as ObjectsDeleteActionDefinitionFactory } from "./ObjectsDeleteActionDefinitionFactory";
