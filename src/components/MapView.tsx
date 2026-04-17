import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  GeoJSON as GeoJSONLayer,
  useMap,
} from "react-leaflet";
import { Fuel, UtensilsCrossed, TreePalm } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LngLat, Poi, PoiCategory, RouteResult } from "@/lib/navigation";
import { MAP_STYLES } from "@/lib/mapStyles";
import type { MapStyleId } from "@/lib/storage";

interface MapViewProps {
  userPos: LngLat | null;
  origin: LngLat | null;
  destination: LngLat | null;
  stops: LngLat[];
  routes: RouteResult[]; // index 0 = active, rest = alternatives
  activeRouteIdx: number;
  onSelectRoute: (idx: number) => void;
  pois: Poi[];
  corridor: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null;
  focusBounds: L.LatLngBoundsExpression | null;
  mapStyle: MapStyleId;
}

// Divs as Leaflet icons
const userIcon = L.divIcon({
  className: "",
  html: `<div class="user-marker"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const endpointIcon = (kind: "start" | "end" | "stop") =>
  L.divIcon({
    className: "",
    html: `<div class="endpoint-marker ${kind}"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });

const POI_ICON_MAP = {
  gas: { Icon: Fuel, cls: "poi-gas" },
  food: { Icon: UtensilsCrossed, cls: "poi-food" },
  rest: { Icon: TreePalm, cls: "poi-rest" },
} as const;

function poiDivIcon(cat: PoiCategory) {
  const { Icon, cls } = POI_ICON_MAP[cat];
  const svg = renderToStaticMarkup(<Icon size={16} strokeWidth={2.4} />);
  return L.divIcon({
    className: "",
    html: `<div class="poi-marker ${cls}">${svg}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14, animate: true });
  }, [bounds, map]);
  return null;
}

function CenterOn({ pos, zoom = 14 }: { pos: LngLat | null; zoom?: number }) {
  const map = useMap();
  const did = useRef(false);
  useEffect(() => {
    if (!pos || did.current) return;
    map.flyTo([pos[1], pos[0]], zoom, { duration: 1.1 });
    did.current = true;
  }, [pos, zoom, map]);
  return null;
}

export function MapView({
  userPos,
  origin,
  destination,
  stops,
  routes,
  activeRouteIdx,
  onSelectRoute,
  pois,
  corridor,
  focusBounds,
}: MapViewProps) {
  const center: [number, number] = userPos ? [userPos[1], userPos[0]] : [40.758, -73.9855];

  const routesLatLngs = useMemo(
    () =>
      routes.map(
        (r) => r.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]),
      ),
    [routes],
  );

  const poiIcons = useMemo(
    () => ({ gas: poiDivIcon("gas"), food: poiDivIcon("food"), rest: poiDivIcon("rest") }),
    [],
  );

  return (
    <MapContainer
      center={center}
      zoom={13}
      zoomControl={true}
      className="absolute inset-0 z-0 h-full w-full"
      worldCopyJump
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />

      <CenterOn pos={userPos} />
      <FitBounds bounds={focusBounds} />

      {corridor && (
        <GeoJSONLayer
          key={JSON.stringify(corridor.geometry).slice(0, 32) + pois.length}
          data={corridor}
          style={{
            color: "hsl(268 90% 65%)",
            weight: 1,
            opacity: 0.6,
            fillColor: "hsl(268 90% 65%)",
            fillOpacity: 0.08,
            dashArray: "4 6",
          }}
        />
      )}

      {routesLatLngs.map((positions, idx) => {
        if (idx === activeRouteIdx) return null;
        return (
          <Polyline
            key={`alt-${idx}`}
            positions={positions}
            eventHandlers={{ click: () => onSelectRoute(idx) }}
            pathOptions={{
              color: "hsl(220 15% 55%)",
              weight: 7,
              opacity: 0.55,
              lineCap: "round",
              dashArray: "1 8",
            }}
          />
        );
      })}

      {routesLatLngs[activeRouteIdx] && (
        <>
          <Polyline
            positions={routesLatLngs[activeRouteIdx]}
            pathOptions={{
              color: "hsl(268 90% 65%)",
              weight: 12,
              opacity: 0.25,
              lineCap: "round",
            }}
          />
          <Polyline
            positions={routesLatLngs[activeRouteIdx]}
            pathOptions={{
              color: "hsl(210 100% 60%)",
              weight: 5,
              opacity: 0.95,
              lineCap: "round",
              className: "route-glow",
            }}
          />
        </>
      )}

      {userPos && <Marker position={[userPos[1], userPos[0]]} icon={userIcon} />}
      {origin && origin !== userPos && (
        <Marker position={[origin[1], origin[0]]} icon={endpointIcon("start")} />
      )}
      {stops.map((s, i) => (
        <Marker key={`stop-${i}-${s.join(",")}`} position={[s[1], s[0]]} icon={endpointIcon("stop")} />
      ))}
      {destination && (
        <Marker position={[destination[1], destination[0]]} icon={endpointIcon("end")} />
      )}

      {pois.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lon]} icon={poiIcons[p.category]} />
      ))}
    </MapContainer>
  );
}
