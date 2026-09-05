import {
  TableState,
  QueryExecutionResult,
  PruningStageTrace,
  ManifestEntry
} from './types';
import {
  parseSimpleSqlPredicates,
  canPruneManifestByPartition,
  canPruneDataFileByColumnStats,
  matchesRowPredicates
} from './statsUtils';

/**
 * Simulate Lakehouse Query Engine Execution with Two-Tier Pruning (Trino / Spark / DuckDB style)
 */
export function executeQuerySimulation(
  state: TableState,
  sqlQuery: string,
  targetSnapshotId?: number | null
): QueryExecutionResult {
  const startTime = performance.now();
  const traces: PruningStageTrace[] = [];

  // 1. Stage 1: Catalog Pointer Lookup
  const currentMetadataUri = state.catalogPointer.currentMetadataLocation;
  const currentMetadata = state.metadataHistory[currentMetadataUri];

  traces.push({
    stage: 1,
    name: 'Catalog Pointer Lookup',
    description: `Catalog resolved table '${state.catalogPointer.tableIdentifier}' to active metadata pointer '${currentMetadataUri}'.`,
    status: 'passed',
    details: [
      `Catalog: In-Memory REST / Hive / Nessie Catalog`,
      `Resolved Pointer: ${currentMetadataUri}`,
      `Format Version: ${currentMetadata['format-version']}`,
      `Total Historical Snapshots: ${currentMetadata.snapshots.length}`
    ]
  });

  // 2. Stage 2: Snapshot Resolution
  const effectiveSnapshotId = (targetSnapshotId !== undefined && targetSnapshotId !== null)
    ? targetSnapshotId
    : currentMetadata['current-snapshot-id'];
  if (effectiveSnapshotId === null || effectiveSnapshotId === undefined) {
    traces.push({
      stage: 2,
      name: 'Snapshot Resolution',
      description: 'Table is empty with no committed snapshots.',
      status: 'passed',
      details: ['No snapshots available to query.']
    });

    return {
      sql: sqlQuery,
      snapshotId: 0,
      executionTimeMs: Math.round(performance.now() - startTime),
      stages: traces,
      matchingRows: [],
      totalDataFiles: 0,
      scannedDataFiles: 0,
      skippedDataFiles: 0,
      totalManifests: 0,
      scannedManifests: 0,
      skippedManifests: 0,
      ioAvoidancePercentage: 0,
      prunedManifestPaths: [],
      scannedManifestPaths: [],
      prunedDataFilePaths: [],
      scannedDataFilePaths: []
    };
  }

  const snapshot = currentMetadata.snapshots.find(s => s['snapshot-id'] === effectiveSnapshotId);
  if (!snapshot) {
    throw new Error(`Snapshot ID ${effectiveSnapshotId} not found in metadata.`);
  }

  const manifestListPath = snapshot['manifest-list'];
  const manifestList = state.manifestLists[manifestListPath] || [];

  traces.push({
    stage: 2,
    name: 'Snapshot Resolution',
    description: `Targeted Snapshot S${snapshot['sequence-number']} (ID: ${snapshot['snapshot-id']}) -> Loaded Manifest List '${manifestListPath}'.`,
    status: 'passed',
    details: [
      `Snapshot ID: ${snapshot['snapshot-id']}`,
      `Sequence Number: ${snapshot['sequence-number']}`,
      `Operation: ${snapshot.summary.operation.toUpperCase()}`,
      `Manifest List URI: ${manifestListPath}`,
      `Total Manifest References in List: ${manifestList.length}`
    ]
  });

  // Parse SQL Predicates from WHERE clause
  const whereMatch = sqlQuery.match(/WHERE\s+(.+?)(?:ORDER|LIMIT|GROUP|$)/i);
  const whereClause = whereMatch ? whereMatch[1] : '';
  const predicates = parseSimpleSqlPredicates(whereClause);

  const currentSchema = currentMetadata.schemas.find(s => s['schema-id'] === snapshot['schema-id']) || currentMetadata.schemas[0];
  const partitionSpec = currentMetadata['partition-specs'].find(p => p['spec-id'] === currentMetadata['default-spec-id']) || currentMetadata['partition-specs'][0];

  // 3. Stage 3: Partition Pruning (Manifest List Level)
  const prunedManifestPaths: string[] = [];
  const scannedManifestPaths: string[] = [];
  const stage3Details: string[] = [];

  manifestList.forEach(m => {
    // Check if partition summary bounds exclude the predicate
    if (m.content === 1) {
      // Positional deletes manifest - must be scanned if data files exist
      scannedManifestPaths.push(m.manifest_path);
      stage3Details.push(`[Scanned] Delete Manifest '${m.manifest_path.split('/').pop()}' (Required for positional MoR reconciliation).`);
      return;
    }

    const pruneResult = canPruneManifestByPartition(
      m.partitions,
      predicates,
      partitionSpec.fields,
      currentSchema.fields
    );

    if (pruneResult.canPrune) {
      prunedManifestPaths.push(m.manifest_path);
      stage3Details.push(`[SKIPPED] Manifest '${m.manifest_path.split('/').pop()}': ${pruneResult.reason}`);
    } else {
      scannedManifestPaths.push(m.manifest_path);
      stage3Details.push(`[Scanned] Manifest '${m.manifest_path.split('/').pop()}': Partition bounds overlap query filter.`);
    }
  });

  traces.push({
    stage: 3,
    name: 'Partition Pruning (Manifest List Level)',
    description: `Evaluated partition summary bounds across ${manifestList.length} manifest(s). Pruned ${prunedManifestPaths.length} manifest(s) from network I/O.`,
    status: prunedManifestPaths.length > 0 ? 'pruned' : 'scanned',
    manifestsEvaluated: manifestList.length,
    manifestsSkipped: prunedManifestPaths.length,
    manifestsKept: scannedManifestPaths.length,
    details: stage3Details
  });

  // 4. Stage 4: Column Stats Min/Max Metrics Pruning (Manifest File Level)
  const prunedDataFilePaths: string[] = [];
  const scannedDataFilePaths: string[] = [];
  const stage4Details: string[] = [];

  const candidateDataEntries: ManifestEntry[] = [];
  const activeDeletePositionsByFile: Record<string, Set<number>> = {};
  const activeEqualityDeletes: Array<{
    file_path: string;
    equality_ids: number[];
    equality_rows: Record<string, any>[];
  }> = [];
  let totalDataFilesEvaluated = 0;

  scannedManifestPaths.forEach(mPath => {
    const doc = state.manifestFiles[mPath];
    if (!doc) return;

    if (doc.content === 1) {
      // Delete manifest entries (Positional: content 1, Equality: content 2)
      doc.entries.forEach(e => {
        if (e.status === 2) return;
        if (e.data_file.content === 1 && e.data_file.referenced_data_file && e.data_file.delete_positions) {
          const target = e.data_file.referenced_data_file;
          if (!activeDeletePositionsByFile[target]) {
            activeDeletePositionsByFile[target] = new Set();
          }
          e.data_file.delete_positions.forEach(pos => activeDeletePositionsByFile[target].add(pos));
        } else if (e.data_file.content === 2) {
          const eqStorage = state.dataFileStorage?.[e.data_file.file_path];
          const eqRows = eqStorage?.rows || e.data_file.rows_data || [];
          activeEqualityDeletes.push({
            file_path: e.data_file.file_path,
            equality_ids: e.data_file.equality_ids || [],
            equality_rows: eqRows
          });
        }
      });
      return;
    }

    // Data manifest entries
    doc.entries.forEach(entry => {
      if (entry.status === 2) return; // Deleted in this snapshot

      totalDataFilesEvaluated++;
      const dataFile = entry.data_file;
      const pruneResult = canPruneDataFileByColumnStats(dataFile, predicates, currentSchema.fields);

      if (pruneResult.canPrune) {
        prunedDataFilePaths.push(dataFile.file_path);
        stage4Details.push(`[SKIPPED] Parquet '${dataFile.file_path.split('/').pop()}': ${pruneResult.reason}`);
      } else {
        candidateDataEntries.push(entry);
        scannedDataFilePaths.push(dataFile.file_path);
        stage4Details.push(`[Scanned] Parquet '${dataFile.file_path.split('/').pop()}': Column stats overlap filter (${dataFile.record_count} records).`);
      }
    });
  });

  traces.push({
    stage: 4,
    name: 'Column Stats Pruning (Manifest File Level)',
    description: `Inspected Parquet column min/max metrics. Skipped ${prunedDataFilePaths.length} data file(s) without reading storage bytes.`,
    status: prunedDataFilePaths.length > 0 ? 'pruned' : 'scanned',
    filesEvaluated: totalDataFilesEvaluated,
    filesSkipped: prunedDataFilePaths.length,
    filesKept: candidateDataEntries.length,
    details: stage4Details
  });

  // 5. Stage 5: Data File Scan & MoR Delete Reconciliation (Positional + Equality)
  const matchingRows: Record<string, any>[] = [];
  let recordsEvaluatedCount = 0;
  let deletesAppliedCount = 0;
  let equalityDeletesAppliedCount = 0;
  const stage5Details: string[] = [];

  candidateDataEntries.forEach(entry => {
    const dataFile = entry.data_file;
    // Read physical rows from Parquet file storage (fallback to dataFile.rows_data)
    const rawRows = state.dataFileStorage?.[dataFile.file_path]?.rows || dataFile.rows_data || [];
    const deletePositions = activeDeletePositionsByFile[dataFile.file_path] || new Set();

    let fileMatchedCount = 0;
    let filePosDeletedCount = 0;
    let fileEqDeletedCount = 0;

    rawRows.forEach((row, idx) => {
      recordsEvaluatedCount++;

      // Check MoR positional tombstone
      if (deletePositions.has(idx)) {
        filePosDeletedCount++;
        deletesAppliedCount++;
        return; // Filtered out by Merge-on-Read positional delete
      }

      // Check MoR equality tombstone
      const isDeletedByEquality = activeEqualityDeletes.some(eq =>
        eq.equality_rows.some(eqRow => Object.keys(eqRow).every(k => eqRow[k] === row[k]))
      );
      if (isDeletedByEquality) {
        fileEqDeletedCount++;
        equalityDeletesAppliedCount++;
        return; // Filtered out by Merge-on-Read equality delete
      }

      // Check row predicate match
      if (matchesRowPredicates(row, predicates)) {
        matchingRows.push({
          ...row,
          __file_source: dataFile.file_path.split('/').pop()
        });
        fileMatchedCount++;
      }
    });

    stage5Details.push(`Read '${dataFile.file_path.split('/').pop()}': ${rawRows.length} raw rows -> ${filePosDeletedCount} positional, ${fileEqDeletedCount} equality deletes subtracted -> ${fileMatchedCount} rows matched query.`);
  });

  traces.push({
    stage: 5,
    name: 'Data File Scan & MoR Reconciliation',
    description: `Read surviving ${candidateDataEntries.length} Parquet file(s), applied ${deletesAppliedCount} positional & ${equalityDeletesAppliedCount} equality delete(s), returned ${matchingRows.length} record(s).`,
    status: 'scanned',
    recordsEvaluated: recordsEvaluatedCount,
    recordsReturned: matchingRows.length,
    deletesAppliedCount,
    equalityDeletesAppliedCount,
    details: stage5Details
  });

  const totalFiles = totalDataFilesEvaluated + prunedManifestPaths.length;
  const skippedFiles = prunedDataFilePaths.length + prunedManifestPaths.length;
  const ioAvoidancePercentage = totalFiles > 0 ? Math.round((skippedFiles / totalFiles) * 100) : 100;
  const execTime = Math.max(0.1, parseFloat((performance.now() - startTime).toFixed(2)));
  const totalDeletes = deletesAppliedCount + equalityDeletesAppliedCount;

  const queryPerfMetric = {
    id: `perf-query-${Date.now()}`,
    timestamp: Date.now(),
    operation: 'QUERY' as const,
    operationLabel: 'QUERY (SELECT Scan)',
    mode: 'query' as const,
    durationMs: execTime,
    recordsAffected: matchingRows.length,
    filesWritten: 0,
    filesRewritten: 0,
    filesRead: candidateDataEntries.length,
    bytesWritten: 0,
    bytesRead: candidateDataEntries.reduce((acc, e) => acc + e.data_file.file_size_in_bytes, 0),
    reusedManifestCount: 0,
    details: `Scanned ${candidateDataEntries.length} Parquet file(s) in ${execTime}ms. Evaluated ${recordsEvaluatedCount} row(s), pruned ${prunedDataFilePaths.length} file(s). Applied ${deletesAppliedCount} positional & ${equalityDeletesAppliedCount} equality delete(s).`,
    efficiencyVerdict: totalDeletes > 0
      ? `MoR Read Overhead: Reconciled ${totalDeletes} delete tombstone(s) at query time. Consider running compaction to eliminate read merge overhead.`
      : `Optimal Read: Direct scan with 0 delete tombstones to reconcile (Clean / CoW read).`
  };

  return {
    sql: sqlQuery,
    snapshotId: snapshot['snapshot-id'],
    executionTimeMs: execTime,
    stages: traces,
    matchingRows,
    totalDataFiles: totalDataFilesEvaluated,
    scannedDataFiles: candidateDataEntries.length,
    skippedDataFiles: prunedDataFilePaths.length,
    totalManifests: manifestList.length,
    scannedManifests: scannedManifestPaths.length,
    skippedManifests: prunedManifestPaths.length,
    ioAvoidancePercentage,
    prunedManifestPaths,
    scannedManifestPaths,
    prunedDataFilePaths,
    scannedDataFilePaths,
    performanceMetric: queryPerfMetric
  };
}
