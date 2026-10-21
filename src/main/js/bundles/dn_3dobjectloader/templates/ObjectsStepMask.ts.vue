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
    <div class="step-content step-3">
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
            {{ i18n.step3.instruction }}
        </v-alert>
        <section
            v-if="hasMask"
            class="mask-height-section mt-3"
        >
            <h3 class="section-heading">
                <v-icon
                    color="primary"
                    small
                >
                    material-icon-height
                </v-icon>
                {{ i18n.step3.heightLabel }}
            </h3>
            <v-text-field
                v-model.number="editMaskHeight"
                type="number"
                step="1"
                min="1"
                hide-details
                dense
                outline
                suffix="m"
                class="mask-height-field"
                @input="emitMaskHeight"
            />
        </section>

        <div class="button-bar">
            <v-btn
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
                @click="$emit('reset-mask')"
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
                @click="$emit('save')"
            >
                {{ i18n.buttons.save }}
                <v-icon right>
                    material-icon-check
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
            currentItem: { type: Object, default: undefined }
        },
        data() {
            return {
                editMaskHeight: 50
            };
        },
        computed: {
            hasMask(): boolean {
                return !!this.currentItem?.maskGeometryJson;
            }
        },
        watch: {
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
                    this.editMaskHeight = 50;
                    return;
                }
                const height = item.maskHeight != null ? item.maskHeight : (item.z || 0);
                this.editMaskHeight = Number(Number(height).toFixed(2));
            },
            isFiniteNumber(value: unknown): value is number {
                return typeof value === "number" && isFinite(value);
            },
            emitMaskHeight() {
                if (!this.isFiniteNumber(this.editMaskHeight)) {return;}
                this.$emit("update-mask-height", this.editMaskHeight);
            }
        }
    });
</script>
