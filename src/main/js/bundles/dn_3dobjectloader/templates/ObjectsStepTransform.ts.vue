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
    <div class="step-content step-2">
        <div
            v-if="!currentItem"
            class="placing-hint"
        >
            <v-alert
                type="info"
                outline
                class="placing-alert"
                :value="true"
            >
                <v-icon
                    slot="prepend"
                    color="info"
                    size="24"
                >
                    material-icon-my_location
                </v-icon>
                <div class="placing-alert-body">
                    <strong>{{ i18n.ui.clickMapInstruction }}</strong>
                    <v-btn
                        x-small
                        text
                        class="mt-1"
                        @click="$emit('prev-step')"
                    >
                        <v-icon
                            left
                            x-small
                        >
                            material-icon-close
                        </v-icon>
                        {{ i18n.ui.cancelPlacement }}
                    </v-btn>
                </div>
            </v-alert>
        </div>

        <template v-if="currentItem">
            <section class="position-section">
                <h3 class="section-heading">
                    <v-icon
                        color="primary"
                        small
                    >
                        material-icon-place
                    </v-icon>
                    {{ i18n.step2.positionHeading }}<template v-if="spatialReferenceLabel">
                        ({{ spatialReferenceLabel }})
                    </template>
                </h3>
                <div class="field-row position-row">
                    <v-text-field
                        v-model.number="editX"
                        type="number"
                        :step="coordinateStep"
                        :label="geographicCoordinates ? i18n.step2.longitude : i18n.step2.easting"
                        hide-details
                        dense
                        outline
                        @input="onPosition('x', editX)"
                    />
                    <v-text-field
                        v-model.number="editY"
                        type="number"
                        :step="coordinateStep"
                        :label="geographicCoordinates ? i18n.step2.latitude : i18n.step2.northing"
                        hide-details
                        dense
                        outline
                        @input="onPosition('y', editY)"
                    />
                    <v-text-field
                        v-model.number="editZ"
                        type="number"
                        step="0.01"
                        :label="i18n.step2.elevation"
                        hide-details
                        dense
                        outline
                        @input="onPosition('z', editZ)"
                    />
                    <v-text-field
                        v-model.number="editHeading"
                        type="number"
                        step="1"
                        :label="i18n.step2.heading"
                        hide-details
                        dense
                        outline
                        suffix="°"
                        @input="emitHeading"
                    />
                </div>
            </section>

            <section class="size-section">
                <h3 class="section-heading">
                    <v-icon
                        color="primary"
                        small
                    >
                        material-icon-height
                    </v-icon>
                    {{ i18n.step2.sizeHeading }}
                </h3>
                <div class="lock-row">
                    <button
                        type="button"
                        class="lock-toggle"
                        :class="{ locked: proportional }"
                        @click="$emit('set-proportional', !proportional)"
                    >
                        <v-icon small>
                            {{ proportional ? 'material-icon-lock' : 'material-icon-lock_open' }}
                        </v-icon>
                        {{ i18n.step2.proportional }}
                    </button>
                </div>
                <div class="field-row size-row">
                    <v-text-field
                        v-model.number="editHeight"
                        type="number"
                        step="0.1"
                        min="0.1"
                        :label="i18n.step2.height"
                        :disabled="proportional"
                        hide-details
                        dense
                        outline
                        suffix="m"
                        @input="onDim('height', editHeight)"
                    />
                    <v-icon
                        class="chain"
                        :class="{ active: proportional }"
                    >
                        {{ proportional ? 'material-icon-link' : 'material-icon-link_off' }}
                    </v-icon>
                    <v-text-field
                        v-model.number="editWidth"
                        type="number"
                        step="0.1"
                        min="0.1"
                        :label="i18n.step2.width"
                        :disabled="proportional"
                        hide-details
                        dense
                        outline
                        suffix="m"
                        @input="onDim('width', editWidth)"
                    />
                    <v-icon
                        class="chain"
                        :class="{ active: proportional }"
                    >
                        {{ proportional ? 'material-icon-link' : 'material-icon-link_off' }}
                    </v-icon>
                    <v-text-field
                        v-model.number="editDepth"
                        type="number"
                        step="0.1"
                        min="0.1"
                        :label="i18n.step2.depth"
                        :disabled="proportional"
                        hide-details
                        dense
                        outline
                        suffix="m"
                        @input="onDim('depth', editDepth)"
                    />
                </div>
                <v-alert
                    v-if="!proportional"
                    type="warning"
                    outline
                    dense
                    class="distortion-warning"
                    :value="true"
                >
                    <v-icon
                        slot="prepend"
                        color="warning"
                    >
                        material-icon-warning
                    </v-icon>
                    {{ i18n.step2.distortionWarning }}
                </v-alert>
            </section>

            <section class="scale-section">
                <h3 class="section-heading">
                    <v-icon
                        color="primary"
                        small
                    >
                        material-icon-aspect_ratio
                    </v-icon>
                    {{ i18n.step2.scaleHeading }}
                </h3>
                <div class="field-row">
                    <v-text-field
                        v-model.number="editScale"
                        type="number"
                        step="1"
                        min="1"
                        :disabled="!proportional"
                        hide-details
                        dense
                        outline
                        suffix="%"
                        class="scale-field"
                        @input="emitScale"
                    />
                </div>
            </section>
        </template>

        <div class="button-bar">
            <v-btn
                v-if="canGoBack"
                text
                @click="$emit('prev-step')"
            >
                <v-icon left>
                    material-icon-chevron_left
                </v-icon>
                {{ i18n.buttons.back }}
            </v-btn>
            <v-btn
                text
                @click="$emit('reset-step')"
            >
                <v-icon left>
                    material-icon-refresh
                </v-icon>
                {{ i18n.buttons.reset }}
            </v-btn>
            <v-spacer />
            <v-btn
                color="primary"
                :disabled="!currentItem"
                @click="$emit('next-step')"
            >
                {{ isLastStep ? i18n.buttons.save : i18n.buttons.planningArea }}
                <v-icon
                    v-if="!isLastStep"
                    right
                >
                    material-icon-chevron_right
                </v-icon>
            </v-btn>
        </div>
    </div>
</template>

<script lang="ts">
    import Vue from "apprt-vue/Vue";

    export default Vue.extend({
        props: {
            i18n: { type: Object, required: true },
            currentItem: { type: Object, default: undefined },
            proportional: { type: Boolean, default: true },
            canGoBack: { type: Boolean, default: true },
            /** True when there is no mask step, so "next" saves the object. */
            isLastStep: { type: Boolean, default: false },
            /** Decimals of the x/y inputs (7 for degrees, 2 for meters). */
            coordinateDecimals: { type: Number, default: 2 },
            /** Label x/y as longitude/latitude instead of easting/northing. */
            geographicCoordinates: { type: Boolean, default: false },
            /** Short name of the spatial reference, e.g. "EPSG:25832"; shown next to the position heading. */
            spatialReferenceLabel: { type: String, default: "" }
        },
        data() {
            return {
                editX: 0,
                editY: 0,
                editZ: 0,
                editHeading: 0,
                editWidth: 0,
                editDepth: 0,
                editHeight: 0,
                editScale: 100
            };
        },
        computed: {
            coordinateStep(): string {
                return Math.pow(10, -this.coordinateDecimals).toFixed(this.coordinateDecimals);
            }
        },
        watch: {
            coordinateDecimals() {
                this.syncFromItem();
            },
            currentItem: {
                immediate: true,
                deep: true,
                handler() {
                    this.syncFromItem();
                }
            }
        },
        methods: {
            syncFromItem() {
                const item = this.currentItem;
                if (!item) {
                    this.editX = 0; this.editY = 0; this.editZ = 0;
                    this.editHeading = 0;
                    this.editWidth = 0; this.editDepth = 0; this.editHeight = 0;
                    this.editScale = 100;
                    return;
                }
                const f = (item.scalePercent || 100) / 100;
                const xy = this.coordinateDecimals;
                this.editX = Number(item.x != null ? Number(item.x).toFixed(xy) : 0);
                this.editY = Number(item.y != null ? Number(item.y).toFixed(xy) : 0);
                this.editZ = Number(item.z != null ? Number(item.z).toFixed(2) : 0);
                this.editHeading = Number(item.heading != null ? Number(item.heading).toFixed(2) : 0);
                this.editWidth = +((item.width || 0) * f).toFixed(2);
                this.editDepth = +((item.depth || 0) * f).toFixed(2);
                this.editHeight = +((item.height || 0) * f).toFixed(2);
                this.editScale = item.scalePercent || 100;
            },
            isFiniteNumber(value: unknown): value is number {
                return typeof value === "number" && isFinite(value);
            },
            isPositiveNumber(value: unknown): value is number {
                return this.isFiniteNumber(value) && value > 0;
            },
            onPosition(field: "x" | "y" | "z", value: unknown) {
                if (!this.isFiniteNumber(value)) {return;}
                const payload: { x?: number; y?: number; z?: number } = {};
                payload[field] = value;
                this.$emit("update-position", payload);
            },
            onDim(field: "width" | "depth" | "height", value: unknown) {
                if (!this.isPositiveNumber(value)) {return;}
                const payload: {
                    proportional: boolean; width?: number; depth?: number; height?: number;
                } = { proportional: this.proportional };
                payload[field] = value;
                this.$emit("update-dimensions", payload);
            },
            emitHeading() {
                if (!this.isFiniteNumber(this.editHeading)) {return;}
                this.$emit("update-heading", this.editHeading);
            },
            emitScale() {
                if (!this.isPositiveNumber(this.editScale)) {return;}
                this.$emit("update-scale", this.editScale);
            }
        }
    });
</script>
