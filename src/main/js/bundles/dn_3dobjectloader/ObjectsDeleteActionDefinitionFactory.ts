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
import { loggerForName } from "apprt-core/Logger";
import type { ActionDefinition, ActionDefinitionFactory, TocItem } from "toc/api";
import type { MapWidgetModel } from "map-widget/api";
import type { I18N } from "apprt/api";
import type { I18NKeys } from "./nls/bundle";
import type ObjectsController from "./ObjectsController";
import { OBJECTS_LAYER_MARKER } from "./ObjectsGraphicsManager";

const LOG = loggerForName("dn_3dobjectloader/ObjectsDeleteActionDefinitionFactory");
const ACTION_ID = "dn-3dobjectloader-delete";

/**
 * Contributes a "delete 3D object" row-action to the TOC for layers tagged with
 * {@link OBJECTS_LAYER_MARKER}. Visible only in 3D viewmode; triggers
 * {@link ObjectsController.removeObject}.
 */
export default class ObjectsDeleteActionDefinitionFactory implements ActionDefinitionFactory {
    supportedIds = [ACTION_ID];

    private _controller!: InjectedReference<ObjectsController>;
    private _mapWidgetModel!: InjectedReference<MapWidgetModel>;
    private _i18n!: InjectedReference<I18N<I18NKeys>>;

    /** Builds the `ActionDefinition` for {@link ACTION_ID}; returns `undefined` for any other id. */
    createDefinitionById(id: string): ActionDefinition | undefined {
        if (id !== ACTION_ID) return undefined;
        const getController = () => this._controller;
        const getMapWidgetModel = () => this._mapWidgetModel;
        const label = this._i18n?.get().action.delete ?? "Delete 3D object";
        return {
            id,
            type: "button",
            label,
            icon: "material-icon-delete",
            isVisibleForItem(tocItem: TocItem) {
                if (tocItem.type !== "layer") return false;
                const layer = tocItem.ref as any;
                if (layer?.[OBJECTS_LAYER_MARKER] !== true) return false;
                return getMapWidgetModel()?.viewmode === "3D";
            },
            trigger(tocItem: TocItem) {
                if (tocItem.type !== "layer") return;
                const layer = tocItem.ref as any;
                const objectId = layer?.dnObjectId;
                if (!objectId) return;
                getController()?.removeObject(objectId).catch((e: unknown) => {
                    LOG.warn("delete-action failed", e);
                });
            }
        };
    }
}
