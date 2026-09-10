import type {
  MapLayerSpec,
  MapPoint,
  MapSpec,
} from "./types";

export type MapView = {
  centerLatitude: number;
  centerLongitude: number;
  zoom: number;
  overviewZoom: number;
};

export type MapTile = {
  key: string;
  url: string;
  left: number;
  top: number;
  size: number;
  x: number;
  y: number;
  z: number;
};

const TILE_SIZE = 256;
const MAX_LAT = 85.05112878;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function lonLatToWorld(
  longitude: number,
  latitude: number,
  zoom: number
) {
  const z = Math.pow(2, zoom);
  const x = ((longitude + 180) / 360) * z * TILE_SIZE;
  const safeLat = clamp(latitude, -MAX_LAT, MAX_LAT);
  const sin = Math.sin((safeLat * Math.PI) / 180);
  const y =
    (0.5 -
      Math.log((1 + sin) / (1 - sin)) /
        (4 * Math.PI)) *
    z *
    TILE_SIZE;

  return { x, y };
}

export function worldToLonLat(
  x: number,
  y: number,
  zoom: number
) {
  const z = Math.pow(2, zoom) * TILE_SIZE;
  const longitude = (x / z) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / z;
  const latitude =
    (180 / Math.PI) *
    Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

  return { longitude, latitude };
}

function boundsFromPoints(points: MapPoint[]) {
  if (!points.length) {
    return {
      minLat: -35,
      maxLat: 37,
      minLon: -18,
      maxLon: 52,
    };
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);

  return {
    minLat: Math.min(...latitudes),
    maxLat: Math.max(...latitudes),
    minLon: Math.min(...longitudes),
    maxLon: Math.max(...longitudes),
  };
}

export function fitMapView(
  map: MapSpec,
  width: number,
  height: number
): MapView {
  if (
    map.camera?.centerLatitude !== undefined &&
    map.camera?.centerLongitude !== undefined &&
    map.camera?.zoom !== undefined
  ) {
    return {
      centerLatitude: map.camera.centerLatitude,
      centerLongitude: map.camera.centerLongitude,
      zoom: map.camera.zoom,
      overviewZoom:
        map.camera.overviewZoom ??
        Math.max(2, map.camera.zoom - 2),
    };
  }

  const bounds = boundsFromPoints(map.points);
  const centerLatitude =
    (bounds.minLat + bounds.maxLat) / 2;
  const centerLongitude =
    (bounds.minLon + bounds.maxLon) / 2;

  /*
   * Find the highest integer zoom that keeps all evidence points in frame.
   * This is deterministic and works in Remotion without a browser map SDK.
   */
  let zoom = map.focus === "world" ? 2 : map.focus === "africa" ? 4 : 12;

  for (let candidate = 14; candidate >= 2; candidate -= 1) {
    const nw = lonLatToWorld(
      bounds.minLon,
      bounds.maxLat,
      candidate
    );
    const se = lonLatToWorld(
      bounds.maxLon,
      bounds.minLat,
      candidate
    );

    const spanX = Math.abs(se.x - nw.x);
    const spanY = Math.abs(se.y - nw.y);

    if (
      spanX <= width * 0.68 &&
      spanY <= height * 0.68
    ) {
      zoom = candidate;
      break;
    }
  }

  /*
   * Point-only datasets with very tight extents need a little context.
   * Nairobi station maps therefore sit around city scale rather than
   * zooming down to a single street.
   */
  if (map.points.length <= 4) {
    zoom = Math.min(zoom, 11);
  }

  return {
    centerLatitude,
    centerLongitude,
    zoom,
    overviewZoom: Math.max(2, zoom - 2),
  };
}

function wrapTileX(x: number, z: number) {
  const count = Math.pow(2, z);
  return ((x % count) + count) % count;
}

export function buildOpenStreetMapTiles(
  view: MapView,
  width: number,
  height: number,
  overscan = 1
): MapTile[] {
  const z = Math.round(view.zoom);
  const center = lonLatToWorld(
    view.centerLongitude,
    view.centerLatitude,
    z
  );

  const leftWorld = center.x - width / 2;
  const topWorld = center.y - height / 2;

  const startX =
    Math.floor(leftWorld / TILE_SIZE) - overscan;
  const endX =
    Math.floor((leftWorld + width) / TILE_SIZE) + overscan;
  const startY =
    Math.floor(topWorld / TILE_SIZE) - overscan;
  const endY =
    Math.floor((topWorld + height) / TILE_SIZE) + overscan;

  const tileCount = Math.pow(2, z);
  const result: MapTile[] = [];

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      if (y < 0 || y >= tileCount) continue;

      const wrappedX = wrapTileX(x, z);

      result.push({
        key: `${z}/${wrappedX}/${y}`,
        url: `https://tile.openstreetmap.org/${z}/${wrappedX}/${y}.png`,
        left: x * TILE_SIZE - leftWorld,
        top: y * TILE_SIZE - topWorld,
        size: TILE_SIZE,
        x: wrappedX,
        y,
        z,
      });
    }
  }

  return result;
}

export function projectMapPoint(
  point: {
    latitude: number;
    longitude: number;
  },
  view: MapView,
  width: number,
  height: number
) {
  const zoom = Math.round(view.zoom);
  const center = lonLatToWorld(
    view.centerLongitude,
    view.centerLatitude,
    zoom
  );
  const target = lonLatToWorld(
    point.longitude,
    point.latitude,
    zoom
  );

  return {
    x: width / 2 + target.x - center.x,
    y: height / 2 + target.y - center.y,
  };
}

export function layerCoordinates(
  layer: MapLayerSpec
): Array<Array<[number, number]>> {
  if (layer.kind === "line") {
    return [layer.coordinates];
  }

  if (layer.kind === "polygon") {
    return layer.coordinates;
  }

  return [];
}

export function layerPath(
  layer: MapLayerSpec,
  view: MapView,
  width: number,
  height: number
) {
  if (layer.kind === "point") return "";

  const rings = layerCoordinates(layer);

  return rings
    .map((ring) => {
      const commands = ring.map(
        ([longitude, latitude], index) => {
          const p = projectMapPoint(
            { latitude, longitude },
            view,
            width,
            height
          );
          return `${index ? "L" : "M"} ${p.x.toFixed(
            1
          )} ${p.y.toFixed(1)}`;
        }
      );

      if (layer.kind === "polygon") {
        commands.push("Z");
      }

      return commands.join(" ");
    })
    .join(" ");
}

export function enrichMapSpec(map: MapSpec): MapSpec {
  return {
    ...map,
    basemap: map.basemap ?? "openstreetmap",
    attribution:
      map.attribution ??
      "© OpenStreetMap contributors",
  };
}
