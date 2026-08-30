// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

// Minimal ambient types for esri-leaflet 3.x (ships no types, no @types package).
// Only the surface we use — dynamicMapLayer for the KGIS cadastral overlay.
declare module "esri-leaflet" {
  import type * as L from "leaflet";

  export interface DynamicMapLayerOptions {
    url: string;
    layers?: number[];
    opacity?: number;
    f?: "json" | "image";
    attribution?: string;
    [key: string]: unknown;
  }

  export function dynamicMapLayer(options: DynamicMapLayerOptions): L.Layer;
}
