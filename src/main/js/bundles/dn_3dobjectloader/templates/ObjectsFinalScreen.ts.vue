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
    <div class="dn-3dobjectloader-final">
        <v-alert
            type="success"
            outline
            class="final-banner"
            :value="true"
        >
            <div class="final-banner-inner">
                <span class="final-banner-text">{{ i18n.final.success }}</span>
            </div>
        </v-alert>
        <div class="final-content">
            <div class="final-question">
                {{ i18n.final.next }}
            </div>
            <div class="final-primary">
                <v-btn
                    color="primary"
                    large
                    @click="$emit('new')"
                >
                    <v-icon left>
                        material-icon-add
                    </v-icon>
                    {{ i18n.final.newObject }}
                </v-btn>
            </div>
        </div>
        <div class="final-footer">
            <v-btn
                text
                small
                @click="$emit('close')"
            >
                <v-icon
                    left
                    small
                >
                    material-icon-close
                </v-icon>{{ i18n.final.close }}
            </v-btn>
            <v-btn
                text
                small
                :disabled="!lastSavedId"
                @click="$emit('edit-last')"
            >
                <v-icon
                    left
                    small
                >
                    material-icon-edit
                </v-icon>{{ i18n.final.editLast }}
            </v-btn>
            <v-btn
                text
                small
                @click="$emit('show-list')"
            >
                <v-icon
                    left
                    small
                >
                    material-icon-menu
                </v-icon>{{ i18n.final.showList }}
            </v-btn>
        </div>
    </div>
</template>

<script lang="ts">
    import Vue from "apprt-vue/Vue";

    export default Vue.extend({
        props: {
            i18n: { type: Object, required: true },
            lastSavedId: { type: String, default: undefined }
        }
    });
</script>
