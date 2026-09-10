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

export const DATASET_ANALYSIS_VERSION = "data-story-2026-09-10-v6";

type VersionedDatasetAnalysis = DatasetAnalysis & {
  analysisVersion?: string;
  sourceKind?: "csv" | "xlsx" | "geojson" | "legacy";
  sourceText?: string;
};

export function datasetAnalysisVersion(dataset: DatasetAnalysis) {
  return (dataset as VersionedDatasetAnalysis).analysisVersion;
}

export function isDatasetAnalysisCurrent(dataset?: DatasetAnalysis) {
  return Boolean(
    dataset &&
      datasetAnalysisVersion(dataset) === DATASET_ANALYSIS_VERSION
  );
}

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

function parseTimeValue(value: string): number | undefined {
  const trimmed = clean(value);
  if (!trimmed) return undefined;

  /*
   * NEVER pass arbitrary numeric strings to Date.parse().
   * JavaScript will happily interpret values such as "202", "61.7"
   * or "223.4" as calendar dates. That previously caused rainfall
   * columns to be misclassified as time dimensions.
   */

  const yearOnly = trimmed.match(/^(19\d{2}|20\d{2}|21\d{2})$/);
  if (yearOnly) {
    return Date.UTC(Number(yearOnly[1]), 0, 1);
  }

  const iso = trimmed.match(
    /^(19\d{2}|20\d{2}|21\d{2})[-/](\d{1,2})[-/](\d{1,2})$/
  );
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      return Date.UTC(year, month - 1, day);
    }
  }

  const monthYear = trimmed.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(19\d{2}|20\d{2}|21\d{2})$/i
  );
  if (monthYear) {
    const monthNames = [
      "jan", "feb", "mar", "apr", "may", "jun",
      "jul", "aug", "sep", "oct", "nov", "dec",
    ];
    const month = monthNames.indexOf(
      monthYear[1].slice(0, 3).toLowerCase()
    );
    return Date.UTC(Number(monthYear[2]), month, 1);
  }

  const dayMonthYear = trimmed.match(
    /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(19\d{2}|20\d{2}|21\d{2})$/i
  );
  if (dayMonthYear) {
    const monthNames = [
      "jan", "feb", "mar", "apr", "may", "jun",
      "jul", "aug", "sep", "oct", "nov", "dec",
    ];
    const day = Number(dayMonthYear[1]);
    const month = monthNames.indexOf(
      dayMonthYear[2].slice(0, 3).toLowerCase()
    );
    const year = Number(dayMonthYear[3]);

    if (day >= 1 && day <= 31 && month >= 0) {
      return Date.UTC(year, month, day);
    }
  }

  const monthDayYear = trimmed.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(19\d{2}|20\d{2}|21\d{2})$/i
  );
  if (monthDayYear) {
    const monthNames = [
      "jan", "feb", "mar", "apr", "may", "jun",
      "jul", "aug", "sep", "oct", "nov", "dec",
    ];
    const month = monthNames.indexOf(
      monthDayYear[1].slice(0, 3).toLowerCase()
    );
    const day = Number(monthDayYear[2]);
    const year = Number(monthDayYear[3]);

    if (day >= 1 && day <= 31 && month >= 0) {
      return Date.UTC(year, month, day);
    }
  }

  return undefined;
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

function timeRatio(rows: CsvRow[], column: string) {
  const populated = rows.map((row) => row[column]).filter(Boolean);
  if (!populated.length) return 0;

  return (
    populated.filter((value) => parseTimeValue(value) !== undefined).length /
    populated.length
  );
}

function isCoordinateHeader(column: string) {
  return /^(lat|latitude|lon|lng|long|longitude)$/i.test(clean(column));
}

function isTimeHeader(column: string) {
  const value = clean(column).toLowerCase();

  /*
   * "7-day rainfall total (mm)" is a MEASURE, not a time dimension.
   * "24h extreme (mm)" is also a MEASURE.
   *
   * Date-bearing headers remain time dimensions:
   * - Month
   * - Date
   * - Extreme date
   * - Year
   * - Quarter
   */
  if (/\bdate\b/i.test(value)) return true;

  if (
    /^(year|month|quarter|week|day|time|period|season)\b/i.test(
      value
    )
  ) {
    return true;
  }

  if (
    /\b(year|month|quarter|season)\b/i.test(value) &&
    !/\b(rainfall|precipitation|total|amount|value|count|rate|depth|flow|discharge|temperature|extreme|max|min|mm)\b/i.test(
      value
    )
  ) {
    return true;
  }

  return false;
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

  if (
    /\b(total|amount|value|count|rate|ratio|percent|percentage|share|index)\b/i.test(
      value
    )
  ) {
    score += 35;
  }

  if (
    /\b(temperature|flow|discharge|depth|height|level|volume|area|population|loss|damage)\b/i.test(
      value
    )
  ) {
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

  if (
    /\b(station|site|location|place|ward|neighbou?rhood|subcounty|county|city|basin|river|catchment|name)\b/i.test(
      value
    )
  ) {
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
      (!isCoordinateHeader(column) &&
        (timeRatio(rows, column) >= 0.7 || yearRatio(rows, column) >= 0.7))
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


function numericValueCount(rows: CsvRow[], column: string) {
  return rows.reduce(
    (count, row) =>
      count + (asNumber(row[column]) !== undefined ? 1 : 0),
    0
  );
}

function distinctTextCount(rows: CsvRow[], column: string) {
  return new Set(
    rows
      .map((row) => clean(row[column] || ""))
      .filter(Boolean)
  ).size;
}

function distinctTimeCount(rows: CsvRow[], column: string) {
  return new Set(
    rows
      .map((row) => parseTimeValue(row[column] || ""))
      .filter((value): value is number => value !== undefined)
      .map(String)
  ).size;
}

function bestTimeColumn(
  rows: CsvRow[],
  roles: ColumnRoles
) {
  return roles.dateColumns
    .filter((column) => distinctTimeCount(rows, column) >= 2)
    .sort((a, b) => {
      const aScore =
        (/\b(month|date|year|period|season|time)\b/i.test(a)
          ? 100
          : 0) +
        distinctTimeCount(rows, a);
      const bScore =
        (/\b(month|date|year|period|season|time)\b/i.test(b)
          ? 100
          : 0) +
        distinctTimeCount(rows, b);
      return bScore - aScore;
    })[0];
}

function bestMeasureColumn(
  rows: CsvRow[],
  roles: ColumnRoles
) {
  /*
   * Header semantics are deliberately allowed to rescue a genuine measure
   * even when summary/blank rows lower its numeric ratio. This is especially
   * important for spreadsheets that contain ANNUAL or notes rows.
   */
  const candidates = Array.from(
    new Set([
      ...roles.measureColumns,
      ...roles.numericColumns,
    ])
  )
    .filter(
      (column) =>
        !isCoordinateHeader(column) &&
        !roles.dateColumns.includes(column) &&
        !isIdentifierHeader(column) &&
        numericValueCount(rows, column) >= 2
    )
    .sort((a, b) => {
      const semantic =
        measureHeaderScore(b) - measureHeaderScore(a);
      if (semantic !== 0) return semantic;
      return (
        numericValueCount(rows, b) -
        numericValueCount(rows, a)
      );
    });

  return candidates[0];
}

function bestCategoryColumn(
  rows: CsvRow[],
  roles: ColumnRoles
) {
  return roles.categoryColumns
    .filter(
      (column) =>
        distinctTextCount(rows, column) >= 2 &&
        !isCoordinateHeader(column) &&
        !isTimeHeader(column)
    )
    .sort((a, b) => {
      const semantic =
        categoryHeaderScore(b) -
        categoryHeaderScore(a);
      if (semantic !== 0) return semantic;
      return (
        distinctTextCount(rows, b) -
        distinctTextCount(rows, a)
      );
    })[0];
}

function chartFromRows(
  name: string,
  rows: CsvRow[],
  roles: ColumnRoles
): ChartSpec | undefined {
  const timeColumn = bestTimeColumn(rows, roles);
  const measure = bestMeasureColumn(rows, roles);

  if (timeColumn && measure) {
    const candidates = rows.flatMap((row) => {
      const value = asNumber(row[measure]);
      const label = clean(row[timeColumn]);
      const x = parseTimeValue(label);

      // Summary labels such as ANNUAL are intentionally excluded because
      // they are not genuine time points.
      if (
        value === undefined ||
        !label ||
        x === undefined
      ) {
        return [];
      }

      return [{ label, value, x }];
    });

    const distinctTimes = new Set(
      candidates.map((item) => String(item.x))
    );

    if (
      candidates.length >= 2 &&
      distinctTimes.size >= 2
    ) {
      const series = [...candidates].sort(
        (a, b) => Number(a.x) - Number(b.x)
      );

      return {
        type: "line",
        title: `${measure} over time`,
        subtitle: name,
        xLabel: timeColumn,
        yLabel: measure,
        data: series.slice(0, 36),
        sourceLabel: name,
      };
    }
  }

  const category = bestCategoryColumn(rows, roles);

  if (category && measure) {
    const values: ChartDatum[] = rows.flatMap(
      (row) => {
        const value = asNumber(row[measure]);
        const label = clean(row[category]);

        if (
          value === undefined ||
          !label ||
          /^(annual|total|summary)$/i.test(label)
        ) {
          return [];
        }

        return [{ label, value }];
      }
    );

    if (values.length >= 2) {
      const sorted = [...values].sort(
        (a, b) => b.value - a.value
      );

      return {
        type:
          values.length > 8 ? "ranking" : "bar",
        title: `${measure} by ${category}`,
        subtitle: name,
        xLabel: category,
        yLabel: measure,
        data: trimData(sorted),
        sourceLabel: name,
      };
    }
  }

  const genuineMeasures = Array.from(
    new Set([
      ...roles.measureColumns,
      ...roles.numericColumns.filter(
        (column) =>
          !isCoordinateHeader(column) &&
          !roles.dateColumns.includes(column) &&
          !isIdentifierHeader(column) &&
          measureHeaderScore(column) > 0
      ),
    ])
  ).filter(
    (column) => numericValueCount(rows, column) >= 3
  );

  if (genuineMeasures.length >= 2) {
    const [xColumn, yColumn] = genuineMeasures;

    const scatter: ChartDatum[] = rows.flatMap(
      (row, index) => {
        const x = asNumber(row[xColumn]);
        const value = asNumber(row[yColumn]);

        if (x === undefined || value === undefined) {
          return [];
        }

        return [
          {
            label:
              clean(row[category ?? ""]) ||
              String(index + 1),
            x,
            value,
          },
        ];
      }
    );

    if (scatter.length >= 3) {
      return {
        type: "scatter",
        title: `${yColumn} vs ${xColumn}`,
        subtitle: name,
        xLabel: xColumn,
        yLabel: yColumn,
        data: trimData(scatter, 40),
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
    basemap: "openstreetmap",
    attribution: "© OpenStreetMap contributors",
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

  const recommendedChart = chartFromRows(name, rows, roles);
  const recommendedMap = mapFromRows(name, columns, rows, roles);

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
    insight: describeInsight(recommendedChart, recommendedMap),
    analysisVersion: DATASET_ANALYSIS_VERSION,
    sourceKind: "csv",
    sourceText: input.length <= 250_000 ? input : undefined,
  } as VersionedDatasetAnalysis;
}

export function upgradeLegacyDatasetAnalysis(
  dataset: DatasetAnalysis
): DatasetAnalysis {
  const current = dataset as VersionedDatasetAnalysis;

  if (current.analysisVersion === DATASET_ANALYSIS_VERSION) {
    return dataset;
  }

  if (current.sourceText) {
    return analyzeCsv(current.sourceText, dataset.name);
  }

  let recommendedChart = dataset.recommendedChart;
  const recommendedMap = dataset.recommendedMap;

  if (
    recommendedChart &&
    /^(lat|latitude|lon|lng|long|longitude)$/i.test(
      (recommendedChart.yLabel || "").trim()
    )
  ) {
    recommendedChart = undefined;
  }

  if (recommendedChart?.type === "line") {
    const distinctLabels = new Set(
      recommendedChart.data.map((item) => item.label.trim())
    );

    if (distinctLabels.size < 2) {
      const mappedValues =
        recommendedMap?.points.filter(
          (point) =>
            typeof point.value === "number" &&
            Number.isFinite(point.value)
        ) || [];

      if (mappedValues.length >= 2) {
        recommendedChart = {
          type: mappedValues.length > 8 ? "ranking" : "bar",
          title: `${recommendedChart.yLabel || "value"} by location`,
          subtitle: dataset.name,
          xLabel: "location",
          yLabel: recommendedChart.yLabel,
          data: mappedValues.map((point) => ({
            label: point.label,
            value: point.value as number,
          })),
          sourceLabel:
            recommendedChart.sourceLabel ||
            recommendedMap?.sourceLabel ||
            dataset.name,
        };
      } else {
        recommendedChart = undefined;
      }
    }
  }

  return {
    ...dataset,
    recommendedChart,
    insight: describeInsight(recommendedChart, recommendedMap),
    analysisVersion: DATASET_ANALYSIS_VERSION,
    sourceKind: current.sourceKind || "legacy",
  } as VersionedDatasetAnalysis;
}
