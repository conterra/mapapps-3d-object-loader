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
import { OBJECTS_LAYER_MARKER } from "./ObjectsGraphicsManager";

const LOG = loggerForName("dn_3dobjectloader/ObjectsZoomActionDefinitionFactory");
const ACTION_ID = "dn-3dobjectloader-zoom";

/**
 * Contributes a "zoom to 3D object" row-action to the TOC for layers tagged with
 * {@link OBJECTS_LAYER_MARKER}. Visible only in 3D viewmode; animates `view.goTo`
 * onto the layer's graphics.
 */
export default class ObjectsZoomActionDefinitionFactory implements ActionDefinitionFactory {
    supportedIds = [ACTION_ID];

    private _mapWidgetModel!: InjectedReference<MapWidgetModel>;
    private _i18n!: InjectedReference<I18N<I18NKeys>>;

    /** Builds the `ActionDefinition` for {@link ACTION_ID}; returns `undefined` for any other id. */
    createDefinitionById(id: string): ActionDefinition | undefined {
        if (id !== ACTION_ID) return undefined;
        const getMapWidgetModel = () => this._mapWidgetModel;
        const label = this._i18n?.get().action.zoom ?? "Zoom to 3D object";
        return {
            id,
            type: "button",
            label,
            icon: "material-icon-zoom_in",
            isVisibleForItem(tocItem: TocItem) {
                if (tocItem.type !== "layer") return false;
                const layer = tocItem.ref as any;
                if (layer?.[OBJECTS_LAYER_MARKER] !== true) return false;
                return getMapWidgetModel()?.viewmode === "3D";
            },
            trigger(tocItem: TocItem) {
                if (tocItem.type !== "layer") return;
                const layer = tocItem.ref as any;
                const view = getMapWidgetModel()?.view;
                if (!view) return;
                const graphics = layer.graphics?.toArray?.() ?? [];
                if (graphics.length === 0) return;
                view.goTo(graphics, { animate: true, duration: 800 }).catch((e: unknown) => {
                    LOG.warn("zoom-to failed", e);
                });
            }
        };
    }
}
