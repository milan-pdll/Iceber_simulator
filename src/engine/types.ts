/**
 * Official Apache Iceberg Spec v2 Data Models & TypeScript Types
 * Specification Reference: https://iceberg.apache.org/spec/
 */

export type PrimitiveType = 'long' | 'int' | 'string' | 'double' | 'float' | 'boolean' | 'timestamp' | 'date';

export interface SchemaField {
  id: number;
  name: string;
  type: PrimitiveType;
  required: boolean;
  doc?: string;
}

export interface IcebergSchema {
  'schema-id': number;
  type: 'struct';
  fields: SchemaField[];
}

export type PartitionTransform =
  | { type: 'identity'; sourceId: number; name: string }
  | { type: 'bucket'; numBuckets: number; sourceId: number; name: string }
  | { type: 'day'; sourceId: number; name: string }
  | { type: 'month'; sourceId: number; name: string }
  | { type: 'year'; sourceId: number; name: string }
  | { type: 'void'; sourceId: number; name: string };

export interface PartitionField {
  'source-id': number;
  'field-id': number;
  name: string;
  transform: string;
}

export interface PartitionSpec {
  'spec-id': number;
  fields: PartitionField[];
}

export interface SnapshotSummary {
  operation: 'append' | 'overwrite' | 'delete' | 'replace';
  'added-data-files'?: string;
  'added-delete-files'?: string;
  'added-records'?: string;
  'deleted-data-files'?: string;
  'deleted-records'?: string;
  'removed-delete-files'?: string;
  'total-data-files': string;
  'total-delete-files': string;
  'total-records': string;
  'changed-partition-count'?: string;
  'iceberg-version'?: string;
  engine?: string;
  'commit-desc'?: string;
}

export interface IcebergSnapshot {
  'sequence-number': number;
  'snapshot-id': number;
  'parent-snapshot-id': number | null;
  'timestamp-ms': number;
  summary: SnapshotSummary;
  'manifest-list': string; // Path to manifest list file
  'schema-id': number;
}

export interface SnapshotLogEntry {
  'timestamp-ms': number;
  'snapshot-id': number;
}

export interface MetadataLogEntry {
  'timestamp-ms': number;
  'metadata-file': string;
}

/**
 * Apache Iceberg v2 Table Metadata JSON Payload
 */
export interface IcebergTableMetadataV2 {
  'format-version': 2;
  'table-uuid': string;
  location: string;
  'last-sequence-number': number;
  'last-updated-ms': number;
  'last-assigned-column-id': number;
  'current-schema-id': number;
  schemas: IcebergSchema[];
  'default-spec-id': number;
  'partition-specs': PartitionSpec[];
  'last-assigned-partition-id': number;
  'default-sort-order-id': number;
  'sort-orders': Array<{ 'order-id': number; fields: any[] }>;
  properties: Record<string, string>;
  'current-snapshot-id': number | null;
  snapshots: IcebergSnapshot[];
  'snapshot-log': SnapshotLogEntry[];
  'metadata-log': MetadataLogEntry[];
}

/**
 * Manifest List Avro Entry
 */
export interface PartitionFieldSummary {
  contains_null: boolean;
  contains_nan?: boolean;
  lower_bound: string | number; // Encoded or readable string representation
  upper_bound: string | number;
}

export interface ManifestListEntry {
  manifest_path: string;
  manifest_length: number;
  partition_spec_id: number;
  content: 0 | 1; // 0 = DATA, 1 = DELETES
  sequence_number: number;
  min_sequence_number: number;
  added_snapshot_id: number;
  added_data_files_count: number;
  existing_data_files_count: number;
  deleted_data_files_count: number;
  added_rows_count: number;
  existing_rows_count: number;
  deleted_rows_count: number;
  partitions: Record<string, PartitionFieldSummary>;
  reused_from_snapshot_id?: number; // Visual Lineage indicator
}

/**
 * Manifest File Avro Entry
 */
export type ManifestEntryStatus = 0 | 1 | 2; // 0: EXISTING, 1: ADDED, 2: DELETED

export interface DataFileMetadata {
  content: 0 | 1 | 2; // 0: DATA, 1: POSITION_DELETES, 2: EQUALITY_DELETES
  file_path: string;
  file_format: 'PARQUET' | 'ORC' | 'AVRO';
  partition: Record<string, any>;
  record_count: number;
  file_size_in_bytes: number;
  column_sizes: Record<number, number>; // col_id -> size in bytes
  value_counts: Record<number, number>;
  null_value_counts: Record<number, number>;
  nan_value_counts?: Record<number, number>;
  lower_bounds: Record<number, any>; // col_id -> min value
  upper_bounds: Record<number, any>; // col_id -> max value
  split_offsets?: number[];
  // Simulation payloads
  rows_data?: Record<string, any>[]; // Actual in-memory rows simulated
  referenced_data_file?: string; // For positional delete files
  delete_positions?: number[]; // For positional delete files: row positions deleted
}

export interface ManifestEntry {
  status: ManifestEntryStatus;
  snapshot_id: number;
  sequence_number: number;
  data_file: DataFileMetadata;
}

export interface ManifestFileDocument {
  path: string;
  schema_id: number;
  partition_spec_id: number;
  content: 0 | 1; // 0: DATA, 1: DELETES
  entries: ManifestEntry[];
}

/**
 * Storage Bucket Simulation State
 */
export interface StorageObject {
  uri: string;
  type: 'metadata' | 'manifest-list' | 'manifest' | 'data' | 'delete';
  sizeBytes: number;
  createdAt: number;
  isOrphan: boolean;
  referencedBySnapshots: number[];
}

/**
 * Architectural Insight Log Item
 */
export interface ArchitecturalInsight {
  id: string;
  timestamp: number;
  category: 'COMMIT' | 'REUSE' | 'MOR' | 'COW' | 'PRUNING' | 'MAINTENANCE' | 'TIME_TRAVEL';
  title: string;
  description: string;
  technicalDetails: string;
  metrics?: {
    filesCreated?: number;
    filesReused?: number;
    metadataBytes?: number;
    storageBytes?: number;
    ioSavedPercent?: number;
  };
}

/**
 * Query Engine Scan & Pruning Simulation Types
 */
export interface PruningStageTrace {
  stage: 1 | 2 | 3 | 4 | 5;
  name: string;
  description: string;
  status: 'passed' | 'pruned' | 'scanned';
  manifestsEvaluated?: number;
  manifestsSkipped?: number;
  manifestsKept?: number;
  filesEvaluated?: number;
  filesSkipped?: number;
  filesKept?: number;
  recordsEvaluated?: number;
  recordsReturned?: number;
  deletesAppliedCount?: number;
  details: string[];
}

export interface QueryExecutionResult {
  sql: string;
  snapshotId: number;
  executionTimeMs: number;
  stages: PruningStageTrace[];
  matchingRows: Record<string, any>[];
  totalDataFiles: number;
  scannedDataFiles: number;
  skippedDataFiles: number;
  totalManifests: number;
  scannedManifests: number;
  skippedManifests: number;
  ioAvoidancePercentage: number;
  prunedManifestPaths: string[];
  scannedManifestPaths: string[];
  prunedDataFilePaths: string[];
  scannedDataFilePaths: string[];
}

/**
 * Whole Table In-Memory State
 */
export interface TableState {
  catalogPointer: {
    tableIdentifier: string;
    currentMetadataLocation: string;
  };
  metadataHistory: Record<string, IcebergTableMetadataV2>; // location -> metadata
  manifestLists: Record<string, ManifestListEntry[]>; // path -> entries
  manifestFiles: Record<string, ManifestFileDocument>; // path -> document
  storageObjects: Record<string, StorageObject>; // uri -> object
  insights: ArchitecturalInsight[];
}
