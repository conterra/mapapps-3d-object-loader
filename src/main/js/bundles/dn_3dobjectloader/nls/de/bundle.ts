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

import type { I18NKeys } from "../bundle";

export default {
    bundleName: "3D-Objekte",
    bundleDescription: "Platzieren, skalieren und bearbeiten von 3D-Objekten in der Szene.",
    tool: {
        title: "3D Objekte hinzufügen",
        tooltip: "3D Objekte hinzufügen"
    },
    ui: {
        windowTitle: "3D Objekte hinzufügen",
        placeholder: "Noch keine Objekte platziert.",
        clickMapInstruction: "Klicken Sie in die Karte, um das ausgewählte Objekt zu platzieren.",
        cancelPlacement: "Abbrechen"
    },
    steps: {
        "1": {
            label: "Objekt wählen",
            info: "Fügen Sie vorgefertigte oder eigene 3D-Objekte temporär ein."
        },
        "2": {
            label: "align",
            info: "Positionieren Sie das 3D-Objekt über die Eingabefelder oder in der Karte."
        },
        "3": {
            label: "Planungsbereich",
            info: "Blenden Sie über den Planungsbereich das 3D-Mesh gezielt aus."
        }
    },
    step1: {
        tabPreset: "Vorgefertigte Objekte",
        tabCustom: "Eigene Datei",
        glbUnitInfo: "Standardmäßig wird eine Einheit in der glb-Datei als ein Meter dargestellt. Beachten Sie dies beim Erstellen und Hochladen der Datei.",
        dropTitle: "GLB-Datei hier ablegen",
        dropSubtitle: "oder klicken zum Auswählen",
        formatBadge: ".glb Format",
        maxSizeBadge: "Max. {maxSize} MB",
        urlAlternative: "Alternativ die URL angeben",
        urlLabel: "URL zur .glb Datei",
        urlPlaceholder: "https://",
        titleLabel: "Objekttitel (optional)"
    },
    step2: {
        positionHeading: "Position",
        easting: "Rechtswert",
        northing: "Hochwert",
        longitude: "Länge",
        latitude: "Breite",
        elevation: "Höhe über NN",
        heading: "Ausrichtung",
        sizeHeading: "Größe",
        proportional: "maßstabsgetreu",
        height: "Höhe",
        width: "Breite",
        depth: "Tiefe",
        distortionWarning: "Individuelle Änderungen einzelner Dimensionen können zu Verzerrungen des 3D-Modells führen.",
        scaleHeading: "Skalierung"
    },
    step3: {
        instruction: "Bitte wählen Sie in der Karte den Planungsbereich um das 3D-Objekt aus. Sie können die Ausdehnung, Höhe und Ausrichtung anpassen. Im ausgewählten Planungsbereich wird das 3D-Mesh ausgeblendet.",
        heightLabel: "Höhe des Planungsbereichs"
    },
    buttons: {
        align: "align",
        planningArea: "Planungsbereich",
        back: "zurück",
        reset: "zurücksetzen",
        save: "3D-Objekt speichern"
    },
    final: {
        success: "Das 3D-Objekt wurde erfolgreich gespeichert!",
        next: "Was möchten Sie als nächstes tun?",
        newObject: "neues Objekt erstellen",
        close: "beenden",
        editLast: "erneut bearbeiten",
        showList: "alle 3D-Objekte anzeigen"
    },
    list: {
        heading: "Platzierte 3D-Objekte",
        newItem: "neu",
        edit: "bearbeiten",
        remove: "löschen"
    },
    presets: {
        windTurbine: "Windenergieanlage",
        transmissionTower18: "Freileitungsmast (18 m)",
        transmissionTower45: "Freileitungsmast (45 m)",
        transmissionTower65: "Freileitungsmast (65 m)",
        birchTree: "Birke",
        pine: "Kiefer",
        cube: "Würfel"
    },
    groupLayer: {
        title: "hinzugefügte 3D Objekte"
    },
    action: {
        delete: "Löschen",
        edit: "Bearbeiten",
        zoom: "Zoomen auf"
    },
    popup: {
        height: "Höhe (m)",
        width: "Breite (m)",
        depth: "Tiefe (m)",
        placedAt: "Platziert am",
        easting: "Rechtswert",
        northing: "Hochwert",
        longitude: "Länge",
        latitude: "Breite",
        elevation: "Höhe über NN (m)"
    }
} satisfies I18NKeys;
