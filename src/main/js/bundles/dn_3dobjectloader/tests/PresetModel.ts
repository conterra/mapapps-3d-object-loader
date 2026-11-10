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

import { assert } from "chai";
import { PresetModel, mergePresetModels } from "../PresetModel";

function preset(id: string, name: string = id): PresetModel {
    return { id, name, url: `https://example.org/${id}.glb` };
}

const DEFAULTS = [preset("wind_turbine"), preset("pine")];

describe("dn_3dobjectloader/tests/PresetModel", function () {
    it("uses the defaults when the app configures no presets", function () {
        assert.deepEqual(mergePresetModels(DEFAULTS, undefined), DEFAULTS);
        assert.deepEqual(mergePresetModels(DEFAULTS, []), DEFAULTS);
    });

    it("adds app presets after the defaults", function () {
        const ids = mergePresetModels(DEFAULTS, [preset("house")]).map(p => p.id);
        assert.deepEqual(ids, ["wind_turbine", "pine", "house"]);
    });

    it("lets an app preset replace a default with the same id in place", function () {
        const merged = mergePresetModels(DEFAULTS, [preset("wind_turbine", "Turbine")]);
        assert.deepEqual(merged.map(p => p.id), ["wind_turbine", "pine"]);
        assert.equal(merged[0].name, "Turbine");
    });

    it("uses only the app presets when defaults are excluded", function () {
        assert.deepEqual(mergePresetModels(DEFAULTS, [preset("house")], false).map(p => p.id), ["house"]);
        assert.deepEqual(mergePresetModels(DEFAULTS, [], false), []);
    });

    it("ignores entries without id or url", function () {
        const invalid = [{ id: "", name: "x", url: "a.glb" }, { id: "y", name: "y", url: "" }] as PresetModel[];
        assert.deepEqual(mergePresetModels(DEFAULTS, invalid), DEFAULTS);
    });

    it("does not modify the given arrays", function () {
        const defaults = [...DEFAULTS];
        mergePresetModels(defaults, [preset("wind_turbine", "Changed"), preset("house")]);
        assert.deepEqual(defaults, DEFAULTS);
    });
});
