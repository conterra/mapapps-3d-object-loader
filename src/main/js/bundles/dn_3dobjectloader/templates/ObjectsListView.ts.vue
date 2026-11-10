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
    <div class="dn-3dobjectloader-list-view">
        <div class="list-header">
            <span class="list-title">
                {{ i18n.list.heading }} <span class="list-count">({{ items.length }})</span>
            </span>
            <v-btn
                small
                color="primary"
                @click="$emit('new')"
            >
                <v-icon
                    left
                    small
                >
                    material-icon-add
                </v-icon>
                {{ i18n.list.newItem }}
            </v-btn>
        </div>
        <v-list
            dense
            class="placed-list"
        >
            <v-list-tile
                v-for="it in items"
                :key="it.id"
                class="placed-list-item"
                :class="{ selected: selectedId === it.id }"
                @click="$emit('select', it.id)"
            >
                <v-list-tile-avatar>
                    <div class="thumb">
                        <v-icon color="grey darken-1">
                            material-icon-3d_rotation
                        </v-icon>
                    </div>
                </v-list-tile-avatar>
                <v-list-tile-content>
                    <v-list-tile-title>{{ it.title }}</v-list-tile-title>
                    <v-list-tile-sub-title>
                        {{ formatDim(effH(it)) }} × {{ formatDim(effW(it)) }} × {{ formatDim(effD(it)) }}
                    </v-list-tile-sub-title>
                </v-list-tile-content>
                <v-list-tile-action>
                    <v-btn
                        icon
                        small
                        :title="i18n.list.edit"
                        @click.stop="$emit('select', it.id)"
                    >
                        <v-icon small>
                            material-icon-edit
                        </v-icon>
                    </v-btn>
                </v-list-tile-action>
                <v-list-tile-action>
                    <v-btn
                        icon
                        small
                        :title="i18n.list.remove"
                        @click.stop="$emit('remove', it.id)"
                    >
                        <v-icon
                            small
                            color="error"
                        >
                            material-icon-delete_outline
                        </v-icon>
                    </v-btn>
                </v-list-tile-action>
            </v-list-tile>
            <v-list-tile
                v-if="!items.length"
                class="empty-hint"
            >
                <v-list-tile-content>
                    <v-list-tile-sub-title>{{ i18n.ui.placeholder }}</v-list-tile-sub-title>
                </v-list-tile-content>
            </v-list-tile>
        </v-list>
        <div class="button-bar">
            <v-spacer />
            <v-btn
                text
                @click="$emit('close')"
            >
                <v-icon
                    left
                    small
                >
                    material-icon-close
                </v-icon>
                {{ i18n.final.close }}
            </v-btn>
        </div>
    </div>
</template>

<script lang="ts">
    import Vue from "apprt-vue/Vue";

    export default Vue.extend({
        props: {
            i18n: { type: Object, required: true },
            items: { type: Array as () => any[], default: () => [] },
            selectedId: { type: String, default: undefined }
        },
        methods: {
            effW(it: any): number { return it.width * (it.scalePercent / 100); },
            effD(it: any): number { return it.depth * (it.scalePercent / 100); },
            effH(it: any): number { return it.height * (it.scalePercent / 100); },
            formatDim(v: number): string {
                if (!isFinite(v)) {return "–";}
                return v.toFixed(1) + " m";
            }
        }
    });
</script>
