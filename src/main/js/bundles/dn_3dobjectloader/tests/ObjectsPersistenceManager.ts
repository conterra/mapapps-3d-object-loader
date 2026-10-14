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
import ObjectsPersistenceManager from "../ObjectsPersistenceManager";
import type { ObjectItem } from "../ObjectsStorageController";
import type { PresetModel } from "../PresetModel";

const PRESETS: PresetModel[] = [{ id: "cube", name: "Cube", url: "https://example.org/cube.glb" }];

function storedItem(overrides: Partial<ObjectItem>): ObjectItem {
    return {
        id: "id1", title: "Item", source: "preset", presetId: "cube", meshUrl: "",
        x: 1, y: 2, z: 30, heading: 0, width: 1, depth: 1, height: 1, scalePercent: 100,
        createdAt: 0,
        ...overrides
    } as ObjectItem;
}

/** In-memory replacement for the IndexedDB-backed ObjectsStorageController. */
function createStorage(items: ObjectItem[] = [], blobs: Record<string, string> = {}) {
    return {
        saved: [] as ObjectItem[][],
        savedBlobs: [] as string[],
        saveBlobResult: true,
        async load() { return items.map((i) => { return { ...i }; }); },
        async save(list: ObjectItem[]) { this.saved.push(list); },
        async loadBlobUrl(key: string) { return blobs[key]; },
        async saveBlob(key: string) { this.savedBlobs.push(key); return this.saveBlobResult; }
    };
}

function createManager(storage: any, items: ObjectItem[] = []) {
    const model: any = { items };
    return { model, manager: new ObjectsPersistenceManager(storage, model, () => PRESETS) };
}

const point: any = { x: 344724.5, y: 5676186.7, z: 36.67 };

describe("dn_3dobjectloader/tests/ObjectsPersistenceManager", function () {
    describe("loadAndHydrate", function () {
        it("resolves the mesh URL of preset items from the configured presets", async function () {
            const { manager } = createManager(createStorage([storedItem({})]));
            const { items, droppedCount } = await manager.loadAndHydrate();
            assert.equal(droppedCount, 0);
            assert.equal(items[0].meshUrl, "https://example.org/cube.glb");
        });

        it("drops items whose preset no longer exists", async function () {
            const storage = createStorage([storedItem({}), storedItem({ id: "id2", presetId: "removed" })]);
            const { items, droppedCount } = await createManager(storage).manager.loadAndHydrate();
            assert.lengthOf(items, 1);
            assert.equal(droppedCount, 1);
        });

        it("restores uploaded files from the blob store", async function () {
            const storage = createStorage(
                [storedItem({ id: "u1", source: "custom", presetId: undefined, customBlobKey: "u1" }),
                    storedItem({ id: "u2", source: "custom", presetId: undefined, customBlobKey: "missing" })],
                { u1: "blob:restored" }
            );
            const { items, droppedCount } = await createManager(storage).manager.loadAndHydrate();
            assert.deepEqual(items.map(i => i.meshUrl), ["blob:restored"]);
            assert.equal(droppedCount, 1);
        });

        it("defaults a missing mask height to the object's elevation", async function () {
            const storage = createStorage([storedItem({ maskHeight: undefined })]);
            const { items } = await createManager(storage).manager.loadAndHydrate();
            assert.equal(items[0].maskHeight, 30);
            assert.isTrue("maskGeometryJson" in items[0]);
        });

        it("returns nothing for an empty store", async function () {
            const { items } = await createManager(createStorage()).manager.loadAndHydrate();
            assert.deepEqual(items, []);
        });
    });

    describe("persist", function () {
        it("saves a copy of the model items immediately with persistNow", async function () {
            const storage = createStorage();
            const { model, manager } = createManager(storage, [storedItem({})]);
            await manager.persistNow();
            assert.lengthOf(storage.saved, 1);
            assert.notStrictEqual(storage.saved[0], model.items);
            assert.deepEqual(storage.saved[0], model.items);
        });

        it("coalesces bursts of persist calls into one save", async function () {
            const storage = createStorage();
            const { manager } = createManager(storage, [storedItem({})]);
            manager.persist();
            manager.persist();
            manager.persist();
            await new Promise(resolve => setTimeout(resolve, 400));
            assert.lengthOf(storage.saved, 1);
        });

        it("only persists items that are already in the list", async function () {
            const storage = createStorage();
            const saved = storedItem({});
            const { manager } = createManager(storage, [saved]);
            const draft = storedItem({ id: "draft" });
            assert.isTrue(manager.isDraft(draft));
            assert.isFalse(manager.isDraft(saved));
            manager.persistIfNotDraft(draft);
            await new Promise(resolve => setTimeout(resolve, 400));
            assert.lengthOf(storage.saved, 0);
        });

        it("stops persisting after dispose", async function () {
            const storage = createStorage();
            const { manager } = createManager(storage, [storedItem({})]);
            await manager.dispose();
            manager.persist();
            await new Promise(resolve => setTimeout(resolve, 400));
            assert.lengthOf(storage.saved, 1, "only the flush of dispose itself");
        });
    });

    describe("item creation", function () {
        it("builds a preset item at the given point", function () {
            const { manager } = createManager(createStorage());
            const item = manager.buildPresetItem(PRESETS[0], point, "");
            assert.equal(item.source, "preset");
            assert.equal(item.presetId, "cube");
            assert.equal(item.meshUrl, PRESETS[0].url);
            assert.equal(item.title, "3D object");
            assert.equal(item.z, 36.67);
            assert.equal(item.maskHeight, 36.67);
            assert.isTrue(item.width === 1 && item.scalePercent === 100);
        });

        it("uses elevation 0 for points without z", function () {
            const { manager } = createManager(createStorage());
            const item = manager.buildCustomUrlItem("https://example.org/a.glb", { x: 1, y: 2 } as any, "A");
            assert.equal(item.z, 0);
            assert.equal(item.source, "custom");
        });

        it("stores uploaded files as blobs and aborts if that fails", async function () {
            const storage = createStorage();
            const { manager } = createManager(storage);
            const draft = { blob: new Blob(["glb"]), url: "blob:preview", title: "upload" };
            const item = await manager.buildCustomBlobItem(draft, point, "");
            assert.equal(item?.customBlobKey, item?.id);
            assert.deepEqual(storage.savedBlobs, [item?.id]);

            storage.saveBlobResult = false;
            assert.isUndefined(await manager.buildCustomBlobItem(draft, point, ""));
        });

        it("generates unique ids", function () {
            const { manager } = createManager(createStorage());
            const ids = new Set(Array.from({ length: 200 }, () => manager.generateId()));
            assert.equal(ids.size, 200);
        });
    });
});
