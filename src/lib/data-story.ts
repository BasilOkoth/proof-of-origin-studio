import type {
  ChartDatum,
  ChartSpec,
  DatasetAnalysis,
  MapPoint,
  MapSpec,
} from "./types";

type CsvRow = Record<string, string>;

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

function headerMatch(columns: string[], patterns: RegExp[]) {
  return columns.find((column) => patterns.some((pattern) => pattern.test(column)));
}

function toObjects(rows: string[][]): { columns: string[]; rows: CsvRow[] } {
  if (!rows.length) return { columns: [], rows: [] };
  const columns = rows[0].map((value, index) => clean(value) || `Column ${index + 1}`);
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
  return populated.filter((value) => asNumber(value) !== undefined).length / populated.length;
}

function yearRatio(rows: CsvRow[], column: string) {
  const populated = rows.map((row) => row[column]).filter(Boolean);
  if (!populated.length) return 0;
  return populated.filter((value) => asYear(value) !== undefined).length / populated.length;
}

function categoryColumn(columns: string[], numeric: string[], dates: string[]) {
  return columns.find((column) => !numeric.includes(column) && !dates.includes(column));
}

function trimData(data: ChartDatum[], limit = 14) {
  if (data.length <= limit) return data;
  return [...data]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, limit);
}

function chartFromRows(
  name: string,
  columns: string[],
  rows: CsvRow[],
  numericColumns: string[],
  dateColumns: string[]
): ChartSpec | undefined {
  const dateColumn = dateColumns[0];
  const numeric = numericColumns.find((column) => column !== dateColumn);

  if (dateColumn && numeric) {
    const data: ChartDatum[] = rows
      .flatMap((row) => {
        const year = asYear(row[dateColumn]);
        const value = asNumber(row[numeric]);
        if (year === undefined || value === undefined) return [];
        return [{ label: String(year), value, x: year }];
      })
      .sort((a, b) => Number(a.x) - Number(b.x));

    if (data.length >= 2) {
      return {
        type: "line",
        title: `${numeric} over time`,
        subtitle: name,
        xLabel: dateColumn,
        yLabel: numeric,
        data: trimData(data, 30),
        sourceLabel: name,
      };
    }
  }

  const category = categoryColumn(columns, numericColumns, dateColumns);
  if (category && numeric) {
    const data: ChartDatum[] = rows.flatMap((row) => {
      const value = asNumber(row[numeric]);
      if (value === undefined || !row[category]) return [];
      return [{ label: row[category], value }];
    });

    if (data.length >= 2) {
      const sorted = [...data].sort((a, b) => b.value - a.value);
      return {
        type: data.length > 8 ? "ranking" : "bar",
        title: `${numeric} by ${category}`,
        subtitle: name,
        xLabel: category,
        yLabel: numeric,
        data: trimData(sorted),
        sourceLabel: name,
      };
    }
  }

  if (numericColumns.length >= 2) {
    const [xColumn, yColumn] = numericColumns;
    const data: ChartDatum[] = rows.flatMap((row, index) => {
      const x = asNumber(row[xColumn]);
      const value = asNumber(row[yColumn]);
      if (x === undefined || value === undefined) return [];
      return [{
        label: row[category ?? ""] || String(index + 1),
        x,
        value,
      }];
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
  latitudeColumn?: string,
  longitudeColumn?: string,
  numericColumns: string[] = []
): MapSpec | undefined {
  if (!latitudeColumn || !longitudeColumn) return undefined;
  const labelColumn = headerMatch(columns, [/name/i, /site/i, /location/i, /city/i, /country/i]) ??
    columns.find((column) => column !== latitudeColumn && column !== longitudeColumn);
  const valueColumn = numericColumns.find(
    (column) => column !== latitudeColumn && column !== longitudeColumn
  );

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
      const value = valueColumn ? asNumber(row[valueColumn]) : undefined;
      if (value !== undefined) point.value = value;
      return [point];
    })
    .slice(0, 40);

  if (!points.length) return undefined;
  const africaCount = points.filter(
    (point) => point.latitude >= -38 && point.latitude <= 38 && point.longitude >= -20 && point.longitude <= 55
  ).length;

  return {
    title: `Geographic pattern in ${name}`,
    subtitle: valueColumn ? `Points sized by ${valueColumn}` : `${points.length} mapped observations`,
    points,
    sourceLabel: name,
    focus: africaCount / points.length >= 0.7 ? "africa" : "world",
  };
}

function describeInsight(chart?: ChartSpec, map?: MapSpec) {
  if (chart?.type === "line" && chart.data.length >= 2) {
    const first = chart.data[0];
    const last = chart.data[chart.data.length - 1];
    const direction = last.value > first.value ? "increased" : last.value < first.value ? "decreased" : "was broadly unchanged";
    return `${chart.yLabel || "The measured value"} ${direction} from ${first.value} in ${first.label} to ${last.value} in ${last.label}.`;
  }
  if ((chart?.type === "bar" || chart?.type === "ranking") && chart.data.length) {
    const top = [...chart.data].sort((a, b) => b.value - a.value)[0];
    return `${top.label} has the highest plotted ${chart.yLabel || "value"} at ${top.value}.`;
  }
  if (map?.points.length) {
    return `The dataset contains ${map.points.length} geocoded observations that can be explained spatially rather than as a table.`;
  }
  return undefined;
}

export function analyzeCsv(input: string, name = "Uploaded dataset"): DatasetAnalysis {
  const parsed = parseCsvRows(input);
  const { columns, rows } = toObjects(parsed);
  const numericColumns = columns.filter((column) => numericRatio(rows, column) >= 0.7);
  const dateColumns = columns.filter((column) => yearRatio(rows, column) >= 0.7);

  const latitudeColumn = headerMatch(columns, [/^lat$/i, /latitude/i]);
  const longitudeColumn = headerMatch(columns, [/^lon$/i, /^lng$/i, /longitude/i]);

  const recommendedChart = chartFromRows(
    name,
    columns,
    rows,
    numericColumns,
    dateColumns
  );
  const recommendedMap = mapFromRows(
    name,
    columns,
    rows,
    latitudeColumn,
    longitudeColumn,
    numericColumns
  );

  return {
    name,
    rowCount: rows.length,
    columns,
    numericColumns,
    dateColumns,
    latitudeColumn,
    longitudeColumn,
    recommendedChart,
    recommendedMap,
    insight: describeInsight(recommendedChart, recommendedMap),
  };
}
