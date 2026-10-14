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
 * Optional license and copyright information of a preset (object type).
 *
 * This is pure configuration data; it is not persisted and not displayed by
 * this bundle. It is the hook for project-specific copyright or attribution
 * widgets: such an adapter can read the presets via
 * {@link ObjectsController.getPresets} and the `presetId` of the placed items
 * from the model, and render the license per object type.
 */
export interface PresetLicense {
    /** Display title (default: {@link PresetModel.name}). */
    title?: string;
    /** Copyright holder or access restrictions. */
    copyright?: string;
    /** Terms of use / license name. */
    fees?: string;
    /** Optional link to the license or source information. */
    url?: string;
}

/**
 * Configurable preset template for a placeable 3D object.
 *
 * The bundle declares default presets in `manifest.json` (`defaultPresetModels`);
 * apps add their own via `presetModels` in `app.json`. Both are combined by
 * {@link mergePresetModels} and exposed through {@link ObjectsController.getPresets}. Placed items inherit the preset's
 * GLB URL; their initial dimensions are derived from the GLB's native
 * bounding box at placement time.
 */
export interface PresetModel {
    id: string;
    name: string;
    /** GLB URL, e.g. `resource('${app}:/assets/x.glb')` or an absolute URL. */
    url: string;
    thumbnail?: string;
    /** License and copyright information of this object type. */
    license?: PresetLicense;
}

/**
 * Combines the bundle's default presets with the presets configured by the app.
 *
 * App presets are added after the defaults. An app preset with the same `id`
 * as a default replaces that default in place, so apps can adjust a default
 * (e.g. its name or thumbnail) without repeating the whole list.
 * Entries without `id` or `url` are ignored.
 *
 * @param defaults       Presets shipped with the bundle.
 * @param presets        Presets configured by the app.
 * @param includeDefaults `false` to use only the app's presets.
 */
export function mergePresetModels(
    defaults: PresetModel[] | undefined,
    presets: PresetModel[] | undefined,
    includeDefaults: boolean = true
): PresetModel[] {
    const valid = (p: PresetModel | undefined): p is PresetModel => !!p?.id && !!p.url;
    const result: PresetModel[] = includeDefaults ? (defaults ?? []).filter(valid) : [];
    for (const preset of (presets ?? []).filter(valid)) {
        const index = result.findIndex(p => p.id === preset.id);
        if (index >= 0) {
            result[index] = preset;
        } else {
            result.push(preset);
        }
    }
    return result;
}
