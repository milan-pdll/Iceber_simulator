import { SchemaField, PartitionField, PartitionFieldSummary, DataFileMetadata } from './types';

/**
 * Compute column bounds, null counts, and size metrics for a batch of records
 */
export function computeColumnStats(
  records: Record<string, any>[],
  fields: SchemaField[]
): {
  lower_bounds: Record<number, any>;
  upper_bounds: Record<number, any>;
  null_value_counts: Record<number, number>;
  value_counts: Record<number, number>;
  column_sizes: Record<number, number>;
  file_size_in_bytes: number;
} {
  const lower_bounds: Record<number, any> = {};
  const upper_bounds: Record<number, any> = {};
  const null_value_counts: Record<number, number> = {};
  const value_counts: Record<number, number> = {};
  const column_sizes: Record<number, number> = {};

  fields.forEach(field => {
    let minVal: any = undefined;
    let maxVal: any = undefined;
    let nulls = 0;
    let totalVals = 0;
    let byteSize = 0;

    records.forEach(row => {
      const val = row[field.name];
      totalVals++;
      if (val === null || val === undefined) {
        nulls++;
      } else {
        if (minVal === undefined || val < minVal) {
          minVal = val;
        }
        if (maxVal === undefined || val > maxVal) {
          maxVal = val;
        }

        // Approximate byte size
        if (typeof val === 'string') {
          byteSize += val.length + 4;
        } else if (typeof val === 'number') {
          byteSize += 8;
        } else if (typeof val === 'boolean') {
          byteSize += 1;
        } else {
          byteSize += 8;
        }
      }
    });

    if (minVal !== undefined) lower_bounds[field.id] = minVal;
    if (maxVal !== undefined) upper_bounds[field.id] = maxVal;
    null_value_counts[field.id] = nulls;
    value_counts[field.id] = totalVals;
    column_sizes[field.id] = Math.max(byteSize, 12);
  });

  // Base Parquet footer overhead + column chunks
  const totalColumnBytes = Object.values(column_sizes).reduce((a, b) => a + b, 0);
  const file_size_in_bytes = totalColumnBytes + 1024 + records.length * 4;

  return {
    lower_bounds,
    upper_bounds,
    null_value_counts,
    value_counts,
    column_sizes,
    file_size_in_bytes
  };
}

/**
 * Transform a record value into partition value based on Iceberg transform
 */
export function evaluatePartitionTransform(
  value: any,
  transform: string
): string {
  if (value === null || value === undefined) return 'null';

  if (transform === 'identity' || transform === 'identity()') {
    return String(value);
  }

  if (transform.startsWith('bucket(')) {
    const match = transform.match(/bucket\((\d+)\)/);
    const numBuckets = match ? parseInt(match[1], 10) : 4;
    // Simple deterministic hash
    const str = String(value);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const bucket = Math.abs(hash) % numBuckets;
    return `bucket_${bucket}`;
  }

  if (transform === 'day' || transform === 'day()') {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  if (transform === 'month' || transform === 'month()') {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value).slice(0, 7);
    return d.toISOString().slice(0, 7); // YYYY-MM
  }

  if (transform === 'year' || transform === 'year()') {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value).slice(0, 4);
    return d.toISOString().slice(0, 4); // YYYY
  }

  return String(value);
}

/**
 * Extract partition key-value map for a single row given partition spec
 */
export function extractPartitionValues(
  row: Record<string, any>,
  partitionFields: PartitionField[],
  schemaFields: SchemaField[]
): Record<string, any> {
  const result: Record<string, any> = {};
  partitionFields.forEach(pField => {
    const sourceField = schemaFields.find(f => f.id === pField['source-id']);
    if (sourceField) {
      const rawVal = row[sourceField.name];
      result[pField.name] = evaluatePartitionTransform(rawVal, pField.transform);
    }
  });
  return result;
}

/**
 * Compute manifest-level partition summaries from data files
 */
export function computeManifestPartitionSummaries(
  dataFiles: DataFileMetadata[],
  partitionFields: PartitionField[]
): Record<string, PartitionFieldSummary> {
  const summaries: Record<string, PartitionFieldSummary> = {};

  partitionFields.forEach(pField => {
    let minVal: any = undefined;
    let maxVal: any = undefined;
    let hasNull = false;

    dataFiles.forEach(df => {
      const partVal = df.partition[pField.name];
      if (partVal === undefined || partVal === 'null' || partVal === null) {
        hasNull = true;
      } else {
        if (minVal === undefined || partVal < minVal) minVal = partVal;
        if (maxVal === undefined || partVal > maxVal) maxVal = partVal;
      }
    });

    if (minVal !== undefined || hasNull) {
      summaries[pField.name] = {
        contains_null: hasNull,
        lower_bound: minVal !== undefined ? minVal : 'null',
        upper_bound: maxVal !== undefined ? maxVal : 'null'
      };
    }
  });

  return summaries;
}

/**
 * Predicate filter parser & evaluator for Query Engine Simulation
 */
export interface ParsedPredicate {
  field: string;
  op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'IN' | 'LIKE';
  value: any;
  raw: string;
}

export function parseSimpleSqlPredicates(whereClause: string): ParsedPredicate[] {
  if (!whereClause || !whereClause.trim()) return [];
  const clean = whereClause.replace(/^WHERE\s+/i, '').trim();
  const parts = clean.split(/\s+AND\s+/i);
  const predicates: ParsedPredicate[] = [];

  parts.forEach(part => {
    const trimmed = part.trim();
    // match "field = 'val'" or "field >= 100" or "field in ('A', 'B')"
    const eqMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s*(=|!=|>=|<=|>|<)\s*(.+)$/);
    if (eqMatch) {
      const field = eqMatch[1].trim();
      const op = eqMatch[2] as ParsedPredicate['op'];
      let valStr = eqMatch[3].trim();
      let value: any = valStr;

      // Unquote strings
      if ((valStr.startsWith("'") && valStr.endsWith("'")) || (valStr.startsWith('"') && valStr.endsWith('"'))) {
        value = valStr.slice(1, -1);
      } else if (!isNaN(Number(valStr))) {
        value = Number(valStr);
      } else if (valStr.toLowerCase() === 'true') {
        value = true;
      } else if (valStr.toLowerCase() === 'false') {
        value = false;
      }

      predicates.push({
        field,
        op,
        value,
        raw: trimmed
      });
    }
  });

  return predicates;
}

/**
 * Check if a predicate can be pruned by manifest partition summaries
 */
export function canPruneManifestByPartition(
  manifestPartitions: Record<string, PartitionFieldSummary>,
  predicates: ParsedPredicate[],
  partitionFields: PartitionField[],
  schemaFields: SchemaField[]
): { canPrune: boolean; reason?: string } {
  for (const pred of predicates) {
    // Check if predicate field is part of partition spec
    const pField = partitionFields.find(pf => {
      const source = schemaFields.find(sf => sf.id === pf['source-id']);
      return pf.name === pred.field || (source && source.name === pred.field);
    });

    if (!pField) continue;

    const summary = manifestPartitions[pField.name];
    if (!summary) continue;

    const lower = summary.lower_bound;
    const upper = summary.upper_bound;
    const target = pred.value;

    if (pred.op === '=') {
      if (typeof lower === typeof target && typeof upper === typeof target) {
        if (target < lower || target > upper) {
          return {
            canPrune: true,
            reason: `Partition [${pField.name}] bounds (${lower} .. ${upper}) do not contain required value '${target}'`
          };
        }
      }
    } else if (pred.op === '>') {
      if (upper <= target) {
        return {
          canPrune: true,
          reason: `Partition [${pField.name}] upper bound (${upper}) <= predicate (${target})`
        };
      }
    } else if (pred.op === '>=') {
      if (upper < target) {
        return {
          canPrune: true,
          reason: `Partition [${pField.name}] upper bound (${upper}) < predicate (${target})`
        };
      }
    } else if (pred.op === '<') {
      if (lower >= target) {
        return {
          canPrune: true,
          reason: `Partition [${pField.name}] lower bound (${lower}) >= predicate (${target})`
        };
      }
    } else if (pred.op === '<=') {
      if (lower > target) {
        return {
          canPrune: true,
          reason: `Partition [${pField.name}] lower bound (${lower}) > predicate (${target})`
        };
      }
    }
  }

  return { canPrune: false };
}

/**
 * Check if a data file can be pruned by column lower_bounds / upper_bounds
 */
export function canPruneDataFileByColumnStats(
  dataFile: DataFileMetadata,
  predicates: ParsedPredicate[],
  schemaFields: SchemaField[]
): { canPrune: boolean; reason?: string } {
  for (const pred of predicates) {
    const field = schemaFields.find(sf => sf.name.toLowerCase() === pred.field.toLowerCase());
    if (!field) continue;

    const lower = dataFile.lower_bounds[field.id];
    const upper = dataFile.upper_bounds[field.id];
    if (lower === undefined && upper === undefined) continue;

    const target = pred.value;

    if (pred.op === '=') {
      if (target < lower || target > upper) {
        return {
          canPrune: true,
          reason: `Column '${field.name}' min/max bounds [${lower} .. ${upper}] do not contain value '${target}'`
        };
      }
    } else if (pred.op === '>') {
      if (upper <= target) {
        return {
          canPrune: true,
          reason: `Column '${field.name}' max value (${upper}) <= filter value (${target})`
        };
      }
    } else if (pred.op === '>=') {
      if (upper < target) {
        return {
          canPrune: true,
          reason: `Column '${field.name}' max value (${upper}) < filter value (${target})`
        };
      }
    } else if (pred.op === '<') {
      if (lower >= target) {
        return {
          canPrune: true,
          reason: `Column '${field.name}' min value (${lower}) >= filter value (${target})`
        };
      }
    } else if (pred.op === '<=') {
      if (lower > target) {
        return {
          canPrune: true,
          reason: `Column '${field.name}' min value (${lower}) > filter value (${target})`
        };
      }
    }
  }

  return { canPrune: false };
}

/**
 * Evaluate row against predicates
 */
export function matchesRowPredicates(
  row: Record<string, any>,
  predicates: ParsedPredicate[]
): boolean {
  if (predicates.length === 0) return true;

  return predicates.every(pred => {
    const val = row[pred.field];
    if (val === undefined) return true; // lenient

    switch (pred.op) {
      case '=':
        return String(val).toLowerCase() === String(pred.value).toLowerCase();
      case '!=':
        return String(val).toLowerCase() !== String(pred.value).toLowerCase();
      case '>':
        return Number(val) > Number(pred.value);
      case '>=':
        return Number(val) >= Number(pred.value);
      case '<':
        return Number(val) < Number(pred.value);
      case '<=':
        return Number(val) <= Number(pred.value);
      default:
        return true;
    }
  });
}
