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

const i18n = {
    root: {
        bundleName: "3D Objects",
        bundleDescription: "Place, scale and edit 3D objects on the scene.",
        tool: {
            title: "Add 3D object",
            tooltip: "Add a 3D object to the map"
        },
        ui: {
            windowTitle: "Add 3D object",
            placeholder: "No placed objects yet.",
            clickMapInstruction: "Click on the map to place the selected object.",
            cancelPlacement: "Cancel"
        },
        steps: {
            "1": {
                label: "Choose object",
                info: "Add prefabricated or own 3D objects temporarily."
            },
            "2": {
                label: "Align",
                info: "Position the 3D object using the input fields or on the map."
            },
            "3": {
                label: "Planning area",
                info: "Use the planning area to hide the 3D mesh selectively."
            }
        },
        step1: {
            tabPreset: "Prefabricated objects",
            tabCustom: "Custom file",
            glbUnitInfo: "By default, one unit in the .glb file is rendered as one meter. Please consider this when creating and uploading the file.",
            dropTitle: "Drop GLB file here",
            dropSubtitle: "or click to choose",
            removeUpload: "Remove file",
            formatBadge: ".glb format",
            maxSizeBadge: "Max. {maxSize} MB",
            urlAlternative: "Alternatively specify the URL",
            urlLabel: "URL to the .glb file",
            urlPlaceholder: "https://",
            titleLabel: "Object title (optional)"
        },
        step2: {
            positionHeading: "Position",
            easting: "Easting",
            northing: "Northing",
            longitude: "Longitude",
            latitude: "Latitude",
            elevation: "Height a.s.l.",
            heading: "Heading",
            sizeHeading: "Size",
            proportional: "preserve aspect ratio",
            height: "Height",
            width: "Width",
            depth: "Depth",
            distortionWarning: "Individual changes to single dimensions may cause distortions of the 3D model.",
            scaleHeading: "Scale"
        },
        step3: {
            instruction: "Please choose the planning area on the map around the 3D object. You can adjust extent, height and orientation. The 3D mesh is hidden inside the chosen planning area.",
            heightLabel: "Planning area height"
        },
        buttons: {
            align: "align",
            planningArea: "planning area",
            back: "back",
            reset: "reset",
            save: "save 3D object"
        },
        final: {
            success: "The 3D object has been saved successfully!",
            next: "What would you like to do next?",
            newObject: "new object",
            close: "close",
            editLast: "edit again",
            showList: "show all 3D objects"
        },
        list: {
            heading: "Placed 3D objects",
            newItem: "new",
            edit: "edit",
            remove: "remove"
        },
        presets: {
            windTurbine: "Wind turbine",
            transmissionTower18: "Transmission tower (18 m)",
            transmissionTower45: "Transmission tower (45 m)",
            transmissionTower65: "Transmission tower (65 m)",
            birchTree: "Birch tree",
            pine: "Pine",
            cube: "Cube"
        },
        groupLayer: {
            title: "Added 3D objects"
        },
        action: {
            delete: "Delete 3D object",
            edit: "Edit 3D object",
            zoom: "Zoom to 3D object"
        },
        popup: {
            height: "Height (m)",
            width: "Width (m)",
            depth: "Depth (m)",
            placedAt: "Placed at",
            easting: "Easting",
            northing: "Northing",
            longitude: "Longitude",
            latitude: "Latitude",
            elevation: "Height above sea level (m)"
        }
    },
    de: true
};

export type I18NKeys = (typeof i18n)["root"];
export default i18n;
