[![devnet-bundle-snapshot](https://github.com/conterra/mapapps-3d-object-loader/actions/workflows/devnet-bundle-snapshot.yml/badge.svg)](https://github.com/conterra/mapapps-3d-object-loader/actions/workflows/devnet-bundle-snapshot.yml)
![Static Badge](https://img.shields.io/badge/requires_map.apps-4.20.0-e5e5e5?labelColor=%233E464F&logoColor=%23e5e5e5)
![Static Badge](https://img.shields.io/badge/tested_for_map.apps-4.20.3-%20?labelColor=%233E464F&color=%232FC050)

# 3D Object Loader

The 3D Object Loader bundle lets the user place 3D models (glTF) in a 3D scene, either prefabricated objects or
own `.glb` files, and hide an integrated mesh around them.

![Screenshot App](https://github.com/conterra/mapapps-3d-object-loader/blob/main/screenshot.png)

## Sample App

The sample app shows a 3D scene of Cologne with data of Geobasis NRW
([Datenlizenz Deutschland – Zero – Version 2.0](https://www.govdata.de/dl-de/zero-2-0)).

## Installation Guide

**Requirements:**
- map.apps 4.20.0 or later
- 3D view

Simply add the bundle "dn_3dobjectloader" to your app.

[dn_3dobjectloader Documentation](https://github.com/conterra/mapapps-3d-object-loader/tree/main/src/main/js/bundles/dn_3dobjectloader)

## Quick start

Clone this project and ensure that you have all required dependencies installed correctly (see [Documentation](https://docs.conterra.de/en/mapapps/latest/developersguide/getting-started/set-up-development-environment.html)).

Then run the following commands from the project root directory to start a local development server:

```bash
# install all required node modules
$ mvn initialize

# start dev server
$ mvn compile -Denv=dev -Pinclude-mapapps-deps

# run unit tests
$ mvn test -P run-js-tests,include-mapapps-deps
```
