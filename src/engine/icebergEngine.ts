import {
  IcebergTableMetadataV2,
  IcebergSnapshot,
  ManifestListEntry,
  ManifestFileDocument,
  ManifestEntry,
  DataFileMetadata,
  SchemaField,
  PartitionField,
  TableState,
  StorageObject,
  ArchitecturalInsight,
  SnapshotSummary,
  ParquetStorageFile,
  OperationPerformanceMetric
} from './types';
import {
  computeColumnStats,
  extractPartitionValues,
  computeManifestPartitionSummaries,
  parseSimpleSqlPredicates,
  matchesRowPredicates
} from './statsUtils';

/**
 * Retrieve physical table rows from simulated Parquet storage.
 * Per Apache Iceberg Spec v2, rows are strictly maintained inside physical
 * Parquet data/delete files and not inside the manifest files (.avro).
 */
export function getPhysicalRows(state: TableState, dataFile: DataFileMetadata): Record<string, any>[] {
  if (state.dataFileStorage && state.dataFileStorage[dataFile.file_path]) {
    return state.dataFileStorage[dataFile.file_path].rows;
  }
  return dataFile.rows_data || [];
}

function generateSnapshotId(sequenceNumber: number = 0): number {
  return sequenceNumber;
}

function generateUuid(): string {
  return 'iceberg-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
}

/**
 * Initialize a brand-new Iceberg v2 Table.
 *
 * Per Apache Iceberg Spec v2, table creation atomically commits an initial
 * Snapshot 0 — an empty append snapshot with no data files. This gives the
 * table a valid, addressable state before any records are ingested and enables
 * time-travel back to the pristine empty-table state.
 */
export function initTableState(
  tableIdentifier: string = 'db.events_analytics',
  schemaFields: SchemaField[] = [
    { id: 1, name: 'id', type: 'long', required: true },
    { id: 2, name: 'dept', type: 'string', required: true },
    { id: 3, name: 'event_type', type: 'string', required: false },
    { id: 4, name: 'amount', type: 'double', required: false },
    { id: 5, name: 'created_at', type: 'timestamp', required: true }
  ],
  partitionFields: PartitionField[] = [
    { 'source-id': 2, 'field-id': 1000, name: 'dept', transform: 'identity' }
  ],
  warehouseLocation: string = 's3://lakehouse-warehouse/db/events_analytics'
): TableState {
  const tableUuid = generateUuid();
  const now = Date.now();

  // ── Snapshot 0: empty table state ────────────────────────────────────────
  // Iceberg requires an initial snapshot to be committed as part of CREATE
  // TABLE so the catalog always points to a valid, non-null snapshot.
  const s0Id = 0;
  const s0ManifestListUuid = Math.random().toString(36).substring(2, 9);
  const s0ManifestListPath = `${warehouseLocation}/metadata/snap-${s0Id}-${s0ManifestListUuid}.avro`;
  const s0ManifestListSize = 512; // Empty manifest list is minimal

  const s0Snapshot: IcebergSnapshot = {
    'sequence-number': 0,
    'snapshot-id': s0Id,
    'parent-snapshot-id': null,
    'timestamp-ms': now,
    summary: {
      operation: 'append',
      'added-data-files': '0',
      'added-records': '0',
      'total-data-files': '0',
      'total-delete-files': '0',
      'total-records': '0',
      'changed-partition-count': '0',
      'iceberg-version': '2.0.0',
      engine: 'Apache Iceberg Engine Simulator',
      'commit-desc': `Table '${tableIdentifier}' created — empty initial snapshot`
    },
    'manifest-list': s0ManifestListPath,
    'schema-id': 0
  };

  // v1.metadata.json now has current-snapshot-id pointing to S0
  const v1Location = `${warehouseLocation}/metadata/v1.metadata.json`;

  const v1Metadata: IcebergTableMetadataV2 = {
    'format-version': 2,
    'table-uuid': tableUuid,
    location: warehouseLocation,
    'last-sequence-number': 0,
    'last-updated-ms': now,
    'last-assigned-column-id': Math.max(...schemaFields.map(f => f.id)),
    'current-schema-id': 0,
    schemas: [
      {
        'schema-id': 0,
        type: 'struct',
        fields: schemaFields
      }
    ],
    'default-spec-id': 0,
    'partition-specs': [
      {
        'spec-id': 0,
        fields: partitionFields
      }
    ],
    'last-assigned-partition-id': partitionFields.length > 0 ? Math.max(...partitionFields.map(f => f['field-id'])) : 999,
    'default-sort-order-id': 0,
    'sort-orders': [{ 'order-id': 0, fields: [] }],
    properties: {
      'write.format.default': 'parquet',
      'write.metadata.compression-codec': 'gzip',
      'history.expire.max-snapshot-age-ms': '604800000'
    },
    'current-snapshot-id': s0Id,
    snapshots: [s0Snapshot],
    'snapshot-log': [
      { 'timestamp-ms': now, 'snapshot-id': s0Id }
    ],
    'metadata-log': [
      { 'timestamp-ms': now, 'metadata-file': v1Location }
    ]
  };

  const initialInsight: ArchitecturalInsight = {
    id: `insight-${now}-init`,
    timestamp: now,
    category: 'COMMIT',
    title: `Table Created — Snapshot 0 Committed (Empty State)`,
    description: `Table '${tableIdentifier}' initialized with Iceberg Spec v2. An empty Snapshot 0 (S0) was atomically committed. The catalog pointer now references '${v1Location}'.`,
    technicalDetails: `Per Iceberg Spec v2, CREATE TABLE immediately commits an initial empty append snapshot (S0). This gives the table a valid, non-null current-snapshot-id from the moment of creation, enabling time-travel back to the pristine empty state. The empty manifest list at '${s0ManifestListPath}' contains zero entries.`
  };

  return {
    catalogPointer: {
      tableIdentifier,
      currentMetadataLocation: v1Location
    },
    metadataHistory: {
      [v1Location]: v1Metadata
    },
    manifestLists: {
      // Empty manifest list for S0 — no data files yet
      [s0ManifestListPath]: []
    },
    manifestFiles: {},
    dataFileStorage: {},
    storageObjects: {
      [v1Location]: {
        uri: v1Location,
        type: 'metadata',
        sizeBytes: 2048,
        createdAt: now,
        isOrphan: false,
        referencedBySnapshots: [s0Id]
      },
      [s0ManifestListPath]: {
        uri: s0ManifestListPath,
        type: 'manifest-list',
        sizeBytes: s0ManifestListSize,
        createdAt: now,
        isOrphan: false,
        referencedBySnapshots: [s0Id]
      }
    },
    metricsHistory: [],
    insights: [initialInsight]
  };
}

/**
 * Perform an INSERT (Append) Transaction
 */
export function appendRecords(
  state: TableState,
  records: Record<string, any>[],
  commitMsg: string = 'Appended batch records'
): TableState {
  if (records.length === 0) return state;

  const startTime = performance.now();
  const currentMetadata = state.metadataHistory[state.catalogPointer.currentMetadataLocation];
  const currentSchema = currentMetadata.schemas.find(s => s['schema-id'] === currentMetadata['current-schema-id'])!;
  const partitionSpec = currentMetadata['partition-specs'].find(p => p['spec-id'] === currentMetadata['default-spec-id'])!;

  const newSequenceNumber = currentMetadata['last-sequence-number'] + 1;
  const newSnapshotId = generateSnapshotId(newSequenceNumber);
  const parentSnapshotId = currentMetadata['current-snapshot-id'];
  const versionNum = Object.keys(state.metadataHistory).length + 1;
  const newMetadataLocation = `${currentMetadata.location}/metadata/v${versionNum}.metadata.json`;

  // 1. Group records by partition
  const partitionBuckets: Record<string, { partitionMap: Record<string, any>; rows: Record<string, any>[] }> = {};

  records.forEach(row => {
    const partMap = extractPartitionValues(row, partitionSpec.fields, currentSchema.fields);
    const key = Object.entries(partMap)
      .map(([k, v]) => `${k}=${v}`)
      .join('/') || 'unpartitioned';

    if (!partitionBuckets[key]) {
      partitionBuckets[key] = { partitionMap: partMap, rows: [] };
    }
    partitionBuckets[key].rows.push(row);
  });

  // 2. Generate Parquet Data Files and Manifest Entries
  const newManifestEntries: ManifestEntry[] = [];
  const newStorageObjects: Record<string, StorageObject> = {};
  const newDataFileStorage: Record<string, ParquetStorageFile> = {};
  const dataFilesForSummary: DataFileMetadata[] = [];

  let addedBytes = 0;
  let addedRecords = 0;

  Object.entries(partitionBuckets).forEach(([partKey, bucket], idx) => {
    const fileUuid = Math.random().toString(36).substring(2, 9);
    const dataFilePath = `${currentMetadata.location}/data/${partKey}/0000${idx}-${fileUuid}.parquet`;
    const stats = computeColumnStats(bucket.rows, currentSchema.fields);

    // Per Apache Iceberg Spec v2, manifest entries ONLY contain file metadata and stats.
    // Raw row data is maintained strictly at the physical .parquet storage file!
    const dataFile: DataFileMetadata = {
      content: 0, // DATA
      file_path: dataFilePath,
      file_format: 'PARQUET',
      partition: bucket.partitionMap,
      record_count: bucket.rows.length,
      file_size_in_bytes: stats.file_size_in_bytes,
      column_sizes: stats.column_sizes,
      value_counts: stats.value_counts,
      null_value_counts: stats.null_value_counts,
      lower_bounds: stats.lower_bounds,
      upper_bounds: stats.upper_bounds
    };

    dataFilesForSummary.push(dataFile);
    addedBytes += stats.file_size_in_bytes;
    addedRecords += bucket.rows.length;

    // Physical Parquet file storage maintains the actual rows
    newDataFileStorage[dataFilePath] = {
      file_path: dataFilePath,
      file_format: 'PARQUET',
      content_type: 'data',
      record_count: bucket.rows.length,
      size_in_bytes: stats.file_size_in_bytes,
      rows: bucket.rows
    };

    newManifestEntries.push({
      status: 1, // ADDED
      snapshot_id: newSnapshotId,
      sequence_number: newSequenceNumber,
      data_file: dataFile
    });

    newStorageObjects[dataFilePath] = {
      uri: dataFilePath,
      type: 'data',
      sizeBytes: stats.file_size_in_bytes,
      createdAt: Date.now(),
      isOrphan: false,
      referencedBySnapshots: [newSnapshotId]
    };
  });

  // 3. Create new Manifest File (.avro)
  const manifestUuid = Math.random().toString(36).substring(2, 9);
  const manifestFilePath = `${currentMetadata.location}/metadata/${manifestUuid}-m0.avro`;
  const manifestDoc: ManifestFileDocument = {
    path: manifestFilePath,
    schema_id: currentSchema['schema-id'],
    partition_spec_id: partitionSpec['spec-id'],
    content: 0,
    entries: newManifestEntries
  };

  const manifestPartitionSummaries = computeManifestPartitionSummaries(dataFilesForSummary, partitionSpec.fields);
  const manifestSize = 2048 + newManifestEntries.length * 256;

  newStorageObjects[manifestFilePath] = {
    uri: manifestFilePath,
    type: 'manifest',
    sizeBytes: manifestSize,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  // 4. Manifest Reuse: Collect parent snapshot manifest list entries
  const newManifestListEntries: ManifestListEntry[] = [
    {
      manifest_path: manifestFilePath,
      manifest_length: manifestSize,
      partition_spec_id: partitionSpec['spec-id'],
      content: 0,
      sequence_number: newSequenceNumber,
      min_sequence_number: newSequenceNumber,
      added_snapshot_id: newSnapshotId,
      added_data_files_count: newManifestEntries.length,
      existing_data_files_count: 0,
      deleted_data_files_count: 0,
      added_rows_count: addedRecords,
      existing_rows_count: 0,
      deleted_rows_count: 0,
      partitions: manifestPartitionSummaries
    }
  ];

  let reusedManifestCount = 0;
  if (parentSnapshotId !== null && parentSnapshotId !== undefined) {
    const parentSnapshot = currentMetadata.snapshots.find(s => s['snapshot-id'] === parentSnapshotId);
    if (parentSnapshot && state.manifestLists[parentSnapshot['manifest-list']]) {
      const parentManifestList = state.manifestLists[parentSnapshot['manifest-list']];
      parentManifestList.forEach(existingM => {
        // Reuse manifest file without modifying it (O(1) commit metadata reuse)
        newManifestListEntries.push({
          ...existingM,
          reused_from_snapshot_id: existingM.added_snapshot_id
        });
        reusedManifestCount++;

        // Mark existing storage file as referenced by new snapshot as well
        if (state.storageObjects[existingM.manifest_path]) {
          state.storageObjects[existingM.manifest_path].referencedBySnapshots.push(newSnapshotId);
        }
      });
    }
  }

  // 5. Create new Manifest List (.avro)
  const manifestListUuid = Math.random().toString(36).substring(2, 9);
  const manifestListPath = `${currentMetadata.location}/metadata/snap-${newSnapshotId}-${manifestListUuid}.avro`;
  const manifestListSize = 1024 + newManifestListEntries.length * 512;

  newStorageObjects[manifestListPath] = {
    uri: manifestListPath,
    type: 'manifest-list',
    sizeBytes: manifestListSize,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  // 6. Compute Total Counts for Summary
  const prevSnapshot = (parentSnapshotId !== null && parentSnapshotId !== undefined) ? currentMetadata.snapshots.find(s => s['snapshot-id'] === parentSnapshotId) : null;
  const prevTotalDataFiles = prevSnapshot ? parseInt(prevSnapshot.summary['total-data-files'] || '0', 10) : 0;
  const prevTotalDeleteFiles = prevSnapshot ? parseInt(prevSnapshot.summary['total-delete-files'] || '0', 10) : 0;
  const prevTotalRecords = prevSnapshot ? parseInt(prevSnapshot.summary['total-records'] || '0', 10) : 0;

  const snapshotSummary: SnapshotSummary = {
    operation: 'append',
    'added-data-files': String(newManifestEntries.length),
    'added-records': String(addedRecords),
    'total-data-files': String(prevTotalDataFiles + newManifestEntries.length),
    'total-delete-files': String(prevTotalDeleteFiles),
    'total-records': String(prevTotalRecords + addedRecords),
    'changed-partition-count': String(Object.keys(partitionBuckets).length),
    'iceberg-version': '2.0.0',
    engine: 'Apache Iceberg Engine Simulator',
    'commit-desc': commitMsg
  };

  const newSnapshot: IcebergSnapshot = {
    'sequence-number': newSequenceNumber,
    'snapshot-id': newSnapshotId,
    'parent-snapshot-id': parentSnapshotId,
    'timestamp-ms': Date.now(),
    summary: snapshotSummary,
    'manifest-list': manifestListPath,
    'schema-id': currentSchema['schema-id']
  };

  // 7. Generate new v(N+1).metadata.json
  const newMetadata: IcebergTableMetadataV2 = {
    ...currentMetadata,
    'last-sequence-number': newSequenceNumber,
    'last-updated-ms': Date.now(),
    'current-snapshot-id': newSnapshotId,
    snapshots: [...currentMetadata.snapshots, newSnapshot],
    'snapshot-log': [
      ...currentMetadata['snapshot-log'],
      { 'timestamp-ms': Date.now(), 'snapshot-id': newSnapshotId }
    ],
    'metadata-log': [
      ...currentMetadata['metadata-log'],
      { 'timestamp-ms': Date.now(), 'metadata-file': newMetadataLocation }
    ]
  };

  newStorageObjects[newMetadataLocation] = {
    uri: newMetadataLocation,
    type: 'metadata',
    sizeBytes: 2048 + newMetadata.snapshots.length * 400,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  // 8. Architectural Insight Log
  const insight: ArchitecturalInsight = {
    id: `insight-${Date.now()}-${newSnapshotId}`,
    timestamp: Date.now(),
    category: reusedManifestCount > 0 ? 'REUSE' : 'COMMIT',
    title: `Snapshot S${newSequenceNumber} Committed (Append: +${addedRecords} rows)`,
    description: `Added ${newManifestEntries.length} new Parquet file(s) across ${Object.keys(partitionBuckets).length} partition(s). ${reusedManifestCount > 0 ? `Reused ${reusedManifestCount} manifest file(s) without rewriting!` : 'First data snapshot — chained from the empty S0 initial state.'}`,
    technicalDetails: `Iceberg writes a new Manifest List (.avro) pointing to the new manifest file and existing manifests. Because unchanged manifests are not rewritten, commit complexity is O(1) with respect to total table data files.`,
    metrics: {
      filesCreated: newManifestEntries.length,
      filesReused: reusedManifestCount,
      metadataBytes: manifestSize + manifestListSize,
      storageBytes: addedBytes
    }
  };

  const durationMs = Math.max(0.1, parseFloat((performance.now() - startTime).toFixed(2)));
  const perfMetric: OperationPerformanceMetric = {
    id: `perf-${Date.now()}-${newSnapshotId}`,
    timestamp: Date.now(),
    operation: 'INSERT',
    operationLabel: 'INSERT (Append)',
    mode: 'append',
    durationMs,
    recordsAffected: addedRecords,
    filesWritten: newManifestEntries.length,
    filesRewritten: 0,
    filesRead: reusedManifestCount,
    bytesWritten: addedBytes + manifestSize + manifestListSize,
    bytesRead: 0,
    reusedManifestCount,
    details: `Appended ${addedRecords} records in ${newManifestEntries.length} Parquet file(s) across ${Object.keys(partitionBuckets).length} partition(s).`,
    efficiencyVerdict: `⚡ Fast Append: O(1) manifest reuse. 0 existing data files rewritten.`
  };

  return {
    catalogPointer: {
      ...state.catalogPointer,
      currentMetadataLocation: newMetadataLocation
    },
    metadataHistory: {
      ...state.metadataHistory,
      [newMetadataLocation]: newMetadata
    },
    manifestLists: {
      ...state.manifestLists,
      [manifestListPath]: newManifestListEntries
    },
    manifestFiles: {
      ...state.manifestFiles,
      [manifestFilePath]: manifestDoc
    },
    dataFileStorage: {
      ...(state.dataFileStorage || {}),
      ...newDataFileStorage
    },
    storageObjects: {
      ...state.storageObjects,
      ...newStorageObjects
    },
    metricsHistory: [perfMetric, ...(state.metricsHistory || [])],
    lastOperationMetric: perfMetric,
    insights: state.insights || [],
  };
}

/**
 * Perform a DELETE transaction using Merge-on-Read (MoR)
 * Generates positional delete .delete files without rewriting data files.
 */
export function deleteRecordsMoR(
  state: TableState,
  predicateStr: string,
  commitMsg: string = 'Merge-on-Read (MoR) Positional Delete'
): TableState {
  const startTime = performance.now();
  const currentMetadata = state.metadataHistory[state.catalogPointer.currentMetadataLocation];
  if (currentMetadata['current-snapshot-id'] === null) return state;

  const predicates = parseSimpleSqlPredicates(predicateStr);
  if (predicates.length === 0) return state;

  const currentSnapshot = currentMetadata.snapshots.find(s => s['snapshot-id'] === currentMetadata['current-snapshot-id'])!;
  const manifestList = state.manifestLists[currentSnapshot['manifest-list']] || [];

  // Find all matching rows and their file paths + row offsets
  const deleteTargets: Record<string, { dataFile: DataFileMetadata; deletedPositions: number[]; deletedRows: Record<string, any>[] }> = {};
  let totalDeletedCount = 0;

  manifestList.forEach(mListEntry => {
    const mDoc = state.manifestFiles[mListEntry.manifest_path];
    if (!mDoc || mDoc.content !== 0) return; // Only scan data manifests

    mDoc.entries.forEach(entry => {
      if (entry.status === 2) return; // Skip already deleted entries

      const rows = getPhysicalRows(state, entry.data_file);
      const matchingIndices: number[] = [];
      const matchingRows: Record<string, any>[] = [];

      rows.forEach((row, idx) => {
        if (matchesRowPredicates(row, predicates)) {
          matchingIndices.push(idx);
          matchingRows.push(row);
        }
      });

      if (matchingIndices.length > 0) {
        deleteTargets[entry.data_file.file_path] = {
          dataFile: entry.data_file,
          deletedPositions: matchingIndices,
          deletedRows: matchingRows
        };
        totalDeletedCount += matchingIndices.length;
      }
    });
  });

  if (totalDeletedCount === 0) return state;

  const newSequenceNumber = currentMetadata['last-sequence-number'] + 1;
  const newSnapshotId = generateSnapshotId(newSequenceNumber);
  const parentSnapshotId = currentMetadata['current-snapshot-id'];
  const versionNum = Object.keys(state.metadataHistory).length + 1;
  const newMetadataLocation = `${currentMetadata.location}/metadata/v${versionNum}.metadata.json`;

  const newStorageObjects: Record<string, StorageObject> = {};
  const newDataFileStorage: Record<string, ParquetStorageFile> = {};
  const newDeleteManifestEntries: ManifestEntry[] = [];

  // Generate Positional Delete Files (.parquet)
  Object.entries(deleteTargets).forEach(([dataFilePath, target], idx) => {
    const delUuid = Math.random().toString(36).substring(2, 9);
    const deleteFilePath = `${currentMetadata.location}/data/deletes/del-${idx}-${delUuid}.parquet`;
    const deleteFileSize = 1024 + target.deletedPositions.length * 32;

    // Per Apache Iceberg Spec v2, manifest entries ONLY contain file metadata and stats.
    const deleteFileMeta: DataFileMetadata = {
      content: 1, // POSITION_DELETES
      file_path: deleteFilePath,
      file_format: 'PARQUET',
      partition: target.dataFile.partition,
      record_count: target.deletedPositions.length,
      file_size_in_bytes: deleteFileSize,
      column_sizes: { 2147483546: 128, 2147483545: 64 }, // Iceberg spec file_path & pos col IDs
      value_counts: { 2147483546: target.deletedPositions.length },
      null_value_counts: { 2147483546: 0, 2147483545: 0 },
      lower_bounds: {},
      upper_bounds: {},
      referenced_data_file: dataFilePath,
      delete_positions: target.deletedPositions
    };

    newDeleteManifestEntries.push({
      status: 1, // ADDED
      snapshot_id: newSnapshotId,
      sequence_number: newSequenceNumber,
      data_file: deleteFileMeta
    });

    newStorageObjects[deleteFilePath] = {
      uri: deleteFilePath,
      type: 'delete',
      sizeBytes: deleteFileSize,
      createdAt: Date.now(),
      isOrphan: false,
      referencedBySnapshots: [newSnapshotId]
    };

    // The physical .delete parquet file explicitly contains the deleted rows & position offsets!
    newDataFileStorage[deleteFilePath] = {
      file_path: deleteFilePath,
      file_format: 'PARQUET',
      content_type: 'position_deletes',
      record_count: target.deletedPositions.length,
      size_in_bytes: deleteFileSize,
      rows: target.deletedRows,
      referenced_data_file: dataFilePath,
      delete_positions: target.deletedPositions
    };
  });

  // Create Delete Manifest File (.avro)
  const delManifestUuid = Math.random().toString(36).substring(2, 9);
  const delManifestPath = `${currentMetadata.location}/metadata/${delManifestUuid}-delete-m0.avro`;
  const delManifestDoc: ManifestFileDocument = {
    path: delManifestPath,
    schema_id: currentMetadata['current-schema-id'],
    partition_spec_id: currentMetadata['default-spec-id'],
    content: 1, // DELETES
    entries: newDeleteManifestEntries
  };

  const delManifestSize = 2048 + newDeleteManifestEntries.length * 256;
  newStorageObjects[delManifestPath] = {
    uri: delManifestPath,
    type: 'manifest',
    sizeBytes: delManifestSize,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  // Build new Manifest List (New Delete Manifest + Reused Existing Data Manifests)
  const newManifestListEntries: ManifestListEntry[] = [
    {
      manifest_path: delManifestPath,
      manifest_length: delManifestSize,
      partition_spec_id: currentMetadata['default-spec-id'],
      content: 1, // DELETES
      sequence_number: newSequenceNumber,
      min_sequence_number: newSequenceNumber,
      added_snapshot_id: newSnapshotId,
      added_data_files_count: 0,
      existing_data_files_count: 0,
      deleted_data_files_count: 0,
      added_rows_count: 0,
      existing_rows_count: 0,
      deleted_rows_count: totalDeletedCount,
      partitions: {}
    }
  ];

  // Reuse unchanged parent manifests O(1)
  manifestList.forEach(existingM => {
    newManifestListEntries.push({
      ...existingM,
      reused_from_snapshot_id: existingM.added_snapshot_id
    });
  });

  const manifestListUuid = Math.random().toString(36).substring(2, 9);
  const manifestListPath = `${currentMetadata.location}/metadata/snap-${newSnapshotId}-${manifestListUuid}.avro`;
  const manifestListSize = 1024 + newManifestListEntries.length * 512;

  newStorageObjects[manifestListPath] = {
    uri: manifestListPath,
    type: 'manifest-list',
    sizeBytes: manifestListSize,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  // 6. Update Snapshot Summary
  const prevSummary = currentSnapshot.summary;
  const prevTotalDataFiles = parseInt(prevSummary['total-data-files'] || '0', 10);
  const prevTotalDeleteFiles = parseInt(prevSummary['total-delete-files'] || '0', 10);
  const prevTotalRecords = parseInt(prevSummary['total-records'] || '0', 10);

  const snapshotSummary: SnapshotSummary = {
    operation: 'delete',
    'added-delete-files': String(newDeleteManifestEntries.length),
    'deleted-records': String(totalDeletedCount),
    'total-data-files': String(prevTotalDataFiles),
    'total-delete-files': String(prevTotalDeleteFiles + newDeleteManifestEntries.length),
    'total-records': String(Math.max(0, prevTotalRecords - totalDeletedCount)),
    'iceberg-version': '2.0.0',
    engine: 'Apache Iceberg Engine Simulator',
    'commit-desc': `${commitMsg} (${predicateStr})`
  };

  const newSnapshot: IcebergSnapshot = {
    'sequence-number': newSequenceNumber,
    'snapshot-id': newSnapshotId,
    'parent-snapshot-id': parentSnapshotId,
    'timestamp-ms': Date.now(),
    summary: snapshotSummary,
    'manifest-list': manifestListPath,
    'schema-id': currentMetadata['current-schema-id']
  };

  const newMetadata: IcebergTableMetadataV2 = {
    ...currentMetadata,
    'last-sequence-number': newSequenceNumber,
    'last-updated-ms': Date.now(),
    'current-snapshot-id': newSnapshotId,
    snapshots: [...currentMetadata.snapshots, newSnapshot],
    'snapshot-log': [
      ...currentMetadata['snapshot-log'],
      { 'timestamp-ms': Date.now(), 'snapshot-id': newSnapshotId }
    ],
    'metadata-log': [
      ...currentMetadata['metadata-log'],
      { 'timestamp-ms': Date.now(), 'metadata-file': newMetadataLocation }
    ]
  };

  newStorageObjects[newMetadataLocation] = {
    uri: newMetadataLocation,
    type: 'metadata',
    sizeBytes: 2048 + newMetadata.snapshots.length * 400,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  const durationMs = Math.max(0.1, parseFloat((performance.now() - startTime).toFixed(2)));
  const perfMetric: OperationPerformanceMetric = {
    id: `perf-${Date.now()}-${newSnapshotId}`,
    timestamp: Date.now(),
    operation: 'DELETE_MOR_POS',
    operationLabel: 'DELETE (MoR Positional)',
    mode: 'mor',
    durationMs,
    recordsAffected: totalDeletedCount,
    filesWritten: newDeleteManifestEntries.length,
    filesRewritten: 0,
    filesRead: manifestList.length,
    bytesWritten: Object.values(newStorageObjects).reduce((a, b) => a + b.sizeBytes, 0),
    bytesRead: 0,
    reusedManifestCount: manifestList.length,
    details: `Tombstoned ${totalDeletedCount} row(s) across ${newDeleteManifestEntries.length} positional delete Parquet file(s). 0 data files rewritten.`,
    efficiencyVerdict: `⚡ MoR Positional Write: High write efficiency (0 data files rewritten, ${newDeleteManifestEntries.length} delete file(s) written). Trade-off: Read queries must reconcile position offsets.`
  };

  const insight: ArchitecturalInsight = {
    id: `insight-${Date.now()}-${newSnapshotId}`,
    timestamp: Date.now(),
    category: 'MOR',
    title: `Merge-on-Read (MoR) Delete: ${totalDeletedCount} row(s) deleted`,
    description: `Created ${newDeleteManifestEntries.length} positional delete (.delete) file(s). Original Parquet data files remained untouched on disk!`,
    technicalDetails: `Merge-on-Read avoids write amplification by writing lightweight positional tombstone files instead of rewriting large Parquet data files. When query engines read this snapshot, they reconcile the positional delete offsets during the scan stage.`,
    metrics: {
      filesCreated: newDeleteManifestEntries.length,
      filesReused: manifestList.length,
      storageBytes: Object.values(newStorageObjects).reduce((a, b) => a + b.sizeBytes, 0)
    }
  };

  return {
    catalogPointer: {
      ...state.catalogPointer,
      currentMetadataLocation: newMetadataLocation
    },
    metadataHistory: {
      ...state.metadataHistory,
      [newMetadataLocation]: newMetadata
    },
    manifestLists: {
      ...state.manifestLists,
      [manifestListPath]: newManifestListEntries
    },
    manifestFiles: {
      ...state.manifestFiles,
      [delManifestPath]: delManifestDoc
    },
    dataFileStorage: {
      ...(state.dataFileStorage || {}),
      ...newDataFileStorage
    },
    storageObjects: {
      ...state.storageObjects,
      ...newStorageObjects
    },
    metricsHistory: [perfMetric, ...(state.metricsHistory || [])],
    lastOperationMetric: perfMetric,
    insights: [insight, ...state.insights]
  };
}

/**
 * Perform a DELETE transaction using Merge-on-Read (MoR) with EQUALITY DELETES (content: 2).
 * Writes an Equality Delete Parquet file containing values of equality columns.
 * Per Apache Iceberg Spec v2, equality delete files specify equality_ids (field IDs of the columns).
 */
export function deleteRecordsEquality(
  state: TableState,
  predicateStr: string,
  commitMsg: string = 'Merge-on-Read (MoR) Equality Delete'
): TableState {
  const startTime = performance.now();
  const currentMetadata = state.metadataHistory[state.catalogPointer.currentMetadataLocation];
  if (currentMetadata['current-snapshot-id'] === null) return state;

  const predicates = parseSimpleSqlPredicates(predicateStr);
  if (predicates.length === 0) return state;

  const currentSchema = currentMetadata.schemas.find(s => s['schema-id'] === currentMetadata['current-schema-id'])!;
  const currentSnapshot = currentMetadata.snapshots.find(s => s['snapshot-id'] === currentMetadata['current-snapshot-id'])!;
  const manifestList = state.manifestLists[currentSnapshot['manifest-list']] || [];

  // Identify the equality field IDs from the predicate
  const equalityFieldIds: number[] = [];
  predicates.forEach(p => {
    const field = currentSchema.fields.find(f => f.name.toLowerCase() === p.field.toLowerCase());
    if (field && !equalityFieldIds.includes(field.id)) {
      equalityFieldIds.push(field.id);
    }
  });

  if (equalityFieldIds.length === 0) return state;

  // Scan current active data files to find matching records to delete
  const matchingRows: Record<string, any>[] = [];
  manifestList.forEach(mListEntry => {
    const mDoc = state.manifestFiles[mListEntry.manifest_path];
    if (!mDoc || mDoc.content !== 0) return;

    mDoc.entries.forEach(entry => {
      if (entry.status === 2) return;
      const rows = getPhysicalRows(state, entry.data_file);
      rows.forEach(row => {
        if (matchesRowPredicates(row, predicates)) {
          matchingRows.push(row);
        }
      });
    });
  });

  if (matchingRows.length === 0) return state;

  const newSequenceNumber = currentMetadata['last-sequence-number'] + 1;
  const newSnapshotId = generateSnapshotId(newSequenceNumber);
  const parentSnapshotId = currentMetadata['current-snapshot-id'];
  const versionNum = Object.keys(state.metadataHistory).length + 1;
  const newMetadataLocation = `${currentMetadata.location}/metadata/v${versionNum}.metadata.json`;

  const newStorageObjects: Record<string, StorageObject> = {};
  const newDataFileStorage: Record<string, ParquetStorageFile> = {};
  const newDeleteManifestEntries: ManifestEntry[] = [];

  // Generate Equality Delete File (.parquet)
  const delUuid = Math.random().toString(36).substring(2, 9);
  const eqDeleteFilePath = `${currentMetadata.location}/data/deletes/eq-del-0-${delUuid}.parquet`;
  const eqDeleteFileSize = 1024 + matchingRows.length * 48;

  const eqDeleteFileMeta: DataFileMetadata = {
    content: 2, // 2: EQUALITY_DELETES
    file_path: eqDeleteFilePath,
    file_format: 'PARQUET',
    partition: {},
    record_count: matchingRows.length,
    file_size_in_bytes: eqDeleteFileSize,
    column_sizes: {},
    value_counts: {},
    null_value_counts: {},
    lower_bounds: {},
    upper_bounds: {},
    equality_ids: equalityFieldIds
  };

  newDeleteManifestEntries.push({
    status: 1, // ADDED
    snapshot_id: newSnapshotId,
    sequence_number: newSequenceNumber,
    data_file: eqDeleteFileMeta
  });

  newStorageObjects[eqDeleteFilePath] = {
    uri: eqDeleteFilePath,
    type: 'delete',
    sizeBytes: eqDeleteFileSize,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  newDataFileStorage[eqDeleteFilePath] = {
    file_path: eqDeleteFilePath,
    file_format: 'PARQUET',
    content_type: 'equality_deletes',
    record_count: matchingRows.length,
    size_in_bytes: eqDeleteFileSize,
    rows: matchingRows,
    equality_ids: equalityFieldIds,
    equality_predicates: predicates.reduce((acc, p) => ({ ...acc, [p.field]: p.value }), {})
  };

  // Create Delete Manifest File (.avro)
  const delManifestUuid = Math.random().toString(36).substring(2, 9);
  const delManifestPath = `${currentMetadata.location}/metadata/${delManifestUuid}-delete-m0.avro`;
  const delManifestDoc: ManifestFileDocument = {
    path: delManifestPath,
    schema_id: currentMetadata['current-schema-id'],
    partition_spec_id: currentMetadata['default-spec-id'],
    content: 1, // DELETES manifest
    entries: newDeleteManifestEntries
  };

  const delManifestSize = 2048 + newDeleteManifestEntries.length * 256;
  newStorageObjects[delManifestPath] = {
    uri: delManifestPath,
    type: 'manifest',
    sizeBytes: delManifestSize,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  // Manifest List: New Delete Manifest + Reused Existing Manifests
  const newManifestListEntries: ManifestListEntry[] = [
    {
      manifest_path: delManifestPath,
      manifest_length: delManifestSize,
      partition_spec_id: currentMetadata['default-spec-id'],
      content: 1, // DELETES
      sequence_number: newSequenceNumber,
      min_sequence_number: newSequenceNumber,
      added_snapshot_id: newSnapshotId,
      added_data_files_count: 0,
      existing_data_files_count: 0,
      deleted_data_files_count: 0,
      added_rows_count: 0,
      existing_rows_count: 0,
      deleted_rows_count: matchingRows.length,
      partitions: {}
    }
  ];

  manifestList.forEach(existingM => {
    newManifestListEntries.push({
      ...existingM,
      reused_from_snapshot_id: existingM.added_snapshot_id
    });
  });

  const manifestListUuid = Math.random().toString(36).substring(2, 9);
  const manifestListPath = `${currentMetadata.location}/metadata/snap-${newSnapshotId}-${manifestListUuid}.avro`;
  const manifestListSize = 1024 + newManifestListEntries.length * 512;

  newStorageObjects[manifestListPath] = {
    uri: manifestListPath,
    type: 'manifest-list',
    sizeBytes: manifestListSize,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  // Compute summary
  const prevSummary = currentSnapshot.summary;
  const newSummary: SnapshotSummary = {
    operation: 'delete',
    'added-delete-files': '1',
    'deleted-records': String(matchingRows.length),
    'total-data-files': prevSummary['total-data-files'] || '0',
    'total-delete-files': String(parseInt(prevSummary['total-delete-files'] || '0', 10) + 1),
    'total-records': String(Math.max(0, parseInt(prevSummary['total-records'] || '0', 10) - matchingRows.length)),
    'iceberg-version': '2.0.0',
    engine: 'Apache Iceberg Engine Simulator',
    'commit-desc': commitMsg
  };

  const newSnapshot: IcebergSnapshot = {
    'sequence-number': newSequenceNumber,
    'snapshot-id': newSnapshotId,
    'parent-snapshot-id': parentSnapshotId,
    'timestamp-ms': Date.now(),
    summary: newSummary,
    'manifest-list': manifestListPath,
    'schema-id': currentMetadata['current-schema-id']
  };

  const newMetadata: IcebergTableMetadataV2 = {
    ...currentMetadata,
    'last-sequence-number': newSequenceNumber,
    'last-updated-ms': Date.now(),
    'current-snapshot-id': newSnapshotId,
    snapshots: [...currentMetadata.snapshots, newSnapshot],
    'snapshot-log': [
      ...currentMetadata['snapshot-log'],
      { 'timestamp-ms': Date.now(), 'snapshot-id': newSnapshotId }
    ],
    'metadata-log': [
      ...currentMetadata['metadata-log'],
      { 'timestamp-ms': Date.now(), 'metadata-file': newMetadataLocation }
    ]
  };

  newStorageObjects[newMetadataLocation] = {
    uri: newMetadataLocation,
    type: 'metadata',
    sizeBytes: 2048 + newMetadata.snapshots.length * 400,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  const durationMs = Math.max(0.1, parseFloat((performance.now() - startTime).toFixed(2)));
  const metric: OperationPerformanceMetric = {
    id: `perf-${Date.now()}-${newSnapshotId}`,
    timestamp: Date.now(),
    operation: 'DELETE_MOR_EQ',
    operationLabel: 'DELETE (MoR Equality)',
    mode: 'mor',
    durationMs,
    recordsAffected: matchingRows.length,
    filesWritten: 1,
    filesRewritten: 0,
    filesRead: manifestList.length,
    bytesWritten: eqDeleteFileSize + delManifestSize + manifestListSize,
    bytesRead: 0,
    reusedManifestCount: manifestList.length,
    details: `Equality delete on '${predicateStr}' wrote 1 equality delete Parquet file (content: 2, equality_ids: [${equalityFieldIds.join(', ')}]).`,
    efficiencyVerdict: '⚡ MoR Equality Write: High write efficiency (0 data files rewritten, 1 equality tombstone written). Trade-off: Read queries must evaluate equality predicates during scan reconciliation.'
  };

  const insight: ArchitecturalInsight = {
    id: `insight-${Date.now()}-${newSnapshotId}`,
    timestamp: Date.now(),
    category: 'MOR',
    title: `MoR Equality Delete: ${matchingRows.length} row(s) deleted (content: 2)`,
    description: `Created 1 Equality Delete (.parquet) file with equality IDs [${equalityFieldIds.join(', ')}] matching '${predicateStr}'. 0 Parquet data files were rewritten.`,
    technicalDetails: `Apache Iceberg Spec v2 Equality Deletes allow deleting rows by column values without specifying data file paths or row offsets. Engines evaluating this table reconcile equality delete criteria during query scanning.`,
    metrics: {
      filesCreated: 1,
      filesReused: manifestList.length,
      storageBytes: Object.values(newStorageObjects).reduce((a, b) => a + b.sizeBytes, 0)
    }
  };

  return {
    catalogPointer: {
      ...state.catalogPointer,
      currentMetadataLocation: newMetadataLocation
    },
    metadataHistory: {
      ...state.metadataHistory,
      [newMetadataLocation]: newMetadata
    },
    manifestLists: {
      ...state.manifestLists,
      [manifestListPath]: newManifestListEntries
    },
    manifestFiles: {
      ...state.manifestFiles,
      [delManifestPath]: delManifestDoc
    },
    dataFileStorage: {
      ...(state.dataFileStorage || {}),
      ...newDataFileStorage
    },
    storageObjects: {
      ...state.storageObjects,
      ...newStorageObjects
    },
    metricsHistory: [metric, ...(state.metricsHistory || [])],
    lastOperationMetric: metric,
    insights: [insight, ...state.insights]
  };
}

/**
 * Perform a DELETE transaction using Copy-on-Write (CoW)
 * Rewrites surviving records into new Parquet files and marks old files as DELETED (status: 2).
 */
export function deleteRecordsCoW(
  state: TableState,
  predicateStr: string,
  commitMsg: string = 'Copy-on-Write (CoW) Delete'
): TableState {
  const startTime = performance.now();
  const currentMetadata = state.metadataHistory[state.catalogPointer.currentMetadataLocation];
  if (currentMetadata['current-snapshot-id'] === null) return state;

  const predicates = parseSimpleSqlPredicates(predicateStr);
  if (predicates.length === 0) return state;

  const currentSnapshot = currentMetadata.snapshots.find(s => s['snapshot-id'] === currentMetadata['current-snapshot-id'])!;
  const manifestList = state.manifestLists[currentSnapshot['manifest-list']] || [];
  const currentSchema = currentMetadata.schemas.find(s => s['schema-id'] === currentMetadata['current-schema-id'])!;
  const partitionSpec = currentMetadata['partition-specs'].find(p => p['spec-id'] === currentMetadata['default-spec-id'])!;

  let totalDeletedCount = 0;
  const newStorageObjects: Record<string, StorageObject> = {};
  const newDataFileStorage: Record<string, ParquetStorageFile> = {};
  const newManifestFiles: Record<string, ManifestFileDocument> = {};
  const newManifestListEntries: ManifestListEntry[] = [];

  const newSequenceNumber = currentMetadata['last-sequence-number'] + 1;
  const newSnapshotId = generateSnapshotId(newSequenceNumber);
  const parentSnapshotId = currentMetadata['current-snapshot-id'];
  const versionNum = Object.keys(state.metadataHistory).length + 1;
  const newMetadataLocation = `${currentMetadata.location}/metadata/v${versionNum}.metadata.json`;

  let rewrittenDataFilesCount = 0;
  let deletedDataFilesCount = 0;

  manifestList.forEach(mListEntry => {
    const mDoc = state.manifestFiles[mListEntry.manifest_path];
    if (!mDoc) return;

    let manifestModified = false;
    const localManifestEntries: ManifestEntry[] = [];

    mDoc.entries.forEach(entry => {
      if (entry.status === 2) {
        // Already deleted in previous snapshot, can be dropped or kept as existing
        return;
      }

      const rows = getPhysicalRows(state, entry.data_file);
      const survivingRows = rows.filter(r => !matchesRowPredicates(r, predicates));
      const deletedRowsInFile = rows.length - survivingRows.length;

      if (deletedRowsInFile > 0) {
        manifestModified = true;
        totalDeletedCount += deletedRowsInFile;
        deletedDataFilesCount++;

        // 1. Mark old file as DELETED (status: 2) in new manifest
        localManifestEntries.push({
          status: 2, // DELETED
          snapshot_id: newSnapshotId,
          sequence_number: newSequenceNumber,
          data_file: entry.data_file
        });

        // 2. If surviving records remain, write brand new Parquet data file
        if (survivingRows.length > 0) {
          rewrittenDataFilesCount++;
          const fileUuid = Math.random().toString(36).substring(2, 9);
          const partKey = Object.entries(entry.data_file.partition)
            .map(([k, v]) => `${k}=${v}`)
            .join('/') || 'unpartitioned';
          const newPath = `${currentMetadata.location}/data/${partKey}/cow-${fileUuid}.parquet`;
          const stats = computeColumnStats(survivingRows, currentSchema.fields);

          // Per Apache Iceberg Spec v2, manifest entries ONLY contain file metadata and stats.
          const rewrittenDataFile: DataFileMetadata = {
            content: 0,
            file_path: newPath,
            file_format: 'PARQUET',
            partition: entry.data_file.partition,
            record_count: survivingRows.length,
            file_size_in_bytes: stats.file_size_in_bytes,
            column_sizes: stats.column_sizes,
            value_counts: stats.value_counts,
            null_value_counts: stats.null_value_counts,
            lower_bounds: stats.lower_bounds,
            upper_bounds: stats.upper_bounds
          };

          // Save surviving records in physical Parquet file storage
          newDataFileStorage[newPath] = {
            file_path: newPath,
            file_format: 'PARQUET',
            content_type: 'data',
            record_count: survivingRows.length,
            size_in_bytes: stats.file_size_in_bytes,
            rows: survivingRows
          };

          localManifestEntries.push({
            status: 1, // ADDED
            snapshot_id: newSnapshotId,
            sequence_number: newSequenceNumber,
            data_file: rewrittenDataFile
          });

          newStorageObjects[newPath] = {
            uri: newPath,
            type: 'data',
            sizeBytes: stats.file_size_in_bytes,
            createdAt: Date.now(),
            isOrphan: false,
            referencedBySnapshots: [newSnapshotId]
          };
        }
      } else {
        // Untouched entry
        localManifestEntries.push({
          ...entry,
          status: 0 // EXISTING
        });
      }
    });

    if (manifestModified) {
      // Create new manifest file for modified entries
      const mUuid = Math.random().toString(36).substring(2, 9);
      const newMPath = `${currentMetadata.location}/metadata/${mUuid}-cow-m.avro`;
      const newMDoc: ManifestFileDocument = {
        path: newMPath,
        schema_id: currentSchema['schema-id'],
        partition_spec_id: partitionSpec['spec-id'],
        content: 0,
        entries: localManifestEntries
      };

      const validDataFiles = localManifestEntries
        .filter(e => e.status !== 2)
        .map(e => e.data_file);
      const partSummaries = computeManifestPartitionSummaries(validDataFiles, partitionSpec.fields);
      const mSize = 2048 + localManifestEntries.length * 256;

      newStorageObjects[newMPath] = {
        uri: newMPath,
        type: 'manifest',
        sizeBytes: mSize,
        createdAt: Date.now(),
        isOrphan: false,
        referencedBySnapshots: [newSnapshotId]
      };

      newManifestListEntries.push({
        manifest_path: newMPath,
        manifest_length: mSize,
        partition_spec_id: partitionSpec['spec-id'],
        content: 0,
        sequence_number: newSequenceNumber,
        min_sequence_number: mListEntry.min_sequence_number,
        added_snapshot_id: newSnapshotId,
        added_data_files_count: rewrittenDataFilesCount,
        existing_data_files_count: localManifestEntries.filter(e => e.status === 0).length,
        deleted_data_files_count: deletedDataFilesCount,
        added_rows_count: localManifestEntries.filter(e => e.status === 1).reduce((s, e) => s + e.data_file.record_count, 0),
        existing_rows_count: localManifestEntries.filter(e => e.status === 0).reduce((s, e) => s + e.data_file.record_count, 0),
        deleted_rows_count: totalDeletedCount,
        partitions: partSummaries
      });

      newManifestFiles[newMPath] = newMDoc;
    } else {
      // Manifest was untouched, reuse it!
      newManifestListEntries.push({
        ...mListEntry,
        reused_from_snapshot_id: mListEntry.added_snapshot_id
      });
      if (state.storageObjects[mListEntry.manifest_path]) {
        state.storageObjects[mListEntry.manifest_path].referencedBySnapshots.push(newSnapshotId);
      }
    }
  });

  if (totalDeletedCount === 0) return state;

  // Create new Manifest List File
  const manifestListUuid = Math.random().toString(36).substring(2, 9);
  const manifestListPath = `${currentMetadata.location}/metadata/snap-${newSnapshotId}-${manifestListUuid}.avro`;
  const manifestListSize = 1024 + newManifestListEntries.length * 512;

  newStorageObjects[manifestListPath] = {
    uri: manifestListPath,
    type: 'manifest-list',
    sizeBytes: manifestListSize,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  const prevTotalDataFiles = parseInt(currentSnapshot.summary['total-data-files'] || '0', 10);
  const prevTotalDeleteFiles = parseInt(currentSnapshot.summary['total-delete-files'] || '0', 10);
  const prevTotalRecords = parseInt(currentSnapshot.summary['total-records'] || '0', 10);

  const finalTotalDataFiles = prevTotalDataFiles - deletedDataFilesCount + rewrittenDataFilesCount;

  const snapshotSummary: SnapshotSummary = {
    operation: 'overwrite',
    'deleted-data-files': String(deletedDataFilesCount),
    'added-data-files': String(rewrittenDataFilesCount),
    'deleted-records': String(totalDeletedCount),
    'total-data-files': String(Math.max(0, finalTotalDataFiles)),
    'total-delete-files': String(prevTotalDeleteFiles),
    'total-records': String(Math.max(0, prevTotalRecords - totalDeletedCount)),
    'iceberg-version': '2.0.0',
    engine: 'Apache Iceberg Engine Simulator',
    'commit-desc': `${commitMsg} (${predicateStr})`
  };

  const newSnapshot: IcebergSnapshot = {
    'sequence-number': newSequenceNumber,
    'snapshot-id': newSnapshotId,
    'parent-snapshot-id': parentSnapshotId,
    'timestamp-ms': Date.now(),
    summary: snapshotSummary,
    'manifest-list': manifestListPath,
    'schema-id': currentSchema['schema-id']
  };

  const newMetadata: IcebergTableMetadataV2 = {
    ...currentMetadata,
    'last-sequence-number': newSequenceNumber,
    'last-updated-ms': Date.now(),
    'current-snapshot-id': newSnapshotId,
    snapshots: [...currentMetadata.snapshots, newSnapshot],
    'snapshot-log': [
      ...currentMetadata['snapshot-log'],
      { 'timestamp-ms': Date.now(), 'snapshot-id': newSnapshotId }
    ],
    'metadata-log': [
      ...currentMetadata['metadata-log'],
      { 'timestamp-ms': Date.now(), 'metadata-file': newMetadataLocation }
    ]
  };

  newStorageObjects[newMetadataLocation] = {
    uri: newMetadataLocation,
    type: 'metadata',
    sizeBytes: 2048 + newMetadata.snapshots.length * 400,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  const durationMs = Math.max(0.1, parseFloat((performance.now() - startTime).toFixed(2)));
  const perfMetric: OperationPerformanceMetric = {
    id: `perf-${Date.now()}-${newSnapshotId}`,
    timestamp: Date.now(),
    operation: 'DELETE_COW',
    operationLabel: 'DELETE (CoW Rewrite)',
    mode: 'cow',
    durationMs,
    recordsAffected: totalDeletedCount,
    filesWritten: rewrittenDataFilesCount,
    filesRewritten: deletedDataFilesCount,
    filesRead: manifestList.length,
    bytesWritten: Object.values(newStorageObjects).reduce((a, b) => a + b.sizeBytes, 0),
    bytesRead: 0,
    reusedManifestCount: manifestList.length - Object.keys(newManifestFiles).length,
    details: `CoW Delete removed ${totalDeletedCount} row(s). Rewrote ${rewrittenDataFilesCount} Parquet file(s) and marked ${deletedDataFilesCount} old file(s) as DELETED.`,
    efficiencyVerdict: `🐢 CoW Rewrite: Heavy write amplification (rewrote ${rewrittenDataFilesCount} Parquet files). Trade-off: Future read queries have ZERO merge overhead.`
  };

  const insight: ArchitecturalInsight = {
    id: `insight-${Date.now()}-${newSnapshotId}`,
    timestamp: Date.now(),
    category: 'COW',
    title: `Copy-on-Write (CoW) Delete: Rewrote ${rewrittenDataFilesCount} file(s)`,
    description: `Deleted ${totalDeletedCount} row(s). Rewrote surviving rows into fresh Parquet files and marked old files as DELETED (status: 2).`,
    technicalDetails: `Copy-on-Write trades higher write amplification for zero read latency. No positional delete reconciliation is required during query execution scans.`,
    metrics: {
      filesCreated: rewrittenDataFilesCount,
      storageBytes: Object.values(newStorageObjects).reduce((a, b) => a + b.sizeBytes, 0)
    }
  };

  return {
    catalogPointer: {
      ...state.catalogPointer,
      currentMetadataLocation: newMetadataLocation
    },
    metadataHistory: {
      ...state.metadataHistory,
      [newMetadataLocation]: newMetadata
    },
    manifestLists: {
      ...state.manifestLists,
      [manifestListPath]: newManifestListEntries
    },
    manifestFiles: {
      ...state.manifestFiles,
      ...newManifestFiles
    },
    dataFileStorage: {
      ...(state.dataFileStorage || {}),
      ...newDataFileStorage
    },
    storageObjects: {
      ...state.storageObjects,
      ...newStorageObjects
    },
    metricsHistory: [perfMetric, ...(state.metricsHistory || [])],
    lastOperationMetric: perfMetric,
    insights: [insight, ...state.insights]
  };
}

/**
 * Perform an UPDATE transaction (Atomic Delete + Insert)
 */
export function updateRecords(
  state: TableState,
  predicateStr: string,
  fieldUpdates: Record<string, any>,
  mode: 'mor' | 'cow' = 'mor',
  commitMsg: string = 'Updated records'
): TableState {
  const startTime = performance.now();
  const currentMetadata = state.metadataHistory[state.catalogPointer.currentMetadataLocation];
  if (currentMetadata['current-snapshot-id'] === null) return state;

  const predicates = parseSimpleSqlPredicates(predicateStr);
  if (predicates.length === 0) return state;

  // Extract records to update
  const allCurrentRows: Record<string, any>[] = [];
  const currentSnapshot = currentMetadata.snapshots.find(s => s['snapshot-id'] === currentMetadata['current-snapshot-id'])!;
  const manifestList = state.manifestLists[currentSnapshot['manifest-list']] || [];

  manifestList.forEach(m => {
    const doc = state.manifestFiles[m.manifest_path];
    if (doc && doc.content === 0) {
      doc.entries.forEach(e => {
        if (e.status !== 2) {
          const rows = getPhysicalRows(state, e.data_file);
          rows.forEach(r => {
            if (matchesRowPredicates(r, predicates)) {
              allCurrentRows.push({ ...r, ...fieldUpdates });
            }
          });
        }
      });
    }
  });

  if (allCurrentRows.length === 0) return state;

  // 1. First apply delete (MoR or CoW)
  const deletedState = mode === 'mor'
    ? deleteRecordsMoR(state, predicateStr, `Update [Phase 1/2: Delete old]`)
    : deleteRecordsCoW(state, predicateStr, `Update [Phase 1/2: Delete old]`);

  // 2. Then append modified records
  const finalState = appendRecords(deletedState, allCurrentRows, `${commitMsg} [Phase 2/2: Insert new]`);

  const durationMs = Math.max(0.1, parseFloat((performance.now() - startTime).toFixed(2)));
  const perfMetric: OperationPerformanceMetric = {
    id: `perf-${Date.now()}-update`,
    timestamp: Date.now(),
    operation: mode === 'mor' ? 'UPDATE_MOR' : 'UPDATE_COW',
    operationLabel: mode === 'mor' ? 'UPDATE (MoR Mode)' : 'UPDATE (CoW Mode)',
    mode,
    durationMs,
    recordsAffected: allCurrentRows.length,
    filesWritten: finalState.lastOperationMetric?.filesWritten || 1,
    filesRewritten: mode === 'cow' ? (deletedState.lastOperationMetric?.filesRewritten || 1) : 0,
    filesRead: manifestList.length,
    bytesWritten: (deletedState.lastOperationMetric?.bytesWritten || 0) + (finalState.lastOperationMetric?.bytesWritten || 0),
    bytesRead: 0,
    reusedManifestCount: finalState.lastOperationMetric?.reusedManifestCount || 0,
    details: `Updated ${allCurrentRows.length} record(s) matching '${predicateStr}' (${mode.toUpperCase()} mode).`,
    efficiencyVerdict: mode === 'mor'
      ? `⚡ MoR Update: Fast tombstone + append write without rewriting unaffected file chunks.`
      : `🐢 CoW Update: Rewrote affected Parquet data files. Zero query-time merge overhead.`
  };

  const insight: ArchitecturalInsight = {
    id: `insight-${Date.now()}-update`,
    timestamp: Date.now(),
    category: 'COMMIT',
    title: `Atomic UPDATE Transaction Completed (${mode.toUpperCase()} mode)`,
    description: `Updated ${allCurrentRows.length} record(s) matching '${predicateStr}' with new values: ${JSON.stringify(fieldUpdates)}.`,
    technicalDetails: `Iceberg executes Updates via atomic transactional guarantees. In ${mode === 'mor' ? 'Merge-on-Read' : 'Copy-on-Write'} mode, old row states are tombstoned and replaced by new records in the snapshot.`
  };

  return {
    ...finalState,
    metricsHistory: [perfMetric, ...(finalState.metricsHistory || [])],
    lastOperationMetric: perfMetric,
    insights: [insight, ...finalState.insights]
  };
}

/**
 * Perform a MERGE INTO (Upsert / CDC Merge) Transaction
 * Spec v2 compliant atomic merge operation:
 * Matches incoming source records against active table records by `matchKey`.
 * - WHEN MATCHED: Updates existing record with source values.
 * - WHEN NOT MATCHED: Inserts source record as a new row.
 * Supports both MoR (Merge-on-Read) and CoW (Copy-on-Write) mutability modes.
 */
export function mergeRecords(
  state: TableState,
  sourceRecords: Record<string, any>[],
  matchKey: string = 'id',
  mode: 'mor' | 'cow' = 'mor',
  commitMsg?: string
): TableState {
  if (!sourceRecords || sourceRecords.length === 0) return state;

  const startTime = performance.now();
  const currentMetadata = state.metadataHistory[state.catalogPointer.currentMetadataLocation];
  if (currentMetadata['current-snapshot-id'] === null || currentMetadata.snapshots.length === 0) {
    // If no prior snapshot exists, all incoming records are treated as inserts
    return appendRecords(state, sourceRecords, commitMsg || `MERGE INTO: Initial table ingest (${sourceRecords.length} record(s))`);
  }

  const currentSnapshot = currentMetadata.snapshots.find(s => s['snapshot-id'] === currentMetadata['current-snapshot-id'])!;
  const manifestList = state.manifestLists[currentSnapshot['manifest-list']] || [];
  const currentSchema = currentMetadata.schemas.find(s => s['schema-id'] === currentMetadata['current-schema-id'])!;
  const partitionSpec = currentMetadata['partition-specs'].find(p => p['spec-id'] === currentMetadata['default-spec-id'])!;

  // 1. Gather all active delete positions by file for MoR
  const activeDeletePositionsByFile: Record<string, Set<number>> = {};
  if (mode === 'mor') {
    manifestList.forEach(m => {
      const doc = state.manifestFiles[m.manifest_path];
      if (doc && doc.content === 1) { // delete manifest
        doc.entries.forEach(e => {
          if (e.status !== 2 && e.data_file.referenced_data_file && e.data_file.delete_positions) {
            const target = e.data_file.referenced_data_file;
            if (!activeDeletePositionsByFile[target]) {
              activeDeletePositionsByFile[target] = new Set();
            }
            e.data_file.delete_positions.forEach(pos => activeDeletePositionsByFile[target].add(pos));
          }
        });
      }
    });
  }

  // 2. Scan active data records and index by matchKey
  interface ActiveRowRef {
    row: Record<string, any>;
    filePath: string;
    rowPos: number;
    partition: Record<string, any>;
    dataFile: DataFileMetadata;
  }

  const activeRowsByKey: Map<any, ActiveRowRef> = new Map();
  manifestList.forEach(m => {
    const doc = state.manifestFiles[m.manifest_path];
    if (!doc || doc.content === 1) return;

    doc.entries.forEach(e => {
      if (e.status === 2) return;
      const rows = getPhysicalRows(state, e.data_file);
      const delPositions = activeDeletePositionsByFile[e.data_file.file_path] || new Set();

      rows.forEach((row, idx) => {
        if (!delPositions.has(idx)) {
          const keyVal = row[matchKey];
          if (keyVal !== undefined && keyVal !== null) {
            activeRowsByKey.set(String(keyVal), {
              row,
              filePath: e.data_file.file_path,
              rowPos: idx,
              partition: e.data_file.partition,
              dataFile: e.data_file
            });
          }
        }
      });
    });
  });

  // 3. Partition incoming source records into Matched (Updates) and Unmatched (Inserts)
  const matchedUpdates: Array<{ existingRef: ActiveRowRef; updatedRow: Record<string, any> }> = [];
  const unmatchedInserts: Record<string, any>[] = [];

  sourceRecords.forEach(src => {
    const srcKey = src[matchKey];
    if (srcKey !== undefined && srcKey !== null && activeRowsByKey.has(String(srcKey))) {
      const existing = activeRowsByKey.get(String(srcKey))!;
      matchedUpdates.push({
        existingRef: existing,
        updatedRow: { ...existing.row, ...src }
      });
    } else {
      unmatchedInserts.push(src);
    }
  });

  // If nothing matched, simply append the unmatched inserts
  if (matchedUpdates.length === 0) {
    return appendRecords(
      state,
      unmatchedInserts,
      commitMsg || `MERGE INTO: Inserted ${unmatchedInserts.length} new record(s) (no matches on ${matchKey})`
    );
  }

  const newSequenceNumber = currentMetadata['last-sequence-number'] + 1;
  const newSnapshotId = generateSnapshotId(newSequenceNumber);
  const parentSnapshotId = currentMetadata['current-snapshot-id'];
  const versionNum = Object.keys(state.metadataHistory).length + 1;
  const newMetadataLocation = `${currentMetadata.location}/metadata/v${versionNum}.metadata.json`;

  const newStorageObjects: Record<string, StorageObject> = {};
  const newDataFileStorage: Record<string, ParquetStorageFile> = {};
  const newManifestFiles: Record<string, ManifestFileDocument> = {};
  const newManifestListEntries: ManifestListEntry[] = [];
  let addedDataFilesCount = 0;
  let addedDeleteFilesCount = 0;
  let deletedDataFilesCount = 0;

  if (mode === 'mor') {
    // --- MODE: MERGE-ON-READ (MoR) ---
    // A. Create positional delete files targeting matched rows
    const deleteTargets: Record<string, { dataFile: DataFileMetadata; positions: number[]; rows: Record<string, any>[] }> = {};
    matchedUpdates.forEach(({ existingRef }) => {
      if (!deleteTargets[existingRef.filePath]) {
        deleteTargets[existingRef.filePath] = {
          dataFile: existingRef.dataFile,
          positions: [],
          rows: []
        };
      }
      deleteTargets[existingRef.filePath].positions.push(existingRef.rowPos);
      deleteTargets[existingRef.filePath].rows.push(existingRef.row);
    });

    const newDeleteManifestEntries: ManifestEntry[] = [];
    Object.entries(deleteTargets).forEach(([dataFilePath, target], idx) => {
      const delUuid = Math.random().toString(36).substring(2, 9);
      const deleteFilePath = `${currentMetadata.location}/data/deletes/merge-del-${idx}-${delUuid}.parquet`;
      const deleteFileSize = 1024 + target.positions.length * 32;

      // Per Apache Iceberg Spec v2, manifest entries ONLY contain file metadata and stats.
      const deleteFileMeta: DataFileMetadata = {
        content: 1, // POSITION_DELETES
        file_path: deleteFilePath,
        file_format: 'PARQUET',
        partition: target.dataFile.partition,
        record_count: target.positions.length,
        file_size_in_bytes: deleteFileSize,
        column_sizes: { 2147483546: 128, 2147483545: 64 },
        value_counts: { 2147483546: target.positions.length },
        null_value_counts: { 2147483546: 0, 2147483545: 0 },
        lower_bounds: {},
        upper_bounds: {},
        referenced_data_file: dataFilePath,
        delete_positions: target.positions
      };

      // Physical delete parquet file stores the deleted rows
      newDataFileStorage[deleteFilePath] = {
        file_path: deleteFilePath,
        file_format: 'PARQUET',
        content_type: 'position_deletes',
        record_count: target.positions.length,
        size_in_bytes: deleteFileSize,
        rows: target.rows,
        referenced_data_file: dataFilePath,
        delete_positions: target.positions
      };

      newDeleteManifestEntries.push({
        status: 1, // ADDED
        snapshot_id: newSnapshotId,
        sequence_number: newSequenceNumber,
        data_file: deleteFileMeta
      });

      newStorageObjects[deleteFilePath] = {
        uri: deleteFilePath,
        type: 'delete',
        sizeBytes: deleteFileSize,
        createdAt: Date.now(),
        isOrphan: false,
        referencedBySnapshots: [newSnapshotId]
      };
      addedDeleteFilesCount++;
    });

    // Create Delete Manifest File
    const delManifestUuid = Math.random().toString(36).substring(2, 9);
    const delManifestPath = `${currentMetadata.location}/metadata/${delManifestUuid}-merge-delete-m0.avro`;
    const delManifestDoc: ManifestFileDocument = {
      path: delManifestPath,
      schema_id: currentMetadata['current-schema-id'],
      partition_spec_id: currentMetadata['default-spec-id'],
      content: 1,
      entries: newDeleteManifestEntries
    };
    const delManifestSize = 2048 + newDeleteManifestEntries.length * 256;

    newStorageObjects[delManifestPath] = {
      uri: delManifestPath,
      type: 'manifest',
      sizeBytes: delManifestSize,
      createdAt: Date.now(),
      isOrphan: false,
      referencedBySnapshots: [newSnapshotId]
    };
    newManifestFiles[delManifestPath] = delManifestDoc;

    newManifestListEntries.push({
      manifest_path: delManifestPath,
      manifest_length: delManifestSize,
      partition_spec_id: currentMetadata['default-spec-id'],
      content: 1,
      sequence_number: newSequenceNumber,
      min_sequence_number: newSequenceNumber,
      added_snapshot_id: newSnapshotId,
      added_data_files_count: 0,
      existing_data_files_count: 0,
      deleted_data_files_count: 0,
      added_rows_count: 0,
      existing_rows_count: 0,
      deleted_rows_count: matchedUpdates.length,
      partitions: {}
    });

    // B. Write new Parquet data file(s) containing updated rows + inserted rows
    const combinedNewRows = [...matchedUpdates.map(m => m.updatedRow), ...unmatchedInserts];
    const partitionBuckets: Record<string, { partitionMap: Record<string, any>; rows: Record<string, any>[] }> = {};

    combinedNewRows.forEach(row => {
      const partMap = extractPartitionValues(row, partitionSpec.fields, currentSchema.fields);
      const key = Object.entries(partMap).map(([k, v]) => `${k}=${v}`).join('/') || 'unpartitioned';
      if (!partitionBuckets[key]) {
        partitionBuckets[key] = { partitionMap: partMap, rows: [] };
      }
      partitionBuckets[key].rows.push(row);
    });

    const newDataManifestEntries: ManifestEntry[] = [];
    const createdDataFiles: DataFileMetadata[] = [];

    Object.entries(partitionBuckets).forEach(([partKey, bucket], idx) => {
      const fileUuid = Math.random().toString(36).substring(2, 9);
      const filePath = `${currentMetadata.location}/data/${partKey}/merge-${idx}-${fileUuid}.parquet`;
      const stats = computeColumnStats(bucket.rows, currentSchema.fields);

      const dataFile: DataFileMetadata = {
        content: 0,
        file_path: filePath,
        file_format: 'PARQUET',
        partition: bucket.partitionMap,
        record_count: bucket.rows.length,
        file_size_in_bytes: stats.file_size_in_bytes,
        column_sizes: stats.column_sizes,
        value_counts: stats.value_counts,
        null_value_counts: stats.null_value_counts,
        lower_bounds: stats.lower_bounds,
        upper_bounds: stats.upper_bounds
      };

      // Physical Parquet file storage maintains the rows
      newDataFileStorage[filePath] = {
        file_path: filePath,
        file_format: 'PARQUET',
        content_type: 'data',
        record_count: bucket.rows.length,
        size_in_bytes: stats.file_size_in_bytes,
        rows: bucket.rows
      };

      createdDataFiles.push(dataFile);
      addedDataFilesCount++;

      newDataManifestEntries.push({
        status: 1, // ADDED
        snapshot_id: newSnapshotId,
        sequence_number: newSequenceNumber,
        data_file: dataFile
      });

      newStorageObjects[filePath] = {
        uri: filePath,
        type: 'data',
        sizeBytes: stats.file_size_in_bytes,
        createdAt: Date.now(),
        isOrphan: false,
        referencedBySnapshots: [newSnapshotId]
      };
    });

    // Create Data Manifest File
    const dataManifestUuid = Math.random().toString(36).substring(2, 9);
    const dataManifestPath = `${currentMetadata.location}/metadata/${dataManifestUuid}-merge-data-m0.avro`;
    const dataManifestDoc: ManifestFileDocument = {
      path: dataManifestPath,
      schema_id: currentSchema['schema-id'],
      partition_spec_id: partitionSpec['spec-id'],
      content: 0,
      entries: newDataManifestEntries
    };
    const dataManifestPartSummaries = computeManifestPartitionSummaries(createdDataFiles, partitionSpec.fields);
    const dataManifestSize = 2048 + newDataManifestEntries.length * 256;

    newStorageObjects[dataManifestPath] = {
      uri: dataManifestPath,
      type: 'manifest',
      sizeBytes: dataManifestSize,
      createdAt: Date.now(),
      isOrphan: false,
      referencedBySnapshots: [newSnapshotId]
    };
    newManifestFiles[dataManifestPath] = dataManifestDoc;

    newManifestListEntries.push({
      manifest_path: dataManifestPath,
      manifest_length: dataManifestSize,
      partition_spec_id: partitionSpec['spec-id'],
      content: 0,
      sequence_number: newSequenceNumber,
      min_sequence_number: newSequenceNumber,
      added_snapshot_id: newSnapshotId,
      added_data_files_count: createdDataFiles.length,
      existing_data_files_count: 0,
      deleted_data_files_count: 0,
      added_rows_count: combinedNewRows.length,
      existing_rows_count: 0,
      deleted_rows_count: 0,
      partitions: dataManifestPartSummaries
    });

    // Reuse existing data manifests with O(1) reuse
    manifestList.forEach(m => {
      newManifestListEntries.push({
        ...m,
        reused_from_snapshot_id: m.added_snapshot_id
      });
      if (state.storageObjects[m.manifest_path]) {
        state.storageObjects[m.manifest_path].referencedBySnapshots.push(newSnapshotId);
      }
    });

  } else {
    // --- MODE: COPY-ON-WRITE (CoW) ---
    // Rewrites files containing matched rows with the updated rows, and appends unmatched rows
    const impactedFilePaths = new Set(matchedUpdates.map(m => m.existingRef.filePath));
    const matchedUpdatesByFile: Record<string, Record<string, any>[]> = {};
    const matchedOriginalRowPosByFile: Record<string, Set<number>> = {};

    matchedUpdates.forEach(({ existingRef, updatedRow }) => {
      if (!matchedUpdatesByFile[existingRef.filePath]) {
        matchedUpdatesByFile[existingRef.filePath] = [];
        matchedOriginalRowPosByFile[existingRef.filePath] = new Set();
      }
      matchedUpdatesByFile[existingRef.filePath].push(updatedRow);
      matchedOriginalRowPosByFile[existingRef.filePath].add(existingRef.rowPos);
    });

    manifestList.forEach(mListEntry => {
      const mDoc = state.manifestFiles[mListEntry.manifest_path];
      if (!mDoc) return;

      let manifestModified = false;
      const localManifestEntries: ManifestEntry[] = [];

      mDoc.entries.forEach(entry => {
        if (entry.status === 2) return;

        if (impactedFilePaths.has(entry.data_file.file_path)) {
          manifestModified = true;
          deletedDataFilesCount++;

          // 1. Mark old file as DELETED (status: 2)
          localManifestEntries.push({
            status: 2,
            snapshot_id: newSnapshotId,
            sequence_number: newSequenceNumber,
            data_file: entry.data_file
          });

          // 2. Rewrite surviving rows + updated rows
          const rows = getPhysicalRows(state, entry.data_file);
          const deletedPositions = matchedOriginalRowPosByFile[entry.data_file.file_path] || new Set();
          const survivingRows = rows.filter((_, idx) => !deletedPositions.has(idx));
          const updatedRows = matchedUpdatesByFile[entry.data_file.file_path] || [];
          const rewrittenRows = [...survivingRows, ...updatedRows];

          if (rewrittenRows.length > 0) {
            addedDataFilesCount++;
            const fileUuid = Math.random().toString(36).substring(2, 9);
            const partKey = Object.entries(entry.data_file.partition)
              .map(([k, v]) => `${k}=${v}`)
              .join('/') || 'unpartitioned';
            const newPath = `${currentMetadata.location}/data/${partKey}/merge-cow-${fileUuid}.parquet`;
            const stats = computeColumnStats(rewrittenRows, currentSchema.fields);

            const rewrittenDataFile: DataFileMetadata = {
              content: 0,
              file_path: newPath,
              file_format: 'PARQUET',
              partition: entry.data_file.partition,
              record_count: rewrittenRows.length,
              file_size_in_bytes: stats.file_size_in_bytes,
              column_sizes: stats.column_sizes,
              value_counts: stats.value_counts,
              null_value_counts: stats.null_value_counts,
              lower_bounds: stats.lower_bounds,
              upper_bounds: stats.upper_bounds
            };

            // Save in physical Parquet file storage
            newDataFileStorage[newPath] = {
              file_path: newPath,
              file_format: 'PARQUET',
              content_type: 'data',
              record_count: rewrittenRows.length,
              size_in_bytes: stats.file_size_in_bytes,
              rows: rewrittenRows
            };

            localManifestEntries.push({
              status: 1, // ADDED
              snapshot_id: newSnapshotId,
              sequence_number: newSequenceNumber,
              data_file: rewrittenDataFile
            });

            newStorageObjects[newPath] = {
              uri: newPath,
              type: 'data',
              sizeBytes: stats.file_size_in_bytes,
              createdAt: Date.now(),
              isOrphan: false,
              referencedBySnapshots: [newSnapshotId]
            };
          }
        } else {
          // Untouched entry
          localManifestEntries.push({
            ...entry,
            status: 0 // EXISTING
          });
        }
      });

      if (manifestModified) {
        const newMUuid = Math.random().toString(36).substring(2, 9);
        const newMPath = `${currentMetadata.location}/metadata/${newMUuid}-merge-cow-m.avro`;
        const newMDoc: ManifestFileDocument = {
          path: newMPath,
          schema_id: mDoc.schema_id,
          partition_spec_id: mDoc.partition_spec_id,
          content: mDoc.content,
          entries: localManifestEntries
        };
        const activeFiles = localManifestEntries.filter(e => e.status !== 2).map(e => e.data_file);
        const summaries = computeManifestPartitionSummaries(activeFiles, partitionSpec.fields);
        const size = 2048 + localManifestEntries.length * 256;

        newStorageObjects[newMPath] = {
          uri: newMPath,
          type: 'manifest',
          sizeBytes: size,
          createdAt: Date.now(),
          isOrphan: false,
          referencedBySnapshots: [newSnapshotId]
        };

        newManifestListEntries.push({
          manifest_path: newMPath,
          manifest_length: size,
          partition_spec_id: mDoc.partition_spec_id,
          content: mDoc.content,
          sequence_number: newSequenceNumber,
          min_sequence_number: mListEntry.min_sequence_number,
          added_snapshot_id: newSnapshotId,
          added_data_files_count: localManifestEntries.filter(e => e.status === 1).length,
          existing_data_files_count: localManifestEntries.filter(e => e.status === 0).length,
          deleted_data_files_count: localManifestEntries.filter(e => e.status === 2).length,
          added_rows_count: localManifestEntries.filter(e => e.status === 1).reduce((acc, e) => acc + e.data_file.record_count, 0),
          existing_rows_count: localManifestEntries.filter(e => e.status === 0).reduce((acc, e) => acc + e.data_file.record_count, 0),
          deleted_rows_count: localManifestEntries.filter(e => e.status === 2).reduce((acc, e) => acc + e.data_file.record_count, 0),
          partitions: summaries
        });

        newManifestFiles[newMPath] = newMDoc;
      } else {
        // Manifest was untouched, reuse it!
        newManifestListEntries.push({
          ...mListEntry,
          reused_from_snapshot_id: mListEntry.added_snapshot_id
        });
        if (state.storageObjects[mListEntry.manifest_path]) {
          state.storageObjects[mListEntry.manifest_path].referencedBySnapshots.push(newSnapshotId);
        }
      }
    });

    // If there were unmatched inserts, write them to a new Parquet file & manifest
    if (unmatchedInserts.length > 0) {
      const partitionBuckets: Record<string, { partitionMap: Record<string, any>; rows: Record<string, any>[] }> = {};
      unmatchedInserts.forEach(row => {
        const partMap = extractPartitionValues(row, partitionSpec.fields, currentSchema.fields);
        const key = Object.entries(partMap).map(([k, v]) => `${k}=${v}`).join('/') || 'unpartitioned';
        if (!partitionBuckets[key]) {
          partitionBuckets[key] = { partitionMap: partMap, rows: [] };
        }
        partitionBuckets[key].rows.push(row);
      });

      const insertManifestEntries: ManifestEntry[] = [];
      const insertDataFiles: DataFileMetadata[] = [];

      Object.entries(partitionBuckets).forEach(([partKey, bucket], idx) => {
        const fileUuid = Math.random().toString(36).substring(2, 9);
        const filePath = `${currentMetadata.location}/data/${partKey}/merge-insert-${idx}-${fileUuid}.parquet`;
        const stats = computeColumnStats(bucket.rows, currentSchema.fields);

        const dataFile: DataFileMetadata = {
          content: 0,
          file_path: filePath,
          file_format: 'PARQUET',
          partition: bucket.partitionMap,
          record_count: bucket.rows.length,
          file_size_in_bytes: stats.file_size_in_bytes,
          column_sizes: stats.column_sizes,
          value_counts: stats.value_counts,
          null_value_counts: stats.null_value_counts,
          lower_bounds: stats.lower_bounds,
          upper_bounds: stats.upper_bounds
        };

        // Save in physical Parquet file storage
        newDataFileStorage[filePath] = {
          file_path: filePath,
          file_format: 'PARQUET',
          content_type: 'data',
          record_count: bucket.rows.length,
          size_in_bytes: stats.file_size_in_bytes,
          rows: bucket.rows
        };

        insertDataFiles.push(dataFile);
        addedDataFilesCount++;

        insertManifestEntries.push({
          status: 1,
          snapshot_id: newSnapshotId,
          sequence_number: newSequenceNumber,
          data_file: dataFile
        });

        newStorageObjects[filePath] = {
          uri: filePath,
          type: 'data',
          sizeBytes: stats.file_size_in_bytes,
          createdAt: Date.now(),
          isOrphan: false,
          referencedBySnapshots: [newSnapshotId]
        };
      });

      const insertMUuid = Math.random().toString(36).substring(2, 9);
      const insertMPath = `${currentMetadata.location}/metadata/${insertMUuid}-merge-inserts-m.avro`;
      const insertMDoc: ManifestFileDocument = {
        path: insertMPath,
        schema_id: currentSchema['schema-id'],
        partition_spec_id: partitionSpec['spec-id'],
        content: 0,
        entries: insertManifestEntries
      };
      const summaries = computeManifestPartitionSummaries(insertDataFiles, partitionSpec.fields);
      const size = 2048 + insertManifestEntries.length * 256;

      newStorageObjects[insertMPath] = {
        uri: insertMPath,
        type: 'manifest',
        sizeBytes: size,
        createdAt: Date.now(),
        isOrphan: false,
        referencedBySnapshots: [newSnapshotId]
      };
      newManifestFiles[insertMPath] = insertMDoc;

      newManifestListEntries.push({
        manifest_path: insertMPath,
        manifest_length: size,
        partition_spec_id: partitionSpec['spec-id'],
        content: 0,
        sequence_number: newSequenceNumber,
        min_sequence_number: newSequenceNumber,
        added_snapshot_id: newSnapshotId,
        added_data_files_count: insertDataFiles.length,
        existing_data_files_count: 0,
        deleted_data_files_count: 0,
        added_rows_count: unmatchedInserts.length,
        existing_rows_count: 0,
        deleted_rows_count: 0,
        partitions: summaries
      });
    }
  }

  // Create new Manifest List
  const manifestListUuid = Math.random().toString(36).substring(2, 9);
  const manifestListPath = `${currentMetadata.location}/metadata/snap-${newSnapshotId}-${manifestListUuid}.avro`;
  const manifestListSize = 1024 + newManifestListEntries.length * 512;

  newStorageObjects[manifestListPath] = {
    uri: manifestListPath,
    type: 'manifest-list',
    sizeBytes: manifestListSize,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  const prevTotalDataFiles = parseInt(currentSnapshot.summary['total-data-files'] || '0', 10);
  const prevTotalDeleteFiles = parseInt(currentSnapshot.summary['total-delete-files'] || '0', 10);
  const prevTotalRecords = parseInt(currentSnapshot.summary['total-records'] || '0', 10);

  const finalTotalDataFiles = prevTotalDataFiles - deletedDataFilesCount + addedDataFilesCount;
  const finalTotalRecords = prevTotalRecords + unmatchedInserts.length;

  const snapshotSummary: SnapshotSummary = {
    operation: 'overwrite',
    'added-records': String(matchedUpdates.length + unmatchedInserts.length),
    'deleted-records': String(matchedUpdates.length),
    'added-data-files': String(addedDataFilesCount),
    'added-delete-files': String(addedDeleteFilesCount),
    'deleted-data-files': String(deletedDataFilesCount),
    'total-data-files': String(Math.max(0, finalTotalDataFiles)),
    'total-delete-files': String(prevTotalDeleteFiles + addedDeleteFilesCount),
    'total-records': String(Math.max(0, finalTotalRecords)),
    'iceberg-version': '2.0.0',
    engine: 'Apache Iceberg Engine Simulator',
    'commit-desc': commitMsg || `MERGE INTO (${mode.toUpperCase()}): ${matchedUpdates.length} updated, ${unmatchedInserts.length} inserted on key '${matchKey}'`
  };

  const newSnapshot: IcebergSnapshot = {
    'sequence-number': newSequenceNumber,
    'snapshot-id': newSnapshotId,
    'parent-snapshot-id': parentSnapshotId,
    'timestamp-ms': Date.now(),
    summary: snapshotSummary,
    'manifest-list': manifestListPath,
    'schema-id': currentSchema['schema-id']
  };

  const newMetadata: IcebergTableMetadataV2 = {
    ...currentMetadata,
    'last-sequence-number': newSequenceNumber,
    'last-updated-ms': Date.now(),
    'current-snapshot-id': newSnapshotId,
    snapshots: [...currentMetadata.snapshots, newSnapshot],
    'snapshot-log': [
      ...currentMetadata['snapshot-log'],
      { 'timestamp-ms': Date.now(), 'snapshot-id': newSnapshotId }
    ],
    'metadata-log': [
      ...currentMetadata['metadata-log'],
      { 'timestamp-ms': Date.now(), 'metadata-file': newMetadataLocation }
    ]
  };

  newStorageObjects[newMetadataLocation] = {
    uri: newMetadataLocation,
    type: 'metadata',
    sizeBytes: 2048 + newMetadata.snapshots.length * 400,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  const durationMs = Math.max(0.1, parseFloat((performance.now() - startTime).toFixed(2)));
  const perfMetric: OperationPerformanceMetric = {
    id: `perf-${Date.now()}-${newSnapshotId}`,
    timestamp: Date.now(),
    operation: mode === 'mor' ? 'MERGE_MOR' : 'MERGE_COW',
    operationLabel: mode === 'mor' ? 'MERGE INTO (MoR)' : 'MERGE INTO (CoW)',
    mode,
    durationMs,
    recordsAffected: matchedUpdates.length + unmatchedInserts.length,
    filesWritten: addedDataFilesCount + addedDeleteFilesCount,
    filesRewritten: deletedDataFilesCount,
    filesRead: manifestList.length,
    bytesWritten: Object.values(newStorageObjects).reduce((a, b) => a + b.sizeBytes, 0),
    bytesRead: 0,
    reusedManifestCount: newManifestListEntries.filter(m => m.reused_from_snapshot_id).length,
    details: `MERGE INTO (${mode.toUpperCase()}): ${matchedUpdates.length} updated, ${unmatchedInserts.length} inserted on match key '${matchKey}'.`,
    efficiencyVerdict: mode === 'mor'
      ? `⚡ MoR Merge: High write efficiency (0 data files rewritten, appended ${addedDeleteFilesCount} delete & ${addedDataFilesCount} data files).`
      : `🐢 CoW Merge: Heavy write (rewrote ${deletedDataFilesCount} Parquet files). Zero query-time merge overhead.`
  };

  const insight: ArchitecturalInsight = {
    id: `insight-${Date.now()}-${newSnapshotId}`,
    timestamp: Date.now(),
    category: mode === 'mor' ? 'MOR' : 'COW',
    title: `MERGE INTO (Upsert) Committed (${mode.toUpperCase()}): ${matchedUpdates.length} Updated, ${unmatchedInserts.length} Inserted`,
    description: `Evaluated ${sourceRecords.length} incoming record(s) matching on key '${matchKey}'. Atomically committed snapshot S${newSequenceNumber}.`,
    technicalDetails: mode === 'mor'
      ? `MoR Merge wrote ${addedDeleteFilesCount} positional delete file(s) for updated rows and appended ${addedDataFilesCount} new Parquet file(s). Original files were not rewritten, providing high write throughput.`
      : `CoW Merge rewrote ${addedDataFilesCount} Parquet data file(s) absorbing updates and deleted ${deletedDataFilesCount} old file(s), avoiding read-time delete reconciliation overhead.`,
    metrics: {
      filesCreated: addedDataFilesCount + addedDeleteFilesCount,
      filesReused: newManifestListEntries.filter(m => m.reused_from_snapshot_id).length,
      storageBytes: Object.values(newStorageObjects).reduce((a, b) => a + b.sizeBytes, 0)
    }
  };

  return {
    catalogPointer: {
      ...state.catalogPointer,
      currentMetadataLocation: newMetadataLocation
    },
    metadataHistory: {
      ...state.metadataHistory,
      [newMetadataLocation]: newMetadata
    },
    manifestLists: {
      ...state.manifestLists,
      [manifestListPath]: newManifestListEntries
    },
    manifestFiles: {
      ...state.manifestFiles,
      ...newManifestFiles
    },
    dataFileStorage: {
      ...(state.dataFileStorage || {}),
      ...newDataFileStorage
    },
    storageObjects: {
      ...state.storageObjects,
      ...newStorageObjects
    },
    metricsHistory: [perfMetric, ...(state.metricsHistory || [])],
    lastOperationMetric: perfMetric,
    insights: [insight, ...state.insights]
  };
}

/**
 * Perform Compaction / Data File Rewrites (Lakehouse Maintenance)
 * Merges small data files and absorbs positional deletes.
 */
export function compactTable(
  state: TableState,
  commitMsg: string = 'Compaction / Rewrite Data Files'
): TableState {
  const startTime = performance.now();
  const currentMetadata = state.metadataHistory[state.catalogPointer.currentMetadataLocation];
  if (currentMetadata['current-snapshot-id'] === null) return state;

  const currentSnapshot = currentMetadata.snapshots.find(s => s['snapshot-id'] === currentMetadata['current-snapshot-id'])!;
  const manifestList = state.manifestLists[currentSnapshot['manifest-list']] || [];
  const currentSchema = currentMetadata.schemas.find(s => s['schema-id'] === currentMetadata['current-schema-id'])!;
  const partitionSpec = currentMetadata['partition-specs'].find(p => p['spec-id'] === currentMetadata['default-spec-id'])!;

  // Collect all active data files, positional deletes, and equality deletes
  const activeDataEntries: ManifestEntry[] = [];
  const activeDeletePositionsByFile: Record<string, Set<number>> = {};
  const activeEqualityDeletes: Array<{ equality_ids: number[]; rows: Record<string, any>[] }> = [];
  let deleteFilesCount = 0;

  manifestList.forEach(m => {
    const doc = state.manifestFiles[m.manifest_path];
    if (!doc) return;

    if (doc.content === 1) {
      // Delete manifest
      doc.entries.forEach(e => {
        if (e.status !== 2) {
          deleteFilesCount++;
          if (e.data_file.content === 1 && e.data_file.referenced_data_file && e.data_file.delete_positions) {
            const target = e.data_file.referenced_data_file;
            if (!activeDeletePositionsByFile[target]) {
              activeDeletePositionsByFile[target] = new Set();
            }
            e.data_file.delete_positions.forEach(pos => activeDeletePositionsByFile[target].add(pos));
          } else if (e.data_file.content === 2) {
            const eqRows = state.dataFileStorage?.[e.data_file.file_path]?.rows || [];
            activeEqualityDeletes.push({
              equality_ids: e.data_file.equality_ids || [],
              rows: eqRows
            });
          }
        }
      });
    } else {
      // Data manifest
      doc.entries.forEach(e => {
        if (e.status !== 2) {
          activeDataEntries.push(e);
        }
      });
    }
  });

  if (activeDataEntries.length <= 1 && deleteFilesCount === 0) {
    return state; // Nothing to compact
  }

  // Group surviving rows by partition, absorbing both positional and equality deletes
  const compactedPartitionBuckets: Record<string, { partitionMap: Record<string, any>; rows: Record<string, any>[] }> = {};

  activeDataEntries.forEach(entry => {
    const rows = getPhysicalRows(state, entry.data_file);
    const deletePositions = activeDeletePositionsByFile[entry.data_file.file_path] || new Set();

    rows.forEach((row, idx) => {
      if (deletePositions.has(idx)) return;

      // Check equality deletes
      const isDeletedByEquality = activeEqualityDeletes.some(eq =>
        eq.rows.some(eqRow => Object.keys(eqRow).every(k => eqRow[k] === row[k]))
      );
      if (isDeletedByEquality) return;

      const partMap = extractPartitionValues(row, partitionSpec.fields, currentSchema.fields);
      const key = Object.entries(partMap).map(([k, v]) => `${k}=${v}`).join('/') || 'unpartitioned';

      if (!compactedPartitionBuckets[key]) {
        compactedPartitionBuckets[key] = { partitionMap: partMap, rows: [] };
      }
      compactedPartitionBuckets[key].rows.push(row);
    });
  });

  const newSequenceNumber = currentMetadata['last-sequence-number'] + 1;
  const newSnapshotId = generateSnapshotId(newSequenceNumber);
  const parentSnapshotId = currentMetadata['current-snapshot-id'];
  const versionNum = Object.keys(state.metadataHistory).length + 1;
  const newMetadataLocation = `${currentMetadata.location}/metadata/v${versionNum}.metadata.json`;

  const newStorageObjects: Record<string, StorageObject> = {};
  const newDataFileStorage: Record<string, ParquetStorageFile> = {};
  const newManifestEntries: ManifestEntry[] = [];
  const compactedDataFiles: DataFileMetadata[] = [];
  let totalCompactedRecords = 0;

  // Mark all old data files as DELETED (status: 2)
  activeDataEntries.forEach(oldEntry => {
    newManifestEntries.push({
      status: 2, // DELETED
      snapshot_id: newSnapshotId,
      sequence_number: newSequenceNumber,
      data_file: oldEntry.data_file
    });
  });

  // Write new consolidated data files per partition
  Object.entries(compactedPartitionBuckets).forEach(([partKey, bucket], idx) => {
    const fileUuid = Math.random().toString(36).substring(2, 9);
    const compactedPath = `${currentMetadata.location}/data/${partKey}/compacted-${idx}-${fileUuid}.parquet`;
    const stats = computeColumnStats(bucket.rows, currentSchema.fields);

    // Per Apache Iceberg Spec v2, manifest entries ONLY contain file metadata and stats.
    const dfMeta: DataFileMetadata = {
      content: 0,
      file_path: compactedPath,
      file_format: 'PARQUET',
      partition: bucket.partitionMap,
      record_count: bucket.rows.length,
      file_size_in_bytes: stats.file_size_in_bytes,
      column_sizes: stats.column_sizes,
      value_counts: stats.value_counts,
      null_value_counts: stats.null_value_counts,
      lower_bounds: stats.lower_bounds,
      upper_bounds: stats.upper_bounds
    };

    compactedDataFiles.push(dfMeta);
    totalCompactedRecords += bucket.rows.length;

    // Physical Parquet file storage maintains the rows
    newDataFileStorage[compactedPath] = {
      file_path: compactedPath,
      file_format: 'PARQUET',
      content_type: 'data',
      record_count: bucket.rows.length,
      size_in_bytes: stats.file_size_in_bytes,
      rows: bucket.rows
    };

    newManifestEntries.push({
      status: 1, // ADDED
      snapshot_id: newSnapshotId,
      sequence_number: newSequenceNumber,
      data_file: dfMeta
    });

    newStorageObjects[compactedPath] = {
      uri: compactedPath,
      type: 'data',
      sizeBytes: stats.file_size_in_bytes,
      createdAt: Date.now(),
      isOrphan: false,
      referencedBySnapshots: [newSnapshotId]
    };
  });

  // Write new Manifest File
  const manifestUuid = Math.random().toString(36).substring(2, 9);
  const manifestFilePath = `${currentMetadata.location}/metadata/${manifestUuid}-compact-m0.avro`;
  const manifestDoc: ManifestFileDocument = {
    path: manifestFilePath,
    schema_id: currentSchema['schema-id'],
    partition_spec_id: partitionSpec['spec-id'],
    content: 0,
    entries: newManifestEntries
  };

  const manifestPartitionSummaries = computeManifestPartitionSummaries(compactedDataFiles, partitionSpec.fields);
  const manifestSize = 2048 + newManifestEntries.length * 256;

  newStorageObjects[manifestFilePath] = {
    uri: manifestFilePath,
    type: 'manifest',
    sizeBytes: manifestSize,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  // Build clean Manifest List without deletes
  const newManifestListEntries: ManifestListEntry[] = [
    {
      manifest_path: manifestFilePath,
      manifest_length: manifestSize,
      partition_spec_id: partitionSpec['spec-id'],
      content: 0,
      sequence_number: newSequenceNumber,
      min_sequence_number: newSequenceNumber,
      added_snapshot_id: newSnapshotId,
      added_data_files_count: compactedDataFiles.length,
      existing_data_files_count: 0,
      deleted_data_files_count: activeDataEntries.length,
      added_rows_count: totalCompactedRecords,
      existing_rows_count: 0,
      deleted_rows_count: activeDataEntries.reduce((s, e) => s + e.data_file.record_count, 0),
      partitions: manifestPartitionSummaries
    }
  ];

  const manifestListUuid = Math.random().toString(36).substring(2, 9);
  const manifestListPath = `${currentMetadata.location}/metadata/snap-${newSnapshotId}-${manifestListUuid}.avro`;
  const manifestListSize = 1024 + newManifestListEntries.length * 512;

  newStorageObjects[manifestListPath] = {
    uri: manifestListPath,
    type: 'manifest-list',
    sizeBytes: manifestListSize,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  const snapshotSummary: SnapshotSummary = {
    operation: 'replace',
    'deleted-data-files': String(activeDataEntries.length),
    'added-data-files': String(compactedDataFiles.length),
    'removed-delete-files': String(deleteFilesCount),
    'total-data-files': String(compactedDataFiles.length),
    'total-delete-files': '0',
    'total-records': String(totalCompactedRecords),
    'iceberg-version': '2.0.0',
    engine: 'Apache Iceberg Engine Simulator',
    'commit-desc': commitMsg
  };

  const newSnapshot: IcebergSnapshot = {
    'sequence-number': newSequenceNumber,
    'snapshot-id': newSnapshotId,
    'parent-snapshot-id': parentSnapshotId,
    'timestamp-ms': Date.now(),
    summary: snapshotSummary,
    'manifest-list': manifestListPath,
    'schema-id': currentSchema['schema-id']
  };

  const newMetadata: IcebergTableMetadataV2 = {
    ...currentMetadata,
    'last-sequence-number': newSequenceNumber,
    'last-updated-ms': Date.now(),
    'current-snapshot-id': newSnapshotId,
    snapshots: [...currentMetadata.snapshots, newSnapshot],
    'snapshot-log': [
      ...currentMetadata['snapshot-log'],
      { 'timestamp-ms': Date.now(), 'snapshot-id': newSnapshotId }
    ],
    'metadata-log': [
      ...currentMetadata['metadata-log'],
      { 'timestamp-ms': Date.now(), 'metadata-file': newMetadataLocation }
    ]
  };

  newStorageObjects[newMetadataLocation] = {
    uri: newMetadataLocation,
    type: 'metadata',
    sizeBytes: 2048 + newMetadata.snapshots.length * 400,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: [newSnapshotId]
  };

  const durationMs = Math.max(0.1, parseFloat((performance.now() - startTime).toFixed(2)));
  const perfMetric: OperationPerformanceMetric = {
    id: `perf-${Date.now()}-${newSnapshotId}`,
    timestamp: Date.now(),
    operation: 'COMPACT',
    operationLabel: 'COMPACT (Bin-Packing)',
    mode: 'replace',
    durationMs,
    recordsAffected: totalCompactedRecords,
    filesWritten: compactedDataFiles.length,
    filesRewritten: activeDataEntries.length,
    filesRead: manifestList.length,
    bytesWritten: Object.values(newStorageObjects).reduce((a, b) => a + b.sizeBytes, 0),
    bytesRead: 0,
    reusedManifestCount: 0,
    details: `Compacted ${activeDataEntries.length} data files and absorbed ${deleteFilesCount} delete file(s) into ${compactedDataFiles.length} clean Parquet file(s).`,
    efficiencyVerdict: `🧹 Compaction Complete: Purged all delete tombstones and consolidated small data files. Future queries run at optimal speed with direct scans.`
  };

  const insight: ArchitecturalInsight = {
    id: `insight-${Date.now()}-${newSnapshotId}`,
    timestamp: Date.now(),
    category: 'MAINTENANCE',
    title: `Table Compaction Complete: Replaced ${activeDataEntries.length} files with ${compactedDataFiles.length}`,
    description: `Consolidated small files and absorbed all positional & equality delete files into ${compactedDataFiles.length} optimized Parquet data file(s).`,
    technicalDetails: `Compaction replaces many small files and MoR delete tombstones with optimally-sized data files, dramatically speeding up subsequent query scan operations and resolving the small-file problem.`
  };

  return {
    catalogPointer: {
      ...state.catalogPointer,
      currentMetadataLocation: newMetadataLocation
    },
    metadataHistory: {
      ...state.metadataHistory,
      [newMetadataLocation]: newMetadata
    },
    manifestLists: {
      ...state.manifestLists,
      [manifestListPath]: newManifestListEntries
    },
    manifestFiles: {
      ...state.manifestFiles,
      [manifestFilePath]: manifestDoc
    },
    dataFileStorage: {
      ...(state.dataFileStorage || {}),
      ...newDataFileStorage
    },
    storageObjects: {
      ...state.storageObjects,
      ...newStorageObjects
    },
    metricsHistory: [perfMetric, ...(state.metricsHistory || [])],
    lastOperationMetric: perfMetric,
    insights: [insight, ...state.insights]
  };
}

/**
 * Expire historical snapshots
 */
export function expireSnapshots(
  state: TableState,
  snapshotIdsToExpire: number[]
): TableState {
  if (snapshotIdsToExpire.length === 0) return state;

  const currentMetadata = state.metadataHistory[state.catalogPointer.currentMetadataLocation];
  const remainingSnapshots = currentMetadata.snapshots.filter(
    s => !snapshotIdsToExpire.includes(s['snapshot-id'])
  );

  if (remainingSnapshots.length === 0) return state; // Prevent expiring all snapshots

  const versionNum = Object.keys(state.metadataHistory).length + 1;
  const newMetadataLocation = `${currentMetadata.location}/metadata/v${versionNum}.metadata.json`;

  const newMetadata: IcebergTableMetadataV2 = {
    ...currentMetadata,
    'last-updated-ms': Date.now(),
    snapshots: remainingSnapshots,
    'snapshot-log': currentMetadata['snapshot-log'].filter(sl => !snapshotIdsToExpire.includes(sl['snapshot-id'])),
    'metadata-log': [
      ...currentMetadata['metadata-log'],
      { 'timestamp-ms': Date.now(), 'metadata-file': newMetadataLocation }
    ]
  };

  // Re-calculate live snapshot references across storage objects
  const liveSnapshotIds = new Set(remainingSnapshots.map(s => s['snapshot-id']));
  const updatedStorage: Record<string, StorageObject> = {};

  Object.entries(state.storageObjects).forEach(([uri, obj]) => {
    const filteredRefs = obj.referencedBySnapshots.filter(id => liveSnapshotIds.has(id));
    const isOrphan = filteredRefs.length === 0 && obj.type !== 'metadata';

    updatedStorage[uri] = {
      ...obj,
      referencedBySnapshots: filteredRefs,
      isOrphan
    };
  });

  updatedStorage[newMetadataLocation] = {
    uri: newMetadataLocation,
    type: 'metadata',
    sizeBytes: 2048 + remainingSnapshots.length * 400,
    createdAt: Date.now(),
    isOrphan: false,
    referencedBySnapshots: Array.from(liveSnapshotIds)
  };

  const insight: ArchitecturalInsight = {
    id: `insight-${Date.now()}-expire`,
    timestamp: Date.now(),
    category: 'MAINTENANCE',
    title: `Expired ${snapshotIdsToExpire.length} Snapshot(s)`,
    description: `Removed snapshots [${snapshotIdsToExpire.join(', ')}] from metadata history. Unreferenced files are now flagged for orphan cleanup.`,
    technicalDetails: `Expiring snapshots prunes snapshot references from table metadata JSON. Files strictly belonging to expired snapshots become unreachable and safe for garbage collection.`
  };

  return {
    ...state,
    catalogPointer: {
      ...state.catalogPointer,
      currentMetadataLocation: newMetadataLocation
    },
    metadataHistory: {
      ...state.metadataHistory,
      [newMetadataLocation]: newMetadata
    },
    storageObjects: updatedStorage,
    insights: [insight, ...state.insights]
  };
}

/**
 * Purge Orphan Files (Lakehouse Garbage Collection)
 */
export function purgeOrphanFiles(state: TableState): {
  state: TableState;
  reclaimedFilesCount: number;
  reclaimedBytes: number;
} {
  const currentMetadata = state.metadataHistory[state.catalogPointer.currentMetadataLocation];

  // Determine all reachable files starting from active snapshots
  const reachableUris = new Set<string>();

  // Add all live metadata JSON files in metadata-log
  currentMetadata['metadata-log'].forEach(ml => reachableUris.add(ml['metadata-file']));

  currentMetadata.snapshots.forEach(s => {
    reachableUris.add(s['manifest-list']);
    const mList = state.manifestLists[s['manifest-list']] || [];
    mList.forEach(m => {
      reachableUris.add(m.manifest_path);
      const doc = state.manifestFiles[m.manifest_path];
      if (doc) {
        doc.entries.forEach(e => {
          if (e.status !== 2) {
            reachableUris.add(e.data_file.file_path);
          }
        });
      }
    });
  });

  let reclaimedFilesCount = 0;
  let reclaimedBytes = 0;
  const newStorage: Record<string, StorageObject> = {};

  Object.entries(state.storageObjects).forEach(([uri, obj]) => {
    if (reachableUris.has(uri)) {
      newStorage[uri] = {
        ...obj,
        isOrphan: false
      };
    } else {
      // Purge orphan file
      reclaimedFilesCount++;
      reclaimedBytes += obj.sizeBytes;
    }
  });

  const insight: ArchitecturalInsight = {
    id: `insight-${Date.now()}-purge`,
    timestamp: Date.now(),
    category: 'MAINTENANCE',
    title: `Purged ${reclaimedFilesCount} Orphan File(s)`,
    description: `Reclaimed ${(reclaimedBytes / 1024).toFixed(2)} KB of object storage by physically deleting unreferenced files.`,
    technicalDetails: `Orphan file cleanup scans object storage and removes data and manifest files that are no longer reachable from any snapshot in the table metadata tree.`
  };

  return {
    state: {
      ...state,
      storageObjects: newStorage,
      insights: [insight, ...state.insights]
    },
    reclaimedFilesCount,
    reclaimedBytes
  };
}

/**
 * Expire historical snapshots based on retention count policy (R_snap).
 * Retains the most recent `retainLastSnapshots` snapshots and prunes older ones.
 */
export function expireSnapshotsByRetention(
  state: TableState,
  retainLastSnapshots: number = 3
): TableState {
  const currentMetadata = state.metadataHistory[state.catalogPointer.currentMetadataLocation];
  const allSnapshots = currentMetadata.snapshots;

  // Need at least 2 snapshots total and more than retainLastSnapshots to expire
  if (allSnapshots.length <= 1 || allSnapshots.length <= retainLastSnapshots) {
    return state;
  }

  // The most recent `retainLastSnapshots` are kept; all older ones are expired
  const keepCount = Math.max(1, retainLastSnapshots);
  const snapshotsToExpire = allSnapshots.slice(0, allSnapshots.length - keepCount);
  const snapshotIdsToExpire = snapshotsToExpire.map(s => s['snapshot-id']);

  if (snapshotIdsToExpire.length === 0) return state;

  return expireSnapshots(state, snapshotIdsToExpire);
}

/**
 * Apply full Lakehouse Retention Policy (R_snap + optional orphan cleanup).
 */
export function applyTableRetentionPolicy(
  state: TableState,
  policy: {
    retainLastSnapshots: number;
    autoPurgeOrphans?: boolean;
  }
): TableState {
  let updatedState = expireSnapshotsByRetention(state, policy.retainLastSnapshots);

  if (policy.autoPurgeOrphans) {
    const purgeResult = purgeOrphanFiles(updatedState);
    updatedState = purgeResult.state;
  }

  return updatedState;
}

