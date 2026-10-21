# dn_3dobjectloader

This bundle lets the user place 3D models (glTF binary, `.glb`) in a 3D scene. The user chooses a prefabricated
object or uploads an own `.glb` file, positions, rotates and scales it on the map, and optionally defines a
planning area in which an integrated mesh is hidden. Placed objects are kept in the browser, are listed in the
table of contents (zoom to, edit, delete) and can be shared via the URL.

## Usage

1. Add the bundle `dn_3dobjectloader` to your app.
2. Add the tool `objectLoaderToggleTool` to a toolset.
3. Optional: set `meshLayerId` (see below) if objects should cut out an integrated mesh of your scene.

To make the functions of this bundle available to the user, the following tool can be added to a toolset:

| Tool ID                | Component         | Description              |
| ---------------------- | ----------------- | ------------------------ |
| objectLoaderToggleTool | ObjectsToggleTool | Show or hide the widget. |

## Configuration Reference

Sample

```json
{
    "dn_3dobjectloader": {
        "ObjectsController": {
            "includeDefaultPresets": true,
            "presetModels": [
                {
                    "id": "garage",
                    "name": "Garage",
                    "url": "resource('${app}:/assets/models/garage.glb')",
                    "thumbnail": "resource('${app}:/assets/models/garage.png')"
                }
            ]
        },
        "ObjectsMeshMaskManager": {
            "meshLayerId": "mesh"
        }
    }
}
```

### Configurable Components of dn_3dobjectloader:

#### ObjectsController

| Property              | Type     | Possible Values                | Default                         | Description                                                                                                                                                                                      |
| --------------------- | -------- | ------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| presetModels          | Array    |                                | ```[]```                        | Additional objects for placement (see below). They are listed after the prefabricated objects of the bundle. An entry with the `id` of a prefabricated object replaces it.                       |
| includeDefaultPresets | Boolean  | ```true``` &#124; ```false```  | ```true```                      | Set to `false` to offer only the `presetModels`. Without `presetModels`, users can then only upload their own files.                                                                             |
| groupLayerId          | String   |                                | ```"dn-3dobjectloader-group"``` | Id of the group layer that holds the placed objects. It is created automatically. Declare a `GROUP` layer with this id in `map-init` to control its title and position in the table of contents. |
| highlightColor        | Number[] | ```[r, g, b, a]```             | ```[255, 235, 59, 1]```         | Highlight color of the selected object.                                                                                                                                                          |

Properties of a preset model:

| Property  | Type   | Description                                                                                                                                                                  |
| --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id        | String | Unique id. It is stored with placed objects and used in shared URLs, so do not change it once in use.                                                                        |
| name      | String | Display name and default title of placed objects.                                                                                                                            |
| url       | String | URL of the `.glb` file, e.g. `resource('${app}:/assets/models/garage.glb')` for a file in the `assets` folder of the app. Absolute URLs must allow CORS. One glTF unit is one meter. |
| thumbnail | String | Optional preview image.                                                                                                                                                      |
| license   | Object | Optional license information (`title`, `copyright`, `fees`, `url`). It is not displayed by this bundle; see [Integration API](#integration-api).                              |

#### ObjectsMeshMaskManager

| Property    | Type   | Possible Values | Default    | Description                                                                                                                                                                      |
| ----------- | ------ | --------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| meshLayerId | String |                 | ```""```   | Id of an integrated mesh layer (`AGS_INTEGRATEDMESH`) in `map-init`. Objects can hide the mesh in a planning area. Without this layer, the planning area step is skipped. |

#### ObjectsStorageController

| Property      | Type   | Possible Values | Default                   | Description                                                                                              |
| ------------- | ------ | --------------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| dbName        | String |                 | ```"dn_3dobjectloader"``` | Name of the IndexedDB database. Use different names for apps on the same host that must not share objects. |
| maxFileSize   | Number |                 | ```10485760``` (10 MB)    | Maximum size of an uploaded `.glb` file in bytes.                                                          |

#### ObjectsParameterResolver

| Property        | Type   | Possible Values                                         | Default         | Description                                                                                                                     |
| --------------- | ------ | ------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| restoreStrategy | String | ```replace``` &#124; ```append``` &#124; ```ifEmpty``` | ```"replace"``` | How objects from the URL parameter `obj3d` are combined with the objects stored in the browser: replace, add, or only restore if none are stored. |

### Prefabricated objects

The bundle ships the following objects. To adjust one of them, add an entry with its `id` to `presetModels`. To use
a bundled model in an own preset, reference it as `resource('dn_3dobjectloader:assets/models/pine.glb')`.

| id                       | Name                      | Source                                                                                                                              | License                                                                               |
| ------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `wind_turbine`           | Wind turbine              | Kreis Recklinghausen, [AdV CityGML sample data](https://repository.gdi-de.org/schemas/adv/citygml/Beispieldaten/), converted to glTF | [Datenlizenz Deutschland – Zero – Version 2.0](https://www.govdata.de/dl-de/zero-2-0) |
| `transmission_tower_18m` | Transmission tower (18 m) | as above                                                                                                                            | as above                                                                              |
| `transmission_tower_45m` | Transmission tower (45 m) | as above                                                                                                                            | as above                                                                              |
| `transmission_tower_65m` | Transmission tower (65 m) | as above                                                                                                                            | as above                                                                              |
| `birch_tree`             | Birch tree                | con terra GmbH, created for this bundle                                                                                             | [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)                     |
| `pine`                   | Pine                      | as above                                                                                                                            | as above                                                                              |
| `cube`                   | Cube                      | as above                                                                                                                            | as above                                                                              |

## Spatial reference

Placed objects use the spatial reference of the map. Sizes and elevations are always in meters. Projected
spatial references in meters (e.g. UTM) are recommended. Other projected units, Web Mercator and geographic
spatial references are supported: sizes are converted at the position of the object, and geographic coordinates
are shown as longitude/latitude.

An integrated mesh is only displayed in a scene with the same spatial reference. For a mesh in a projected
spatial reference, the app needs a local scene, so configure a basemap in that spatial reference.

## Integration API

Other bundles can use the service `dn_3dobjectloader.ObjectsIntegrationAPI`, e.g. to display the `license` of
the presets in a project-specific copyright widget:

| Method                     | Description                                                             |
| -------------------------- | ----------------------------------------------------------------------- |
| `getPresets()`             | Returns the prefabricated objects and the configured preset models.     |
| `startPlacement(presetId)` | Starts the placement of a preset; the next click on the map places it.  |
| `placeAt(point)`           | Places the active preset at the given point.                            |
| `selectObject(id)`         | Selects a placed object.                                                |
| `removeObject(id)`         | Removes a placed object including its planning area.                    |

## Restrictions

- Only works in 3D view.
- The elevation of a placed object comes from the terrain or mesh. If no elevation service is available, it is
  0 and has to be entered by the user.
- Objects are stored per browser. Only prefabricated and configured objects can be shared via URL, not uploaded
  files.
