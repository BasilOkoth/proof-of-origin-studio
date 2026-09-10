import type {
  ChartDatum,
  ChartSpec,
  DatasetAnalysis,
  MapPoint,
  MapSpec,
} from "./types";

type CsvRow = Record<string, string>;

type ColumnRoles = {
  numericColumns: string[];
  dateColumns: string[];
  latitudeColumn?: string;
  longitudeColumn?: string;
  measureColumns: string[];
  categoryColumns: string[];
};

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];

    if (ch === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      row.push(field);
      field = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((value) => clean(value))) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }

  row.push(field);
  if (row.some((value) => clean(value))) rows.push(row);
  return rows;
}

function asNumber(value: string): number | undefined {
  const cleaned = value
    .replace(/[,%]/g, "")
    .replace(/(?:KES|USD|EUR|GBP|KSH|KSh|\$|€|£)/gi, "")
    .trim();

  if (!cleaned || !/^[-+]?\d*\.?\d+(?:e[-+]?\d+)?$/i.test(cleaned)) {
    return undefined;
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function asYear(value: string): number | undefined {
  const match = value.match(/\b(19\d{2}|20\d{2}|21\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

function asTimeIndex(value: string, fallbackIndex: number): number {
  const trimmed = clean(value);
  const year = asYear(trimmed);

  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) return parsed;

  if (year !== undefined) return Date.UTC(year, 0, 1);

  const monthNames = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];
  const normalized = trimmed.toLowerCase().slice(0, 3);
  const monthIndex = monthNames.indexOf(normalized);
  if (monthIndex >= 0) return Date.UTC(2000, monthIndex, 1);

  return fallbackIndex;
}

function headerMatch(columns: string[], patterns: RegExp[]) {
  return columns.find((column) =>
    patterns.some((pattern) => pattern.test(clean(column)))
  );
}

function toObjects(rows: string[][]): { columns: string[]; rows: CsvRow[] } {
  if (!rows.length) return { columns: [], rows: [] };

  const columns = rows[0].map(
    (value, index) => clean(value) || `Column ${index + 1}`
  );

  const objects = rows.slice(1).map((values) => {
    const result: CsvRow = {};

    columns.forEach((column, index) => {
      result[column] = clean(values[index] ?? "");
    });

    return result;
  });

  return { columns, rows: objects };
}

function numericRatio(rows: CsvRow[], column: string) {
  const populated = rows.map((row) => row[column]).filter(Boolean);
  if (!populated.length) return 0;

  return (
    populated.filter((value) => asNumber(value) !== undefined).length /
    populated.length
  );
}

function yearRatio(rows: CsvRow[], column: string) {
  const populated = rows.map((row) => row[column]).filter(Boolean);
  if (!populated.length) return 0;

  return (
    populated.filter((value) => asYear(value) !== undefined).length /
    populated.length
  );
}

function isCoordinateHeader(column: string) {
  return /^(lat|latitude|lon|lng|long|longitude)$/i.test(clean(column));
}

function isTimeHeader(column: string) {
  return /\b(date|year|month|quarter|week|day|time|period|season)\b/i.test(
    clean(column)
  );
}

function isIdentifierHeader(column: string) {
  return /^(id|code|index|row|record|fid|objectid)$/i.test(clean(column));
}

function measureHeaderScore(column: string) {
  const value = clean(column).toLowerCase();
  let score = 0;

  if (
    /\b(rainfall|precipitation|rain_mm|rainfall_mm|precip_mm|rain amount|rainfall amount)\b/i.test(
      value
    )
  ) {
    score += 120;
  }

  if (/\b(mm|millimet(?:er|re)s?)\b/i.test(value)) score += 50;
  if (/\b(total|amount|value|count|rate|ratio|percent|percentage|share|index)\b/i.test(value)) {
    score += 35;
  }
  if (/\b(temperature|flow|discharge|depth|height|level|volume|area|population|loss|damage)\b/i.test(value)) {
    score += 30;
  }

  if (isCoordinateHeader(value)) score -= 1000;
  if (isTimeHeader(value)) score -= 500;
  if (isIdentifierHeader(value)) score -= 400;

  return score;
}

function categoryHeaderScore(column: string) {
  const value = clean(column).toLowerCase();
  let score = 0;

  if (/\b(station|site|location|place|ward|neighbou?rhood|subcounty|county|city|basin|river|catchment|name)\b/i.test(value)) {
    score += 90;
  }
  if (/\b(category|type|class|group|zone)\b/i.test(value)) score += 45;

  if (isCoordinateHeader(value)) score -= 1000;
  if (isTimeHeader(value)) score -= 500;
  if (isIdentifierHeader(value)) score -= 300;

  return score;
}

function classifyColumns(
  columns: string[],
  rows: CsvRow[]
): ColumnRoles {
  const numericColumns = columns.filter(
    (column) => numericRatio(rows, column) >= 0.7
  );

  const latitudeColumn = headerMatch(columns, [
    /^lat$/i,
    /^latitude$/i,
  ]);

  const longitudeColumn = headerMatch(columns, [
    /^lon$/i,
    /^lng$/i,
    /^long$/i,
    /^longitude$/i,
  ]);

  const dateColumns = columns.filter(
    (column) =>
      isTimeHeader(column) ||
      (!isCoordinateHeader(column) && yearRatio(rows, column) >= 0.7)
  );

  const measureColumns = numericColumns
    .filter(
      (column) =>
        column !== latitudeColumn &&
        column !== longitudeColumn &&
        !dateColumns.includes(column) &&
        !isIdentifierHeader(column)
    )
    .sort(
      (a, b) =>
        measureHeaderScore(b) - measureHeaderScore(a) ||
        columns.indexOf(a) - columns.indexOf(b)
    );

  const categoryColumns = columns
    .filter(
      (column) =>
        !numericColumns.includes(column) &&
        !dateColumns.includes(column) &&
        column !== latitudeColumn &&
        column !== longitudeColumn &&
        !isIdentifierHeader(column)
    )
    .sort(
      (a, b) =>
        categoryHeaderScore(b) - categoryHeaderScore(a) ||
        columns.indexOf(a) - columns.indexOf(b)
    );

  return {
    numericColumns,
    dateColumns,
    latitudeColumn,
    longitudeColumn,
    measureColumns,
    categoryColumns,
  };
}

function trimData(data: ChartDatum[], limit = 14) {
  if (data.length <= limit) return data;

  return [...data]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, limit);
}

function chartFromRows(
  name: string,
  rows: CsvRow[],
  roles: ColumnRoles
): ChartSpec | undefined {
  const dateColumn = roles.dateColumns[0];
  const measure = roles.measureColumns[0];

  /*
   * Important semantic rule:
   * latitude and longitude are geographic coordinates, never default chart
   * measures. This prevents nonsense such as "latitude increased over time".
   */
  if (dateColumn && measure) {
    const data: ChartDatum[] = rows
      .flatMap((row, index) => {
        const value = asNumber(row[measure]);
        const label = clean(row[dateColumn]);

        if (value === undefined || !label) return [];

        return [
          {
            label,
            value,
            x: asTimeIndex(label, index),
          },
        ];
      })
      .sort((a, b) => Number(a.x) - Number(b.x));

    if (data.length >= 2) {
      return {
        type: "line",
        title: `${measure} over time`,
        subtitle: name,
        xLabel: dateColumn,
        yLabel: measure,
        data: data.slice(0, 30),
        sourceLabel: name,
      };
    }
  }

  const category = roles.categoryColumns[0];

  if (category && measure) {
    const data: ChartDatum[] = rows.flatMap((row) => {
      const value = asNumber(row[measure]);
      const label = clean(row[category]);

      if (value === undefined || !label) return [];
      return [{ label, value }];
    });

    if (data.length >= 2) {
      const sorted = [...data].sort((a, b) => b.value - a.value);

      return {
        type: data.length > 8 ? "ranking" : "bar",
        title: `${measure} by ${category}`,
        subtitle: name,
        xLabel: category,
        yLabel: measure,
        data: trimData(sorted),
        sourceLabel: name,
      };
    }
  }

  /*
   * Scatter plots are only created from genuine measure columns. Coordinates,
   * dates and identifiers are excluded from this fallback too.
   */
  if (roles.measureColumns.length >= 2) {
    const [xColumn, yColumn] = roles.measureColumns;
    const data: ChartDatum[] = rows.flatMap((row, index) => {
      const x = asNumber(row[xColumn]);
      const value = asNumber(row[yColumn]);

      if (x === undefined || value === undefined) return [];

      return [
        {
          label: clean(row[category ?? ""]) || String(index + 1),
          x,
          value,
        },
      ];
    });

    if (data.length >= 3) {
      return {
        type: "scatter",
        title: `${yColumn} vs ${xColumn}`,
        subtitle: name,
        xLabel: xColumn,
        yLabel: yColumn,
        data: trimData(data, 40),
        sourceLabel: name,
      };
    }
  }

  return undefined;
}

function mapFromRows(
  name: string,
  columns: string[],
  rows: CsvRow[],
  roles: ColumnRoles
): MapSpec | undefined {
  const { latitudeColumn, longitudeColumn } = roles;

  if (!latitudeColumn || !longitudeColumn) return undefined;

  const labelColumn =
    roles.categoryColumns[0] ??
    headerMatch(columns, [
      /name/i,
      /site/i,
      /location/i,
      /station/i,
      /city/i,
      /country/i,
    ]) ??
    columns.find(
      (column) =>
        column !== latitudeColumn &&
        column !== longitudeColumn &&
        !roles.measureColumns.includes(column) &&
        !roles.dateColumns.includes(column)
    );

  const valueColumn = roles.measureColumns[0];

  const points: MapPoint[] = rows
    .flatMap((row, index) => {
      const latitude = asNumber(row[latitudeColumn]);
      const longitude = asNumber(row[longitudeColumn]);

      if (
        latitude === undefined ||
        longitude === undefined ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return [];
      }

      const point: MapPoint = {
        label: clean(row[labelColumn ?? ""]) || `Point ${index + 1}`,
        latitude,
        longitude,
      };

      const value = valueColumn
        ? asNumber(row[valueColumn])
        : undefined;

      if (value !== undefined) point.value = value;

      return [point];
    })
    .slice(0, 40);

  if (!points.length) return undefined;

  const africaCount = points.filter(
    (point) =>
      point.latitude >= -38 &&
      point.latitude <= 38 &&
      point.longitude >= -20 &&
      point.longitude <= 55
  ).length;

  return {
    title: `Geographic pattern in ${name}`,
    subtitle: valueColumn
      ? `Points sized by ${valueColumn}`
      : `${points.length} mapped observations`,
    points,
    sourceLabel: name,
    focus: africaCount / points.length >= 0.7 ? "africa" : "world",
  };
}

function describeInsight(chart?: ChartSpec, map?: MapSpec) {
  if (chart?.type === "line" && chart.data.length >= 2) {
    const first = chart.data[0];
    const last = chart.data[chart.data.length - 1];

    const direction =
      last.value > first.value
        ? "increased"
        : last.value < first.value
          ? "decreased"
          : "was broadly unchanged";

    return `${chart.yLabel || "The measured value"} ${direction} from ${
      first.value
    } in ${first.label} to ${last.value} in ${last.label}.`;
  }

  if (
    (chart?.type === "bar" || chart?.type === "ranking") &&
    chart.data.length
  ) {
    const top = [...chart.data].sort(
      (a, b) => b.value - a.value
    )[0];

    return `${top.label} has the highest plotted ${
      chart.yLabel || "value"
    } at ${top.value}.`;
  }

  if (map?.points.length) {
    return `The dataset contains ${map.points.length} geocoded observations that can be explained spatially rather than as a table.`;
  }

  return undefined;
}

export function analyzeCsv(
  input: string,
  name = "Uploaded dataset"
): DatasetAnalysis {
  const parsed = parseCsvRows(input);
  const { columns, rows } = toObjects(parsed);
  const roles = classifyColumns(columns, rows);

  const recommendedChart = chartFromRows(
    name,
    rows,
    roles
  );

  const recommendedMap = mapFromRows(
    name,
    columns,
    rows,
    roles
  );

  return {
    name,
    rowCount: rows.length,
    columns,
    numericColumns: roles.numericColumns,
    dateColumns: roles.dateColumns,
    latitudeColumn: roles.latitudeColumn,
    longitudeColumn: roles.longitudeColumn,
    recommendedChart,
    recommendedMap,
    insight: describeInsight(
      recommendedChart,
      recommendedMap
    ),
  };
}
