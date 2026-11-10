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

import ObjectsWidget from "./ObjectsWidget.ts.vue";
import Vue from "apprt-vue/Vue";
import VueDijit from "apprt-vue/VueDijit";
import Binding from "apprt-binding/Binding";
import { InjectedReference } from "apprt-core/InjectedReference";
import { I18N } from "apprt/api";
import { I18NKeys } from "./nls/bundle";
import ObjectsController from "./ObjectsController";
import type { ObjectsModelProps } from "./ObjectsModel";

/**
 * Factory that builds the `ObjectsWidget` Dijit used inside the dock / layout.
 *
 * Wires the Vue component to the reactive `ObjectsModel` (two-way `Binding`)
 * and bridges the widget's `$emit` events onto `ObjectsController` methods.
 */
export default class ObjectsWidgetFactory {
    private _i18n!: InjectedReference<I18N<I18NKeys>>;
    _model!: InjectedReference<ObjectsModelProps>;
    _controller!: InjectedReference<ObjectsController>;

    /**
     * Creates and returns a ready-to-mount widget instance.
     *
     * The returned Dijit takes ownership of the `Binding` so both are torn down
     * together when the widget is removed by the layout.
     */
    createInstance(): unknown {
        const vm: any = new Vue(ObjectsWidget);
        vm.i18n = this._i18n!.get();
        vm.presets = (this._controller?.getPresets?.() ?? []).slice();
        vm.maxFileSize = this._controller?.getMaxFileSize?.() ?? vm.maxFileSize;

        const model = this._model!;
        const controller = this._controller;

        const binding = Binding.create()
            .bindTo(model, vm)
            .syncAll(
                "workflowStep",
                "mode",
                "activePresetId",
                "sourceTab",
                "draftUpload",
                "draftUrl",
                "draftTitle",
                "currentItem",
                "lastSavedId",
                "items",
                "proportional",
                "scalePercent",
                "listView",
                "maskAvailable",
                "coordinateDecimals",
                "geographicCoordinates",
                "spatialReferenceLabel"
            )
            .enable()
            .syncToRightNow();

        vm.$on("next-step", () => controller?.nextStep());
        vm.$on("prev-step", () => controller?.prevStep());
        vm.$on("reset-step", () => controller?.resetCurrentStep());
        vm.$on("save", () => controller?.saveCurrent());
        vm.$on("draw-mask", () => controller?.startMaskDraw());
        vm.$on("reset-mask", () => controller?.resetMask());
        vm.$on("set-proportional", (p: boolean) => controller?.setProportional(p));
        vm.$on("update-dimensions", (payload: any) => {
            const id = model.currentItem?.id;
            if (!id) return;
            controller?.updateDimensions(id, payload, { proportional: payload.proportional });
        });
        vm.$on("update-scale", (percent: number) => {
            const id = model.currentItem?.id;
            if (id) controller?.updateScale(id, percent);
        });
        vm.$on("update-position", (coords: any) => {
            const id = model.currentItem?.id;
            if (id) controller?.updatePosition(id, coords);
        });
        vm.$on("update-heading", (deg: number) => {
            const id = model.currentItem?.id;
            if (id) controller?.updateHeading(id, deg);
        });
        vm.$on("update-title", (title: string) => {
            const id = model.currentItem?.id;
            if (id) controller?.updateTitle(id, title);
        });
        vm.$on("update-mask-height", (height: number) => {
            const id = model.currentItem?.id;
            if (id) controller?.updateMaskHeight(id, height);
        });
        vm.$on("select", (id: string) => controller?.selectObject(id, { openStep: 2 }));
        vm.$on("remove", (id: string) => controller?.removeObject(id));
        vm.$on("new", () => controller?.newObject());
        vm.$on("edit-last", () => controller?.editLast());
        vm.$on("show-list", () => controller?.showList());
        vm.$on("hide-list", () => controller?.hideList());
        vm.$on("close", () => controller?.closeTool());

        const widget: any = VueDijit(vm);
        widget.own(binding);
        return widget;
    }
}
