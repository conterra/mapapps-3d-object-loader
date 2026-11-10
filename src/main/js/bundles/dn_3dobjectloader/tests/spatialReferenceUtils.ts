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
import { coordinateDecimals, metersToMapOffset } from "../spatialReferenceUtils";

const UTM = { isGeographic: false, isWebMercator: false, metersPerUnit: 1 };
const FEET = { isGeographic: false, isWebMercator: false, metersPerUnit: 0.3048 };
const WEB_MERCATOR = { isGeographic: false, isWebMercator: true, metersPerUnit: 1 };
const WGS84 = { isGeographic: true, isWebMercator: false };

describe("dn_3dobjectloader/tests/spatialReferenceUtils", function () {
    describe("metersToMapOffset", function () {
        it("keeps meters for projected spatial references in meters", function () {
            assert.deepEqual(metersToMapOffset(UTM, 344724, 5676186, 10, -5), [10, -5]);
        });

        it("assumes meters without a spatial reference", function () {
            assert.deepEqual(metersToMapOffset(undefined, 0, 0, 3, 4), [3, 4]);
        });

        it("converts meters to feet", function () {
            const [dx, dy] = metersToMapOffset(FEET, 0, 0, 0.3048, 3.048);
            assert.closeTo(dx, 1, 1e-9);
            assert.closeTo(dy, 10, 1e-9);
        });

        it("applies the Web Mercator scale factor (1 / cos(latitude))", function () {
            // y of 50.9375° N (Cologne) in Web Mercator.
            const y = 6610677;
            const lat = 2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2;
            const [dx, dy] = metersToMapOffset(WEB_MERCATOR, 774853, y, 10, 10);
            assert.closeTo(dx, 10 / Math.cos(lat), 1e-6);
            assert.closeTo(dy, 10 / Math.cos(lat), 1e-6);
            assert.closeTo(dx, 15.9, 0.1);
        });

        it("converts meters to degrees for geographic spatial references", function () {
            const [dLon, dLat] = metersToMapOffset(WGS84, 6.95, 50.94, 100, 100);
            // At ~51° N, 1° latitude is ~111.2 km and 1° longitude is ~70.3 km.
            assert.closeTo(dLat * 111215, 100, 0.5);
            assert.closeTo(dLon * 70300, 100, 0.5);
        });

        it("is accurate at the equator", function () {
            const [dLon, dLat] = metersToMapOffset(WGS84, 0, 0, 111319.49, 110574.39);
            assert.closeTo(dLon, 1, 1e-4);
            assert.closeTo(dLat, 1, 1e-4);
        });
    });

    describe("coordinateDecimals", function () {
        it("uses 7 decimals for degrees and 2 otherwise", function () {
            assert.equal(coordinateDecimals(WGS84), 7);
            assert.equal(coordinateDecimals(UTM), 2);
            assert.equal(coordinateDecimals(WEB_MERCATOR), 2);
            assert.equal(coordinateDecimals(undefined), 2);
        });
    });
});
