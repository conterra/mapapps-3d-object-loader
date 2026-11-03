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
import ObjectsStorageController from "../ObjectsStorageController";

function createController(properties: Record<string, unknown>, appName?: string) {
    const controller: any = new ObjectsStorageController();
    controller._properties = properties;
    if (appName !== undefined) {
        controller._appCtx = { getApplicationName: () => appName };
    }
    return controller as ObjectsStorageController;
}

describe("dn_3dobjectloader/tests/ObjectsStorageController", function () {
    describe("dbName", function () {
        it("uses the configured name", function () {
            assert.equal(createController({ dbName: "custom" }, "sample").dbName, "custom");
        });

        it("derives a per-app default from the app name", function () {
            assert.equal(createController({ dbName: "" }, "sample").dbName, "dn_3dobjectloader_sample");
        });

        it("falls back to the bundle name without an app context", function () {
            assert.equal(createController({}).dbName, "dn_3dobjectloader");
        });
    });
});
