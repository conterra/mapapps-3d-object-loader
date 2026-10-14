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
import { CompactItem, FORMAT_VERSION, decodeCompact, encodeCompact, round } from "../Obj3dUrlCodec";

function item(overrides: Partial<CompactItem> = {}): CompactItem {
    return {
        p: "cube", x: 344724.54, y: 5676186.69, z: 36.67, h: 0, w: 1, d: 1, e: 1, s: 100,
        ...overrides
    };
}

describe("dn_3dobjectloader/tests/Obj3dUrlCodec", function () {
    describe("round", function () {
        it("rounds to the given number of decimals", function () {
            assert.equal(round(36.66649, 2), 36.67);
            assert.equal(round(6.9583712345, 7), 6.9583712);
            assert.equal(round(12.5, 0), 13);
        });

        it("maps non-finite values to 0", function () {
            assert.equal(round(NaN, 2), 0);
            assert.equal(round(Infinity, 2), 0);
        });
    });

    describe("encodeCompact / decodeCompact", function () {
        it("round-trips items including title and mask", function () {
            const items = [
                item(),
                item({ p: "pine", t: "My pine", m: { r: [[[1, 2], [3, 4], [5, 6], [1, 2]]], mh: 40 } })
            ];
            const decoded = decodeCompact(encodeCompact(items));
            assert.deepEqual(decoded, items);
        });

        it("writes the current format version", function () {
            const payload = JSON.parse(encodeCompact([item()]));
            assert.equal(payload.v, FORMAT_VERSION);
        });

        it("accepts the first value of a repeated parameter", function () {
            const encoded = encodeCompact([item()]);
            assert.lengthOf(decodeCompact([encoded, "ignored"]), 1);
        });

        it("returns an empty list for missing, malformed or unknown input", function () {
            assert.deepEqual(decodeCompact(undefined), []);
            assert.deepEqual(decodeCompact(""), []);
            assert.deepEqual(decodeCompact("{not json"), []);
            assert.deepEqual(decodeCompact("null"), []);
            assert.deepEqual(decodeCompact(JSON.stringify({ v: FORMAT_VERSION + 1, o: [item()] })), []);
            assert.deepEqual(decodeCompact(JSON.stringify({ v: FORMAT_VERSION, o: "x" })), []);
        });

        it("drops items without preset id or with invalid coordinates", function () {
            const raw = JSON.stringify({
                v: FORMAT_VERSION,
                o: [item(), { ...item(), p: 1 }, { ...item(), x: "1" }, { ...item(), z: null }, null]
            });
            const decoded = decodeCompact(raw);
            assert.lengthOf(decoded, 1);
            assert.equal(decoded[0].p, "cube");
        });
    });
});
