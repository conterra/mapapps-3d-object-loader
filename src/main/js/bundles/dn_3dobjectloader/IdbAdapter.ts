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

import { loggerForName } from "apprt-core/Logger";
import type { ObjectItem } from "./ObjectsStorageController";

const LOG = loggerForName("dn_3dobjectloader/IdbAdapter");

const ITEMS_STORE = "items";
const BLOBS_STORE = "blobs";

export interface IdbAdapterOptions {
    dbName: string;
    version: number;
}

/**
 * Thin promise wrapper around the native IndexedDB API.
 *
 * Manages a single database with two object stores:
 * - `items` (`keyPath: "id"`) — strukturiert gespeicherte {@link ObjectItem}s.
 * - `blobs` (out-of-line keys) — GLB-Blobs unter `customBlobKey`.
 *
 * Keeps the connection as a lazy singleton; `versionchange` closes the
 * connection when another tab raises the schema version, so the upgrade
 * there is not blocked.
 */
export default class IdbAdapter {
    private readonly _dbName: string;
    private readonly _version: number;
    private _dbPromise: Promise<IDBDatabase> | undefined;

    constructor(options: IdbAdapterOptions) {
        this._dbName = options.dbName;
        this._version = options.version;
    }

    /** Returns all stored items unfiltered. Caller is responsible for validation. */
    async getAllItems(): Promise<ObjectItem[]> {
        const db = await this._open();
        return new Promise<ObjectItem[]>((resolve, reject) => {
            const tx = db.transaction(ITEMS_STORE, "readonly");
            const req = tx.objectStore(ITEMS_STORE).getAll();
            req.onsuccess = () => resolve((req.result || []) as ObjectItem[]);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Replaces the entire items store with the given list in a single transaction.
     *
     * Uses `clear()` + per-item `put()` so the on-disk state matches the
     * in-memory list exactly — no diff bookkeeping needed.
     */
    async putItems(items: ObjectItem[]): Promise<void> {
        const db = await this._open();
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(ITEMS_STORE, "readwrite");
            const store = tx.objectStore(ITEMS_STORE);
            store.clear();
            for (const item of items) {
                store.put(item);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }

    /** Returns the blob stored under `key`, or `undefined` if not present. */
    async getBlob(key: string): Promise<Blob | undefined> {
        const db = await this._open();
        return new Promise<Blob | undefined>((resolve, reject) => {
            const tx = db.transaction(BLOBS_STORE, "readonly");
            const req = tx.objectStore(BLOBS_STORE).get(key);
            req.onsuccess = () => resolve(req.result as Blob | undefined);
            req.onerror = () => reject(req.error);
        });
    }

    /** Stores `blob` under `key`, overwriting any prior value. */
    async putBlob(key: string, blob: Blob): Promise<void> {
        const db = await this._open();
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(BLOBS_STORE, "readwrite");
            const req = tx.objectStore(BLOBS_STORE).put(blob, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    /** Removes the blob under `key`. No-op if the key does not exist. */
    async deleteBlob(key: string): Promise<void> {
        const db = await this._open();
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(BLOBS_STORE, "readwrite");
            const req = tx.objectStore(BLOBS_STORE).delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    private _open(): Promise<IDBDatabase> {
        if (!this._dbPromise) {
            this._dbPromise = this._openInternal();
        }
        return this._dbPromise;
    }

    private _openInternal(): Promise<IDBDatabase> {
        return new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open(this._dbName, this._version);
            req.onupgradeneeded = (event) => {
                const db = req.result;
                // Fallthrough switch on `oldVersion`: each case applies its own
                // migration step and then falls through into the next, so a
                // jump from V0 to Vn applies every step in order.
                /* eslint-disable no-fallthrough */
                switch (event.oldVersion) {
                    case 0:
                        if (!db.objectStoreNames.contains(ITEMS_STORE)) {
                            db.createObjectStore(ITEMS_STORE, { keyPath: "id" });
                        }
                        if (!db.objectStoreNames.contains(BLOBS_STORE)) {
                            db.createObjectStore(BLOBS_STORE);
                        }
                    // future migrations go below: case 1: ...; case 2: ...;
                }
                /* eslint-enable no-fallthrough */
            };
            req.onsuccess = () => {
                const db = req.result;
                db.addEventListener("versionchange", () => {
                    db.close();
                    this._dbPromise = undefined;
                });
                resolve(db);
            };
            req.onerror = () => reject(req.error);
            req.onblocked = () => {
                LOG.warn("IDB open blocked — another tab still holds an outdated connection");
            };
        });
    }
}
