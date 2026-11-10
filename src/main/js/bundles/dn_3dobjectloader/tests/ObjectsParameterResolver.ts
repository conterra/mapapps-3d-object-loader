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
import ObjectsParameterResolver from "../ObjectsParameterResolver";
import { CompactItem, FORMAT_VERSION, encodeCompact } from "../Obj3dUrlCodec";

const ITEM: CompactItem = { p: "cube", x: 1, y: 2, z: 3, h: 0, w: 1, d: 1, e: 1, s: 100 };

function createResolver(shared: CompactItem[] = [], restoreStrategy?: string) {
    const restored: { items: CompactItem[]; strategy: string }[] = [];
    const resolver: any = new ObjectsParameterResolver();
    resolver._controller = {
        getSharedCompactItems: () => shared,
        restoreSharedItems: (items: CompactItem[], strategy: string) => restored.push({ items, strategy })
    };
    resolver._properties = restoreStrategy ? { restoreStrategy } : {};
    return { resolver: resolver as ObjectsParameterResolver, restored };
}

function tick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

describe("dn_3dobjectloader/tests/ObjectsParameterResolver", function () {
    it("owns the obj3d parameter", function () {
        assert.deepEqual(createResolver().resolver.parameterNames, ["obj3d"]);
    });

    it("encodes the shareable items", function () {
        const { resolver } = createResolver([ITEM]);
        const encoded = resolver.encodeURLParameter();
        assert.deepEqual(JSON.parse(encoded.obj3d as string), { v: FORMAT_VERSION, o: [ITEM] });
    });

    it("removes the parameter when nothing is shared", function () {
        const { resolver } = createResolver([]);
        assert.deepEqual(resolver.encodeURLParameter(), { obj3d: undefined });
    });

    it("hands decoded items to the controller with the default strategy", async function () {
        const { resolver, restored } = createResolver();
        resolver.decodeURLParameter({ obj3d: encodeCompact([ITEM]) });
        await tick();
        assert.deepEqual(restored, [{ items: [ITEM], strategy: "replace" }]);
    });

    it("uses the configured restore strategy", async function () {
        const { resolver, restored } = createResolver([], "append");
        resolver.decodeURLParameter({ obj3d: encodeCompact([ITEM]) });
        await tick();
        assert.equal(restored[0].strategy, "append");
    });

    it("ignores missing or invalid parameters", async function () {
        const { resolver, restored } = createResolver();
        resolver.decodeURLParameter({});
        resolver.decodeURLParameter({ obj3d: "garbage" });
        await tick();
        assert.lengthOf(restored, 0);
    });
});
