// Tile providers for the map. All free / no-key required.
import type { MapStyleId } from "./storage";

export interface MapStyle {
  id: MapStyleId;
  label: string;
  url: string;
  attribution: string;
  subdomains?: string;
  maxZoom: number;
  /** Optional second layer drawn on top (e.g. labels over satellite imagery) */
  overlayUrl?: string;
}

export const MAP_STYLES: Record<MapStyleId, MapStyle> = {
  dark: {
    id: "dark",
    label: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: "abcd",
    maxZoom: 20,
  },
  light: {
    id: "light",
    label: "Light",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: "abcd",
    maxZoom: 20,
  },
  streets: {
    id: "streets",
    label: "Streets",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; OpenStreetMap contributors',
    subdomains: "abc",
    maxZoom: 19,
  },
  satellite: {
    id: "satellite",
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
    overlayUrl:
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
  },
  terrain: {
    id: "terrain",
    label: "Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; OpenStreetMap, SRTM &copy; OpenTopoMap (CC-BY-SA)',
    subdomains: "abc",
    maxZoom: 17,
  },
};

export const MAP_STYLE_LIST = Object.values(MAP_STYLES);
