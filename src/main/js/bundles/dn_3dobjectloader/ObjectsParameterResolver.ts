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

import { InjectedReference } from "apprt-core/InjectedReference";
import { loggerForName } from "apprt-core/Logger";
import { EncodedParameterValue, ParameterValue, Parametrizable } from "parametermanager/api";
import ObjectsController from "./ObjectsController";
import { RestoreStrategy, encodeCompact, decodeCompact } from "./Obj3dUrlCodec";

const LOG = loggerForName("dn_3dobjectloader/ObjectsParameterResolver");
const PARAM_NAME = "obj3d";

/**
 * Bridges the placed 3D preset objects into the URL through the
 * `parametermanager.Parametrizable` contract, so that any share/link bundle
 * using `parametermanager` (e.g. its `getEncodedURL()`) picks them up
 * automatically, without a direct coupling between the bundles.
 *
 * Encoding reads the shareable items from {@link ObjectsController}. Decoding
 * waits for framework startup (so map, view and group layer are ready) before
 * handing the decoded state back to the controller, which owns the actual
 * restore (preset lookup, graphics, masks, persistence).
 */
export default class ObjectsParameterResolver implements Parametrizable {
    private declare _properties: { restoreStrategy: RestoreStrategy };
    _controller!: InjectedReference<ObjectsController>;
    /** Auto-injected by the framework (see Component.ts), not via a manifest reference. */
    private _componentContext!: any;

    /** Owned parameters — required so a cleared state removes `obj3d` from the URL. */
    parameterNames = [PARAM_NAME];

    encodeURLParameter(): Record<string, EncodedParameterValue> {
        const compact = this._controller?.getSharedCompactItems() ?? [];
        return { [PARAM_NAME]: compact.length ? encodeCompact(compact) : undefined };
    }

    decodeURLParameter(allParameters: Record<string, ParameterValue>): void {
        const compact = decodeCompact(allParameters[PARAM_NAME]);
        if (!compact.length) return;
        const strategy = this._properties?.restoreStrategy ?? "replace";
        whenSystemInitialized(this._componentContext)
            .then(() => this._controller?.restoreSharedItems(compact, strategy))
            .catch((e: unknown) => LOG.warn("3D objects URL restore failed", e));
    }
}

/**
 * Resolves once the framework has finished starting (the usual pattern for
 * parameter resolvers that need the map). Without the component context
 * (e.g. in tests) it resolves immediately.
 */
function whenSystemInitialized(componentCtx: any): Promise<void> {
    return new Promise<void>((resolve) => {
        if (!componentCtx) {
            resolve();
            return;
        }
        const bundleContext = componentCtx.getBundleContext();
        const system = bundleContext.getBundle(0);
        if (system.isFrameworkStarted()) {
            resolve();
            return;
        }
        const handle = bundleContext.addFrameworkListener((evt: any) => {
            if (evt.getTypeName() === "STARTED") {
                bundleContext.removeFrameworkListener(handle);
                resolve();
            }
        });
    });
}
