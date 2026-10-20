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
    <div class="step-content step-1">
        <v-tabs
            :value="sourceTab"
            slider-color="primary"
            class="source-tabs"
            :class="{ 'tabs-readonly': editMode }"
            @input="onSourceTabChange"
        >
            <v-tab :disabled="editMode && sourceTab !== 0">
                {{ i18n.step1.tabPreset }}
            </v-tab>
            <v-tab :disabled="editMode && sourceTab !== 1">
                {{ i18n.step1.tabCustom }}
            </v-tab>
        </v-tabs>

        <div
            v-if="sourceTab === 0"
            class="preset-tab"
        >
            <v-list
                dense
                class="preset-list"
            >
                <v-list-tile
                    v-for="p in presets"
                    :key="p.id"
                    :class="{
                        'preset-selected': activePresetId === p.id,
                        'preset-readonly': editMode && activePresetId !== p.id
                    }"
                    @click="onSelectPreset(p)"
                >
                    <v-list-tile-avatar>
                        <div class="thumb">
                            <img
                                v-if="p.thumbnail"
                                :src="p.thumbnail"
                                :alt="p.name"
                                class="thumb-img"
                            >
                            <v-icon
                                v-else
                                color="grey darken-2"
                                small
                            >
                                material-icon-3d_rotation
                            </v-icon>
                        </div>
                    </v-list-tile-avatar>
                    <v-list-tile-content>
                        <v-list-tile-title>{{ p.name }}</v-list-tile-title>
                    </v-list-tile-content>
                    <v-list-tile-action v-if="activePresetId === p.id">
                        <v-icon color="primary">
                            material-icon-check_circle
                        </v-icon>
                    </v-list-tile-action>
                </v-list-tile>
            </v-list>
        </div>

        <div
            v-else
            class="custom-tab"
        >
            <v-alert
                type="info"
                outline
                dense
                class="unit-info"
                :value="true"
            >
                <v-icon
                    slot="prepend"
                    color="info"
                >
                    material-icon-info_outline
                </v-icon>
                {{ i18n.step1.glbUnitInfo }}
            </v-alert>
            <div
                role="button"
                tabindex="0"
                class="drop-zone"
                :class="{ dragging: isDragging, 'has-file': !!draftUpload, 'drop-readonly': editMode }"
                :aria-label="i18n.step1.glbUnitInfo"
                @drop.prevent="onFileDrop"
                @dragover.prevent="onDragOver"
                @dragleave.prevent="isDragging = false"
                @click="!draftUpload && triggerFilePicker()"
                @keydown.enter.prevent="!draftUpload && triggerFilePicker()"
                @keydown.space.prevent="!draftUpload && triggerFilePicker()"
            >
                <input
                    ref="fileInput"
                    type="file"
                    accept=".glb"
                    class="file-input"
                    :aria-label="i18n.step1.glbUnitInfo"
                    @change="onFilePick"
                >
                <template v-if="!draftUpload">
                    <v-icon
                        size="32"
                        color="grey"
                    >
                        material-icon-cloud_upload
                    </v-icon>
                    <div class="drop-title">
                        {{ i18n.step1.dropTitle }}
                    </div>
                    <div class="badges">
                        <v-chip
                            small
                            outline
                            class="badge"
                        >
                            <v-icon
                                left
                                x-small
                            >
                                material-icon-3d_rotation
                            </v-icon>
                            {{ i18n.step1.formatBadge }}
                        </v-chip>
                        <v-chip
                            small
                            outline
                            class="badge"
                        >
                            <v-icon
                                left
                                x-small
                            >
                                material-icon-data_usage
                            </v-icon>
                            {{ maxSizeText }}
                        </v-chip>
                    </div>
                </template>
                <template v-else>
                    <v-icon
                        size="40"
                        color="success"
                    >
                        material-icon-check_circle
                    </v-icon>
                    <div class="drop-title">
                        {{ draftUpload.title }}
                    </div>
                    <v-btn
                        v-if="!editMode"
                        x-small
                        outline
                        color="error"
                        class="mt-2"
                        @click.stop="clearUpload"
                    >
                        <v-icon
                            left
                            x-small
                        >
                            material-icon-close
                        </v-icon>
                        {{ i18n.step1.removeUpload }}
                    </v-btn>
                </template>
            </div>
            <div
                v-if="fileError"
                class="file-error"
            >
                <v-icon
                    color="error"
                    small
                >
                    material-icon-error
                </v-icon>
                {{ fileError }}
            </div>
            <div class="url-divider">
                <span>{{ i18n.step1.urlAlternative }}</span>
            </div>
            <v-text-field
                :value="draftUrl"
                :label="i18n.step1.urlLabel"
                :placeholder="i18n.step1.urlPlaceholder"
                :readonly="editMode"
                :disabled="editMode"
                hide-details
                dense
                outline
                prepend-inner-icon="material-icon-link"
                class="mb-3"
                @input="$emit('update:draftUrl', $event)"
            />
        </div>

        <v-text-field
            :value="draftTitle"
            :label="i18n.step1.titleLabel"
            hide-details
            dense
            outline
            prepend-inner-icon="material-icon-title"
            class="title-field mt-3"
            @input="$emit('update:draftTitle', $event)"
        />

        <div class="button-bar">
            <v-spacer />
            <v-btn
                color="primary"
                :disabled="!canProceed"
                @click="$emit('next-step')"
            >
                {{ i18n.buttons.align }}
                <v-icon right>
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
            presets: { type: Array as () => any[], default: () => [] },
            /** Maximum size of an uploaded GLB file in bytes. */
            maxFileSize: { type: Number, default: 10485760 },
            activePresetId: { type: String, default: undefined },
            sourceTab: { type: Number, default: 0 },
            draftUpload: { type: Object, default: undefined },
            draftUrl: { type: String, default: "" },
            draftTitle: { type: String, default: "" },
            /**
             * When true, the source (preset / upload / URL) is locked because
             * the user is editing a previously-saved object. Only the title
             * remains editable.
             */
            editMode: { type: Boolean, default: false }
        },
        data() {
            return {
                isDragging: false,
                fileError: ""
            };
        },
        computed: {
            /** Upload size hint, e.g. "Max. 10 MB", from the configured `maxFileSize`. */
            maxSizeText(): string {
                const mb = Math.round((this.maxFileSize / 1048576) * 10) / 10;
                return String(this.i18n.step1.maxSizeBadge).replace("{maxSize}", String(mb));
            },
            canProceed(): boolean {
                // In edit mode the source is locked, so the "next" button must
                // always be enabled — the user may have only changed the title.
                if (this.editMode) {return true;}
                if (this.sourceTab === 0) {return !!this.activePresetId;}
                return !!(this.draftUpload || (this.draftUrl && this.draftUrl.trim().length > 0));
            }
        },
        methods: {
            onSourceTabChange(tab: number) {
                if (this.editMode) { return; }
                if (tab === this.sourceTab) { return; }
                this.$emit("update:sourceTab", tab);
                this.$emit("update:draftTitle", "");
            },
            triggerFilePicker() {
                if (this.editMode) { return; }
                const input = this.$refs.fileInput as HTMLInputElement | undefined;
                if (input) {input.click();}
            },
            onSelectPreset(preset: any) {
                if (this.editMode) { return; }
                this.$emit("update:activePresetId", preset.id);
                if (preset.name) {
                    this.$emit("update:draftTitle", preset.name);
                }
            },
            onDragOver() {
                if (this.editMode) { return; }
                this.isDragging = true;
            },
            onFileDrop(event: DragEvent) {
                this.isDragging = false;
                if (this.editMode) { return; }
                const file = event.dataTransfer?.files?.[0];
                if (file) {this.handleFile(file);}
            },
            onFilePick(event: Event) {
                if (this.editMode) { return; }
                const input = event.target as HTMLInputElement;
                const file = input.files?.[0];
                if (file) {this.handleFile(file);}
            },
            handleFile(file: File) {
                if (!file.name.toLowerCase().endsWith(".glb")) {
                    this.fileError = ".glb";
                    return;
                }
                if (file.size > this.maxFileSize) {
                    this.fileError = this.maxSizeText;
                    return;
                }
                this.fileError = "";
                this.revokeDraftUrl();
                const url = URL.createObjectURL(file);
                const title = file.name.replace(/\.[^/.]+$/, "");
                this.$emit("update:draftUpload", { blob: file, url, title });
                if (!this.draftTitle) {this.$emit("update:draftTitle", title);}
            },
            clearUpload() {
                this.revokeDraftUrl();
                this.$emit("update:draftUpload", undefined);
                const input = this.$refs.fileInput as HTMLInputElement | undefined;
                if (input) {input.value = "";}
            },
            revokeDraftUrl() {
                const url = this.draftUpload?.url;
                if (url) {
                    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
                }
            }
        }
    });
</script>
