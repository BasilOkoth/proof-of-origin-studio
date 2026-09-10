import type {
  MapLayerSpec,
  MapPoint,
  MapSpec,
} from "./types";

type Position = [number, number];

type GeoJsonGeometry =
  | { type: "Point"; coordinates: Position }
  | { type: "MultiPoint"; coordinates: Position[] }
  | { type: "LineString"; coordinates: Position[] }
  | { type: "MultiLineString"; coordinates: Position[][] }
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

type GeoJsonFeature = {
  type: "Feature";
  properties?: Record<string, unknown>;
  geometry?: GeoJsonGeometry | null;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

function asFeatureCollection(
  input: unknown
): GeoJsonFeatureCollection {
  if (
    !input ||
    typeof input !== "object" ||
    (input as any).type !== "FeatureCollection" ||
    !Array.isArray((input as any).features)
  ) {
    throw new Error(
      "GeoJSON must be a FeatureCollection."
    );
  }

  return input as GeoJsonFeatureCollection;
}

function propertyLabel(
  properties?: Record<string, unknown>,
  fallback = "Map feature"
) {
  if (!properties) return fallback;

  for (const key of [
    "name",
    "Name",
    "NAME",
    "label",
    "station",
    "site",
    "ward",
    "river",
    "road",
  ]) {
    const value = properties[key];
    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return fallback;
}

function numericProperty(
  properties?: Record<string, unknown>
) {
  if (!properties) return undefined;

  for (const key of [
    "value",
    "rainfall_mm",
    "rainfall",
    "total",
    "count",
    "rate",
    "percentage",
  ]) {
    const value = properties[key];
    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return value;
    }

    if (
      typeof value === "string" &&
      /^[-+]?\d*\.?\d+$/.test(value.trim())
    ) {
      return Number(value);
    }
  }

  return undefined;
}

export function analyzeGeoJson(
  text: string,
  name = "Uploaded GeoJSON"
): MapSpec {
  const parsed = asFeatureCollection(
    JSON.parse(text)
  );

  const points: MapPoint[] = [];
  const layers: MapLayerSpec[] = [];

  parsed.features.forEach((feature, index) => {
    const geometry = feature.geometry;
    if (!geometry) return;

    const label = propertyLabel(
      feature.properties,
      `Feature ${index + 1}`
    );
    const sourceLabel = name;

    if (geometry.type === "Point") {
      const [longitude, latitude] =
        geometry.coordinates;
      points.push({
        label,
        latitude,
        longitude,
        value: numericProperty(feature.properties),
      });
      return;
    }

    if (geometry.type === "MultiPoint") {
      geometry.coordinates.forEach(
        ([longitude, latitude], pointIndex) => {
          points.push({
            label: `${label} ${pointIndex + 1}`,
            latitude,
            longitude,
            value: numericProperty(
              feature.properties
            ),
          });
        }
      );
      return;
    }

    if (geometry.type === "LineString") {
      layers.push({
        id: `${name}-line-${index}`,
        kind: "line",
        label,
        coordinates: geometry.coordinates,
        value: numericProperty(feature.properties),
        sourceLabel,
      });
      return;
    }

    if (geometry.type === "MultiLineString") {
      geometry.coordinates.forEach(
        (coordinates, lineIndex) => {
          layers.push({
            id: `${name}-line-${index}-${lineIndex}`,
            kind: "line",
            label,
            coordinates,
            value: numericProperty(feature.properties),
            sourceLabel,
          });
        }
      );
      return;
    }

    if (geometry.type === "Polygon") {
      layers.push({
        id: `${name}-polygon-${index}`,
        kind: "polygon",
        label,
        coordinates: geometry.coordinates,
        value: numericProperty(feature.properties),
        sourceLabel,
      });
      return;
    }

    if (geometry.type === "MultiPolygon") {
      geometry.coordinates.forEach(
        (coordinates, polygonIndex) => {
          layers.push({
            id: `${name}-polygon-${index}-${polygonIndex}`,
            kind: "polygon",
            label,
            coordinates,
            value: numericProperty(feature.properties),
            sourceLabel,
          });
        }
      );
    }
  });

  if (!points.length && !layers.length) {
    throw new Error(
      "The GeoJSON contains no supported point, line or polygon features."
    );
  }

  // Use line/polygon vertices as invisible framing points when no explicit
  // point feature exists, so the camera still fits the real geography.
  if (!points.length) {
    for (const layer of layers) {
      if (layer.kind === "line") {
        layer.coordinates.forEach(
          ([longitude, latitude], i) => {
            if (i % Math.max(1, Math.floor(layer.coordinates.length / 12)) === 0) {
              points.push({
                label: layer.label || "Map feature",
                latitude,
                longitude,
              });
            }
          }
        );
      }

      if (layer.kind === "polygon") {
        layer.coordinates[0]?.forEach(
          ([longitude, latitude], i, ring) => {
            if (i % Math.max(1, Math.floor(ring.length / 12)) === 0) {
              points.push({
                label: layer.label || "Map feature",
                latitude,
                longitude,
              });
            }
          }
        );
      }
    }
  }

  return {
    title: `Geographic evidence in ${name}`,
    subtitle: `${parsed.features.length} GeoJSON feature${
      parsed.features.length === 1 ? "" : "s"
    }`,
    points,
    layers,
    sourceLabel: name,
    focus: "custom",
    basemap: "openstreetmap",
    attribution: "© OpenStreetMap contributors",
  };
}
