<!--

    Copyright (C) 2025 con terra GmbH (info@conterra.de)

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

            http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

-->
<template>
    <div class="dn-3dobjectloader">
        <objects-list-view
            v-if="listView"
            :i18n="i18n"
            :items="items"
            :selected-id="selectedId"
            @new="$emit('new')"
            @select="$emit('select', $event)"
            @remove="$emit('remove', $event)"
            @close="$emit('close')"
        />

        <objects-final-screen
            v-else-if="workflowStep === 'final'"
            :i18n="i18n"
            :last-saved-id="lastSavedId"
            @new="$emit('new')"
            @close="$emit('close')"
            @edit-last="$emit('edit-last')"
            @show-list="$emit('show-list')"
        />

        <template v-else>
            <v-alert
                type="info"
                outline
                dense
                class="step-info"
                :value="true"
            >
                <v-icon
                    slot="prepend"
                    color="info"
                >
                    material-icon-info_outline
                </v-icon>
                <span>{{ stepInfoText }}</span>
            </v-alert>

            <div class="stepper">
                <template v-for="n in stepNumbers">
                    <div
                        :key="'step-'+n"
                        class="step"
                        :class="{ active: String(workflowStep) === n, done: isStepDone(n) }"
                    >
                        <span class="num">{{ n }}</span>
                        <span class="label">{{ i18n.steps[n].label }}</span>
                    </div>
                    <span
                        v-if="n !== stepNumbers[stepNumbers.length - 1]"
                        :key="'sep-'+n"
                        class="step-sep"
                    />
                </template>
            </div>

            <objects-step-source
                v-if="String(workflowStep) === '1'"
                :i18n="i18n"
                :presets="presets"
                :max-file-size="maxFileSize"
                :active-preset-id="activePresetId"
                :source-tab="sourceTab"
                :draft-upload="draftUpload"
                :draft-url="draftUrl"
                :draft-title="draftTitle"
                :edit-mode="editMode"
                @update:activePresetId="activePresetId = $event"
                @update:sourceTab="sourceTab = $event"
                @update:draftUpload="draftUpload = $event"
                @update:draftUrl="draftUrl = $event"
                @update:draftTitle="onDraftTitleInput($event)"
                @next-step="$emit('next-step')"
            />

            <objects-step-transform
                v-else-if="String(workflowStep) === '2'"
                :i18n="i18n"
                :current-item="currentItem"
                :proportional="proportional"
                :is-last-step="!maskAvailable"
                :coordinate-decimals="coordinateDecimals"
                :geographic-coordinates="geographicCoordinates"
                :spatial-reference-label="spatialReferenceLabel"
                @prev-step="$emit('prev-step')"
                @next-step="$emit('next-step')"
                @reset-step="$emit('reset-step')"
                @set-proportional="$emit('set-proportional', $event)"
                @update-dimensions="$emit('update-dimensions', $event)"
                @update-position="$emit('update-position', $event)"
                @update-heading="$emit('update-heading', $event)"
                @update-scale="$emit('update-scale', $event)"
            />

            <objects-step-mask
                v-else-if="String(workflowStep) === '3'"
                :i18n="i18n"
                :current-item="currentItem"
                @prev-step="$emit('prev-step')"
                @reset-mask="$emit('reset-mask')"
                @save="$emit('save')"
                @update-mask-height="$emit('update-mask-height', $event)"
            />
        </template>
    </div>
</template>

<script lang="ts">
    import Vue from "apprt-vue/Vue";
    import Bindable from "apprt-vue/mixins/Bindable";
    import ObjectsListView from "./templates/ObjectsListView.ts.vue";
    import ObjectsFinalScreen from "./templates/ObjectsFinalScreen.ts.vue";
    import ObjectsStepSource from "./templates/ObjectsStepSource.ts.vue";
    import ObjectsStepTransform from "./templates/ObjectsStepTransform.ts.vue";
    import ObjectsStepMask from "./templates/ObjectsStepMask.ts.vue";

    const EMPTY_I18N = {
        tool: { title: "", tooltip: "" },
        ui: { windowTitle: "", placeholder: "", clickMapInstruction: "", cancelPlacement: "" },
        steps: {
            "1": { label: "", info: "" },
            "2": { label: "", info: "" },
            "3": { label: "", info: "" }
        },
        step1: {
            tabPreset: "", tabCustom: "",
            glbUnitInfo: "", dropTitle: "", dropSubtitle: "",
            formatBadge: "", maxSizeBadge: "",
            urlAlternative: "", urlLabel: "", urlPlaceholder: "",
            titleLabel: ""
        },
        step2: {
            positionHeading: "", easting: "", northing: "", longitude: "", latitude: "", elevation: "", heading: "",
            sizeHeading: "", proportional: "", height: "", width: "", depth: "",
            distortionWarning: "", scaleHeading: ""
        },
        step3: { instruction: "", heightLabel: "" },
        buttons: { align: "", planningArea: "", back: "", reset: "", save: "" },
        final: { success: "", next: "", newObject: "", close: "", editLast: "", showList: "" },
        list: { heading: "", newItem: "", edit: "", remove: "" },
        groupLayer: { title: "" },
        action: { delete: "", edit: "" }
    };

    export default Vue.extend({
        components: {
            ObjectsListView,
            ObjectsFinalScreen,
            ObjectsStepSource,
            ObjectsStepTransform,
            ObjectsStepMask
        },
        mixins: [Bindable],
        data() {
            return {
                i18n: EMPTY_I18N,
                presets: [] as any[],
                maxFileSize: 10485760,
                // bound from model
                workflowStep: 1 as number | string,
                mode: "idle",
                activePresetId: undefined as string | undefined,
                sourceTab: 0,
                draftUpload: undefined as any,
                draftUrl: "",
                draftTitle: "",
                currentItem: undefined as any,
                lastSavedId: undefined as string | undefined,
                items: [] as any[],
                proportional: true,
                scalePercent: 100,
                listView: false,
                maskAvailable: true,
                coordinateDecimals: 2,
                geographicCoordinates: false,
                spatialReferenceLabel: ""
            };
        },
        computed: {
            /** Steps shown in the stepper; the mask step only exists if a mesh layer can be masked. */
            stepNumbers(): string[] {
                return this.maskAvailable ? ["1", "2", "3"] : ["1", "2"];
            },
            /** Id of the currently selected/edited object — forwarded to the list view. */
            selectedId(): string | undefined {
                return this.currentItem?.id;
            },
            /** Info banner text for the active workflow step (from i18n). */
            stepInfoText(): string {
                const key = String(this.workflowStep);
                return (this.i18n.steps as any)[key]?.info || "";
            },
            /**
             * True when the current item is already persisted (edit flow),
             * not a fresh draft being placed. Used to switch Step 1 into a
             * read-only model display while keeping the title editable.
             */
            editMode(): boolean {
                const current = this.currentItem;
                if (!current) {return false;}
                return this.items.some((i: any) => i.id === current.id);
            }
        },
        /** Notifies the factory so it can wire model → widget bindings once the widget is in the DOM. */
        mounted() {
            this.$emit("widget-mounted");
        },
        /** Notifies the factory so it can tear down bindings before the widget is removed. */
        beforeDestroy() {
            this.$emit("widget-destroyed");
        },
        methods: {
            /** True when step `n` is considered completed at the current workflow position. */
            isStepDone(n: string): boolean {
                const current = String(this.workflowStep);
                if (current === "final") {return true;}
                return Number(current) > Number(n);
            },
            /**
             * Forwards a Step-1 title input both into the model binding (so the
             * field stays controlled) and — when editing a persisted item — as
             * an `update-title` event so the controller auto-persists the change.
             */
            onDraftTitleInput(value: string) {
                this.draftTitle = value;
                if (this.editMode) {
                    this.$emit("update-title", value);
                }
            }
        }
    });
</script>
