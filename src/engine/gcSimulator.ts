// Apache Iceberg Snapshot Expiration & Orphan File Cleanup Engine
// Models daily transactions, multi-snapshot pinning, R_snap expiration, and R_orphan garbage collection.

export interface GCSnapshot {
  id: number;
  day: number;
  operation: 'APPEND' | 'UPDATE/DELETE';
  referencedFiles: string[];
  status: 'active' | 'expired';
  expiredAtDay?: number;
}

export interface GCStorageFile {
  id: string;
  createdDay: number;
  sizeMB: number;
  status: 'active' | 'obsolete' | 'orphan' | 'deleted';
  deletedAtDay?: number;
  deletionReason?: string;
  replacedBy?: string;
}

export interface GCMaintenanceLog {
  id: string;
  day: number;
  timestamp: string;
  category: 'EXPIRATION' | 'DATA_CLEANUP' | 'ORPHAN_CLEANUP' | 'ORPHAN_RETAINED' | 'SUMMARY' | 'OPERATION';
  message: string;
  details?: string;
}

export interface GCState {
  currentDay: number;
  retentionSnapDays: number; // R_snap
  retentionOrphanDays: number; // R_orphan
  workloadMode: 'append' | 'row_level';
  simulateCrashedWrite: boolean;
  snapshots: GCSnapshot[];
  storageFiles: GCStorageFile[];
  logs: GCMaintenanceLog[];
}

export function createInitialGCState(): GCState {
  const initialFile: GCStorageFile = {
    id: 'F1',
    createdDay: 1,
    sizeMB: 128,
    status: 'active'
  };

  const initialSnapshot: GCSnapshot = {
    id: 1,
    day: 1,
    operation: 'APPEND',
    referencedFiles: ['F1'],
    status: 'active'
  };

  const initialLog: GCMaintenanceLog = {
    id: 'log_init',
    day: 1,
    timestamp: new Date().toLocaleTimeString(),
    category: 'OPERATION',
    message: 'Table initialized on Day 1. Snapshot S1 committed referencing data file F1 (128 MB).'
  };

  return {
    currentDay: 1,
    retentionSnapDays: 7,
    retentionOrphanDays: 7,
    workloadMode: 'append',
    simulateCrashedWrite: true,
    snapshots: [initialSnapshot],
    storageFiles: [initialFile],
    logs: [initialLog]
  };
}

export function advanceDayOperation(state: GCState): GCState {
  const nextDay = state.currentDay + 1;
  const newStorageFiles = [...state.storageFiles];
  const newSnapshots = [...state.snapshots];
  const newLogs = [...state.logs];

  if (state.workloadMode === 'append') {
    // Pure Append Mode:
    // Generate new data file F{nextDay}
    const newFileId = `F${nextDay}`;
    const newFile: GCStorageFile = {
      id: newFileId,
      createdDay: nextDay,
      sizeMB: 128,
      status: 'active'
    };
    newStorageFiles.push(newFile);

    // Snapshot S{nextDay} references all active files cumulative from Day 1
    const prevActiveSnapshot = [...newSnapshots].reverse().find(s => s.status === 'active') || newSnapshots[newSnapshots.length - 1];
    const referencedFiles = Array.from(new Set([...prevActiveSnapshot.referencedFiles, newFileId]));

    const newSnapshot: GCSnapshot = {
      id: nextDay,
      day: nextDay,
      operation: 'APPEND',
      referencedFiles,
      status: 'active'
    };
    newSnapshots.push(newSnapshot);

    newLogs.unshift({
      id: `op_d${nextDay}_${Date.now()}`,
      day: nextDay,
      timestamp: new Date().toLocaleTimeString(),
      category: 'OPERATION',
      message: `Day ${nextDay} (Pure Append): Created data file ${newFileId} (128 MB). Snapshot S${nextDay} committed with ${referencedFiles.length} referenced files.`
    });
  } else {
    // Row-Level Operations Mode (UPDATE / DELETE / MERGE):
    // Pick an active file from latest snapshot to rewrite/replace
    const prevActiveSnapshot = [...newSnapshots].reverse().find(s => s.status === 'active') || newSnapshots[newSnapshots.length - 1];
    const currentFiles = prevActiveSnapshot.referencedFiles;

    // Pick candidate file to replace (e.g. oldest referenced file not already marked deleted)
    const targetFileId = currentFiles[Math.floor(Math.random() * currentFiles.length)] || `F${nextDay - 1}`;
    const baseName = targetFileId.replace(/_v\d+$/, '');
    const versionMatch = targetFileId.match(/_v(\d+)$/);
    const nextVer = versionMatch ? parseInt(versionMatch[1], 10) + 1 : 2;
    const replacementFileId = `${baseName}_v${nextVer}`;

    // Add replacement data file
    const replacementFile: GCStorageFile = {
      id: replacementFileId,
      createdDay: nextDay,
      sizeMB: 140,
      status: 'active'
    };
    newStorageFiles.push(replacementFile);

    // Also add a new delta data file for incoming appends
    const deltaFileId = `F${nextDay}`;
    const deltaFile: GCStorageFile = {
      id: deltaFileId,
      createdDay: nextDay,
      sizeMB: 112,
      status: 'active'
    };
    newStorageFiles.push(deltaFile);

    // New snapshot references: surviving files (excluding targetFileId) + replacementFileId + deltaFileId
    const newReferenced = currentFiles
      .filter(f => f !== targetFileId)
      .concat([replacementFileId, deltaFileId]);

    const newSnapshot: GCSnapshot = {
      id: nextDay,
      day: nextDay,
      operation: 'UPDATE/DELETE',
      referencedFiles: newReferenced,
      status: 'active'
    };
    newSnapshots.push(newSnapshot);

    // Update target file: mark replacement pointer
    const targetIdx = newStorageFiles.findIndex(f => f.id === targetFileId);
    if (targetIdx !== -1 && newStorageFiles[targetIdx].status === 'active') {
      newStorageFiles[targetIdx] = {
        ...newStorageFiles[targetIdx],
        replacedBy: replacementFileId
      };
    }

    // Crashed write job simulation (leaves orphan file untracked in snapshot)
    let orphanGeneratedId: string | null = null;
    if (state.simulateCrashedWrite && Math.random() > 0.25) {
      orphanGeneratedId = `F_orphan_d${nextDay}`;
      const orphanFile: GCStorageFile = {
        id: orphanGeneratedId,
        createdDay: nextDay,
        sizeMB: 96,
        status: 'orphan'
      };
      newStorageFiles.push(orphanFile);
    }

    newLogs.unshift({
      id: `op_d${nextDay}_${Date.now()}`,
      day: nextDay,
      timestamp: new Date().toLocaleTimeString(),
      category: 'OPERATION',
      message: `Day ${nextDay} (Row-Level Mutation): Replaced ${targetFileId} with ${replacementFileId} (140 MB) + added delta ${deltaFileId}. Committed Snapshot S${nextDay}.${
        orphanGeneratedId ? ` ⚠️ Simulated crashed write left uncommitted orphan ${orphanGeneratedId} on disk.` : ''
      }`
    });
  }

  return {
    ...state,
    currentDay: nextDay,
    snapshots: newSnapshots,
    storageFiles: newStorageFiles,
    logs: newLogs
  };
}

export function runMaintenance(state: GCState): GCState {
  const currentDay = state.currentDay;
  const snapCutoffDay = currentDay - state.retentionSnapDays;
  const orphanCutoffDay = currentDay - state.retentionOrphanDays;

  const newLogs: GCMaintenanceLog[] = [...state.logs];
  let expiredSnapCount = 0;
  let purgedDataFilesCount = 0;
  let purgedOrphanFilesCount = 0;
  let reclaimedBytesMB = 0;

  // 1. Expire Snapshots
  const updatedSnapshots = state.snapshots.map(s => {
    if (s.status === 'active' && s.day <= snapCutoffDay) {
      expiredSnapCount++;
      const age = currentDay - s.day;
      newLogs.unshift({
        id: `expire_s${s.id}_${Date.now()}_${Math.random()}`,
        day: currentDay,
        timestamp: new Date().toLocaleTimeString(),
        category: 'EXPIRATION',
        message: `Snapshot S${s.id} (Day ${s.day}) expired (age ${age}d > retention threshold ${state.retentionSnapDays}d). Removed from table metadata.`
      });
      return {
        ...s,
        status: 'expired' as const,
        expiredAtDay: currentDay
      };
    }
    return s;
  });

  // Calculate live (unexpired) referenced files
  const liveSnapshots = updatedSnapshots.filter(s => s.status === 'active');
  const liveReferencedFileIds = new Set<string>();
  liveSnapshots.forEach(s => {
    s.referencedFiles.forEach(f => liveReferencedFileIds.add(f));
  });

  // Expired referenced files (referenced by at least one snapshot, active or expired)
  const allReferencedFileIds = new Set<string>();
  updatedSnapshots.forEach(s => {
    s.referencedFiles.forEach(f => allReferencedFileIds.add(f));
  });

  // 2. Data File Cleanup & 3. Orphan File Cleanup
  const updatedStorageFiles = state.storageFiles.map(file => {
    // A) If already deleted, keep as is
    if (file.status === 'deleted') {
      return file;
    }

    // B) If it is an orphan file (untracked in any snapshot)
    if (file.status === 'orphan') {
      const age = currentDay - file.createdDay;
      if (file.createdDay <= orphanCutoffDay) {
        purgedOrphanFilesCount++;
        reclaimedBytesMB += file.sizeMB;
        newLogs.unshift({
          id: `orphan_purge_${file.id}_${Date.now()}`,
          day: currentDay,
          timestamp: new Date().toLocaleTimeString(),
          category: 'ORPHAN_CLEANUP',
          message: `Orphan file ${file.id} physically purged from storage (created Day ${file.createdDay}, age ${age}d >= threshold ${state.retentionOrphanDays}d). Reclaimed ${file.sizeMB} MB.`
        });
        return {
          ...file,
          status: 'deleted' as const,
          deletedAtDay: currentDay,
          deletionReason: `Orphan file age (${age}d) exceeded threshold (${state.retentionOrphanDays}d)`
        };
      } else {
        newLogs.unshift({
          id: `orphan_retain_${file.id}_${Date.now()}`,
          day: currentDay,
          timestamp: new Date().toLocaleTimeString(),
          category: 'ORPHAN_RETAINED',
          message: `Orphan file ${file.id} retained on storage (created Day ${file.createdDay}, age ${age}d < threshold ${state.retentionOrphanDays}d). Safe grace period.`
        });
        return file;
      }
    }

    // C) If it is a snapshot-tracked file (active or obsolete)
    const isPinnedByLiveSnapshot = liveReferencedFileIds.has(file.id);

    if (isPinnedByLiveSnapshot) {
      return {
        ...file,
        status: 'active' as const
      };
    } else {
      // Not referenced by ANY live snapshot!
      purgedDataFilesCount++;
      reclaimedBytesMB += file.sizeMB;
      newLogs.unshift({
        id: `data_purge_${file.id}_${Date.now()}`,
        day: currentDay,
        timestamp: new Date().toLocaleTimeString(),
        category: 'DATA_CLEANUP',
        message: `File ${file.id} physically purged from storage. No active snapshots reference it (all historical snapshots pinning it have expired). Reclaimed ${file.sizeMB} MB.`
      });
      return {
        ...file,
        status: 'deleted' as const,
        deletedAtDay: currentDay,
        deletionReason: 'Unreferenced by any active unexpired snapshot'
      };
    }
  });

  // Summary Log Entry
  newLogs.unshift({
    id: `summary_${Date.now()}`,
    day: currentDay,
    timestamp: new Date().toLocaleTimeString(),
    category: 'SUMMARY',
    message: `Maintenance Summary (Day ${currentDay}): Expired ${expiredSnapCount} snapshot(s). Purged ${purgedDataFilesCount} obsolete data file(s) and ${purgedOrphanFilesCount} orphan file(s). Total Storage Reclaimed: ${reclaimedBytesMB} MB.`
  });

  return {
    ...state,
    snapshots: updatedSnapshots,
    storageFiles: updatedStorageFiles,
    logs: newLogs
  };
}

export function resetGCState(workloadMode: 'append' | 'row_level' = 'append'): GCState {
  const initial = createInitialGCState();
  return {
    ...initial,
    workloadMode
  };
}
