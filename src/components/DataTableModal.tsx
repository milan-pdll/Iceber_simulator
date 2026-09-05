import React from 'react';
import { TableState } from '../engine/types';
import { Table as TableIcon, X, Layers } from 'lucide-react';
import { getFilename } from '../utils/formatting';

interface DataTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: TableState;
  activeSnapshotId: number | null;
}

export const DataTableModal: React.FC<DataTableModalProps> = ({
  isOpen,
  onClose,
  state,
  activeSnapshotId
}) => {
  if (!isOpen) return null;

  const currentMetadata = state.metadataHistory[state.catalogPointer.currentMetadataLocation];
  const targetSnap = activeSnapshotId !== null
    ? currentMetadata?.snapshots.find(s => s['snapshot-id'] === activeSnapshotId)
    : (currentMetadata?.snapshots[currentMetadata.snapshots.length - 1] || null);

  const manifestList = targetSnap ? state.manifestLists[targetSnap['manifest-list']] || [] : [];
  const currentSchema = currentMetadata?.schemas.find(s => s['schema-id'] === targetSnap?.['schema-id']) || currentMetadata?.schemas[0];

  const activeDeletePositionsByFile: Record<string, Set<number>> = {};
  const activeEqualityDeletes: Array<{ equality_ids: number[]; rows: Record<string, any>[] }> = [];
  const rowsByPartition: Record<string, Array<{ row: Record<string, any>; file: string; isDeletedMoR: boolean; deleteType?: 'positional' | 'equality'; rowPos: number }>> = {};

  manifestList.forEach(m => {
    const doc = state.manifestFiles[m.manifest_path];
    if (!doc) return;

    if (doc.content === 1) {
      doc.entries.forEach(e => {
        if (e.status !== 2) {
          if (e.data_file.content === 1 && e.data_file.referenced_data_file && e.data_file.delete_positions) {
            const target = e.data_file.referenced_data_file;
            if (!activeDeletePositionsByFile[target]) {
              activeDeletePositionsByFile[target] = new Set();
            }
            e.data_file.delete_positions.forEach(pos => activeDeletePositionsByFile[target].add(pos));
          } else if (e.data_file.content === 2) {
            const eqRows = state.dataFileStorage?.[e.data_file.file_path]?.rows || e.data_file.rows_data || [];
            activeEqualityDeletes.push({
              equality_ids: e.data_file.equality_ids || [],
              rows: eqRows
            });
          }
        }
      });
    }
  });

  manifestList.forEach(m => {
    const doc = state.manifestFiles[m.manifest_path];
    if (!doc || doc.content === 1) return;

    doc.entries.forEach(e => {
      if (e.status === 2) return;

      const partKey = Object.entries(e.data_file.partition)
        .map(([k, v]) => `${k}=${v}`)
        .join('/') || 'unpartitioned';

      if (!rowsByPartition[partKey]) {
        rowsByPartition[partKey] = [];
      }

      const rows = state.dataFileStorage?.[e.data_file.file_path]?.rows || e.data_file.rows_data || [];
      const delPositions = activeDeletePositionsByFile[e.data_file.file_path] || new Set();

      rows.forEach((row, idx) => {
        const isPosDeleted = delPositions.has(idx);
        const isEqDeleted = activeEqualityDeletes.some(eq =>
          eq.rows.some(eqRow => Object.keys(eqRow).every(k => eqRow[k] === row[k]))
        );

        rowsByPartition[partKey].push({
          row,
          file: getFilename(e.data_file.file_path),
          isDeletedMoR: isPosDeleted || isEqDeleted,
          deleteType: isPosDeleted ? 'positional' : (isEqDeleted ? 'equality' : undefined),
          rowPos: idx
        });
      });
    });
  });

  const columns = currentSchema ? currentSchema.fields.map(f => f.name) : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155] rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="h-16 border-b border-slate-200 dark:border-[#334155] px-6 flex items-center justify-between bg-[#FAFAFA] dark:bg-[#1E293B]">
          <div className="flex items-center space-x-3.5">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 shadow-sm">
              <TableIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-calistoga tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span>Live Table Dataset Grid</span>
                <span className="section-label py-0.5 px-2.5 text-[10px]">
                  {state.catalogPointer.tableIdentifier}
                </span>
              </h2>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Current Snapshot: S{targetSnap ? targetSnap['sequence-number'] : 0} • Partitioned Dataset
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-[#0F172A] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Table */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {Object.keys(rowsByPartition).length > 0 ? (
            Object.entries(rowsByPartition).map(([partKey, rowItems]) => (
              <div key={partKey} className="space-y-2.5">
                <div className="flex items-center space-x-2 text-xs font-mono text-[#0052FF] dark:text-[#4D7CFF]">
                  <Layers className="w-4 h-4" />
                  <span className="font-bold">Partition:</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#0052FF]/10 text-[#0052FF] dark:text-[#4D7CFF] border border-[#0052FF]/20 font-semibold">
                    {partKey}
                  </span>
                  <span className="text-slate-400 text-[11px]">({rowItems.length} records)</span>
                </div>

                <div className="border border-slate-200 dark:border-[#334155] rounded-xl overflow-hidden bg-white dark:bg-[#0F172A] shadow-sm">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-50 dark:bg-[#1E293B] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-[#334155]">
                      <tr>
                        {columns.map(col => (
                          <th key={col} className="p-3 font-semibold">{col}</th>
                        ))}
                        <th className="p-3 font-semibold text-slate-600 dark:text-slate-400">Source Parquet</th>
                        <th className="p-3 font-semibold text-slate-600 dark:text-slate-400">MoR State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                      {rowItems.map((item, idx) => (
                        <tr
                          key={idx}
                          className={`hover:bg-slate-50 dark:hover:bg-[#1E293B]/40 transition-colors ${
                            item.isDeletedMoR ? 'bg-rose-50 dark:bg-rose-950/20 opacity-60' : ''
                          }`}
                        >
                          {columns.map(col => (
                            <td
                              key={col}
                              className={`p-3 truncate max-w-[150px] ${
                                item.isDeletedMoR ? 'line-through text-rose-600 dark:text-rose-400' : ''
                              }`}
                            >
                              {String(item.row[col] !== undefined ? item.row[col] : '-')}
                            </td>
                          ))}
                          <td className="p-3 text-[11px] text-[#0052FF] dark:text-[#4D7CFF] font-mono truncate max-w-[160px]">
                            {item.file}
                          </td>
                          <td className="p-3">
                            {item.isDeletedMoR ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40">
                                {item.deleteType === 'equality' ? 'MoR Eq Delete' : 'MoR Pos Delete'}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40">
                                Active Live
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-slate-400 space-y-2 font-mono text-xs">
              <TableIcon className="w-8 h-8 text-slate-300 dark:text-slate-600" />
              <span>No records in the table yet.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataTableModal;
