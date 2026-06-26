// Module declarations for packages without TypeScript types

declare module "react-simple-maps" {
  import * as React from "react";

  export interface GeoProperties {
    name: string;
    [key: string]: unknown;
  }

  export interface GeoFeature {
    rsmKey: string;
    id?: string;
    properties: GeoProperties;
    [key: string]: unknown;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const ComposableMap: React.FC<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const ZoomableGroup: React.FC<any>;
  export const Geographies: React.FC<{
    geography: string;
    children: (props: { geographies: GeoFeature[] }) => React.ReactNode;
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Geography: React.FC<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Marker: React.FC<any>;
}
