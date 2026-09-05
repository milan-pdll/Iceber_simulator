import React, { useState } from 'react';
import { SelectedNodeType } from './LineageGraphCanvas';
import { TableState } from '../engine/types';
import {
  FileJson,
  Copy,
  Check,
  X,
  Database,
  Camera,
  ListTree,
  FileSpreadsheet,
  FileCode,
  FileX2,
  HardDrive
} from 'lucide-react';
import { formatBytes, formatTimestamp, getFilename } from '../utils/formatting';
import { syntaxHighlightJson } from '../utils/syntaxHighlight';

interface MetadataInspectorProps {
  selectedNode: SelectedNodeType | null;
  onClose: () => void;
  state?: TableState;
  onOpenFullMetadata?: () => void;
}

export const MetadataInspector: React.FC<MetadataInspectorProps> = ({
  selectedNode,
  onClose,
  state,
  onOpenFullMetadata
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'json' | 'stats' | 'rows' | 'storage'>('summary');
  const [copied, setCopied] = useState<boolean>(false);

  const jsonPayload = React.useMemo(() => {
    if (!selectedNode) return {};
    switch (selectedNode.type) {
      case 'catalog':
        return {
          catalog: 'Apache Iceberg REST / In-Memory Catalog',
          'table-identifier': selectedNode.data.tableIdentifier,
          'current-metadata-location': selectedNode.data.location
        };
      case 'metadata':
        return selectedNode.data;
      case 'snapshot':
        return selectedNode.data;
      case 'manifest-list':
        return selectedNode.data;
      case 'manifest-file': {
        // Per Apache Iceberg Spec v2, manifest files strictly contain file stats & bounds without rows.
        const doc = selectedNode.data;
        if (!doc || !doc.entries) return doc;
        return {
          path: doc.path,
          schema_id: doc.schema_id,
          partition_spec_id: doc.partition_spec_id,
          content: doc.content === 1 ? '1 (DELETES)' : '0 (DATA)',
          entries: doc.entries.map((e: any) => ({
            status: e.status === 1 ? '1 (ADDED)' : (e.status === 2 ? '2 (DELETED)' : '0 (EXISTING)'),
            snapshot_id: e.snapshot_id,
            sequence_number: e.sequence_number,
            data_file: {
              content: e.data_file.content === 1 ? '1 (POSITION_DELETES)' : (e.data_file.content === 2 ? '2 (EQUALITY_DELETES)' : '0 (DATA)'),
              file_path: e.data_file.file_path,
              file_format: e.data_file.file_format,
              partition: e.data_file.partition,
              record_count: e.data_file.record_count,
              file_size_in_bytes: e.data_file.file_size_in_bytes,
              column_sizes: e.data_file.column_sizes,
              value_counts: e.data_file.value_counts,
              null_value_counts: e.data_file.null_value_counts,
              lower_bounds: e.data_file.lower_bounds,
              upper_bounds: e.data_file.upper_bounds,
              ...(e.data_file.equality_ids ? { equality_ids: e.data_file.equality_ids } : {}),
              ...(e.data_file.referenced_data_file ? { referenced_data_file: e.data_file.referenced_data_file } : {}),
              ...(e.data_file.delete_positions ? { delete_positions: e.data_file.delete_positions } : {})
            }
          }))
        };
      }
      case 'data-file':
        return selectedNode.data;
      case 'delete-file':
        return selectedNode.data;
      default:
        return {};
    }
  }, [selectedNode]);

  if (!selectedNode) return null;

  const jsonString = JSON.stringify(jsonPayload, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getTitle = () => {
    switch (selectedNode.type) {
      case 'catalog':
        return 'Catalog Pointer';
      case 'metadata':
        return 'Table Metadata JSON';
      case 'snapshot':
        return `Snapshot S${selectedNode.data['sequence-number']}`;
      case 'manifest-list':
        return 'Manifest List (.avro)';
      case 'manifest-file':
        return selectedNode.data?.content === 1 ? 'Delete Manifest (.avro)' : 'Manifest File (.avro)';
      case 'data-file':
        return 'Data File (.parquet)';
      case 'delete-file':
        return selectedNode.data?.data_file?.content === 2 ? 'Equality Delete (.parquet)' : 'Positional Delete (.delete)';
    }
  };

  const getNodeIcon = () => {
    switch (selectedNode.type) {
      case 'catalog':
        return <Database className="w-5 h-5 text-amber-500" />;
      case 'metadata':
        return <FileJson className="w-5 h-5 text-[#0052FF] dark:text-[#4D7CFF]" />;
      case 'snapshot':
        return <Camera className="w-5 h-5 text-purple-500" />;
      case 'manifest-list':
        return <ListTree className="w-5 h-5 text-sky-500" />;
      case 'manifest-file':
        return <FileSpreadsheet className="w-5 h-5 text-teal-500" />;
      case 'data-file':
        return <FileCode className="w-5 h-5 text-emerald-500" />;
      case 'delete-file':
        return <FileX2 className="w-5 h-5 text-rose-500" />;
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] lg:w-[580px] bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-xl border-l border-slate-200 dark:border-[#334155] shadow-2xl flex flex-col z-50 select-none transition-colors duration-200">
      {/* Header */}
      <div className="h-16 border-b border-slate-200 dark:border-[#334155] px-5 flex items-center justify-between bg-[#FAFAFA] dark:bg-[#1E293B]">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-[#0052FF]/10 dark:bg-[#0052FF]/20 border border-[#0052FF]/20 shadow-sm">
            {getNodeIcon()}
          </div>
          <div>
            <h3 className="text-base font-calistoga tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <span>{getTitle()}</span>
              <span className="section-label py-0.5 px-2 text-[10px]">
                Spec v2
              </span>
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate block max-w-sm">
              {selectedNode.type === 'catalog' ? selectedNode.data.tableIdentifier : ('path' in selectedNode ? selectedNode.path : ('location' in selectedNode ? selectedNode.location : 'Snapshot Object'))}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {onOpenFullMetadata && (selectedNode.type === 'metadata' || selectedNode.type === 'catalog') && (
            <button
              onClick={onOpenFullMetadata}
              className="btn-signature-primary px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              title="Open full table metadata explorer modal"
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>Full View</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-[#0F172A] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={`grid ${(selectedNode.type === 'data-file' || selectedNode.type === 'delete-file') ? 'grid-cols-5' : 'grid-cols-4'} bg-slate-100 dark:bg-[#1E293B] border-b border-slate-200 dark:border-[#334155] px-2 pt-1 text-xs font-mono`}>
        <button
          onClick={() => setActiveTab('summary')}
          className={`py-2.5 font-medium border-b-2 transition-all uppercase tracking-wider text-[11px] ${
            activeTab === 'summary'
              ? 'border-[#0052FF] text-[#0052FF] dark:text-[#4D7CFF] font-semibold'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('json')}
          className={`py-2.5 font-medium border-b-2 transition-all uppercase tracking-wider text-[11px] ${
            activeTab === 'json'
              ? 'border-[#0052FF] text-[#0052FF] dark:text-[#4D7CFF] font-semibold'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Raw Spec
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`py-2.5 font-medium border-b-2 transition-all uppercase tracking-wider text-[11px] ${
            activeTab === 'stats'
              ? 'border-[#0052FF] text-[#0052FF] dark:text-[#4D7CFF] font-semibold'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Bounds
        </button>
        {(selectedNode.type === 'data-file' || selectedNode.type === 'delete-file') && (
          <button
            onClick={() => setActiveTab('rows')}
            className={`py-2.5 font-medium border-b-2 transition-all uppercase tracking-wider text-[11px] ${
              activeTab === 'rows'
                ? 'border-[#0052FF] text-[#0052FF] dark:text-[#4D7CFF] font-semibold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Rows
          </button>
        )}
        <button
          onClick={() => setActiveTab('storage')}
          className={`py-2.5 font-medium border-b-2 transition-all uppercase tracking-wider text-[11px] ${
            activeTab === 'storage'
              ? 'border-[#0052FF] text-[#0052FF] dark:text-[#4D7CFF] font-semibold'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Storage
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* ================= TAB 1: SUMMARY ================= */}
        {activeTab === 'summary' && (
          <div className="space-y-4">
            {selectedNode.type === 'catalog' && (
              <div className="card-signature p-4 space-y-3">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300 font-mono uppercase tracking-wider">Catalog Decoupling Principles</span>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  In Apache Iceberg, the catalog merely tracks the atomic pointer to the current table metadata JSON file. Unlike Hive Metastore (HMS), table transactions do not take database locks or require directory partition rewrites.
                </p>
                <div className="p-3 bg-slate-50 dark:bg-[#0F172A] rounded-xl border border-slate-200 dark:border-[#334155] space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Table Identifier:</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold">{selectedNode.data.tableIdentifier}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Current Metadata Pointer:</span>
                    <span className="text-[#0052FF] dark:text-[#4D7CFF] font-semibold truncate max-w-[240px]">{getFilename(selectedNode.data.location)}</span>
                  </div>
                </div>
              </div>
            )}

            {selectedNode.type === 'metadata' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="card-signature p-3.5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Format Version</span>
                    <span className="text-sm font-bold text-[#0052FF] dark:text-[#4D7CFF] block font-mono mt-0.5">
                      v{selectedNode.data['format-version']} (Row-Level Deletes)
                    </span>
                  </div>
                  <div className="card-signature p-3.5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Last Sequence Number</span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 block font-mono mt-0.5">
                      #{selectedNode.data['last-sequence-number']}
                    </span>
                  </div>
                </div>

                <div className="card-signature p-4 space-y-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-calistoga">Table UUID &amp; Schema Catalog</span>
                  <div className="p-3 bg-slate-50 dark:bg-[#0F172A] rounded-xl border border-slate-200 dark:border-[#334155] text-xs font-mono text-slate-700 dark:text-slate-300 space-y-1.5">
                    <div>UUID: <span className="text-[#0052FF] dark:text-[#4D7CFF]">{selectedNode.data['table-uuid']}</span></div>
                    <div>Location: <span className="text-slate-500 dark:text-slate-400 truncate block">{selectedNode.data.location}</span></div>
                    <div>Total Snapshots in History: <span className="text-amber-600 dark:text-amber-400 font-bold">{selectedNode.data.snapshots?.length}</span></div>
                  </div>
                </div>
              </div>
            )}

            {selectedNode.type === 'snapshot' && (
              <div className="space-y-3">
                <div className="card-signature p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-700 dark:text-purple-300 font-mono uppercase tracking-wider">
                      Snapshot #{selectedNode.data['sequence-number']}
                    </span>
                    <span className="section-label py-0.5 px-2 text-[10px]">
                      {selectedNode.data.summary?.operation.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                    <div className="p-2.5 bg-slate-50 dark:bg-[#0F172A] rounded-xl border border-slate-200 dark:border-[#334155]">
                      <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Files</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">{selectedNode.data.summary?.['total-data-files']}</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 dark:bg-[#0F172A] rounded-xl border border-slate-200 dark:border-[#334155]">
                      <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Deletes</span>
                      <span className="font-bold text-rose-600 dark:text-rose-400 text-sm">{selectedNode.data.summary?.['total-delete-files'] || 0}</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 dark:bg-[#0F172A] rounded-xl border border-slate-200 dark:border-[#334155]">
                      <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Records</span>
                      <span className="font-bold text-[#0052FF] dark:text-[#4D7CFF] text-sm">{selectedNode.data.summary?.['total-records']}</span>
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 space-y-1 pt-1 border-t border-slate-100 dark:border-[#334155]">
                    <div>Committed: {formatTimestamp(selectedNode.data['timestamp-ms'])}</div>
                    <div>Parent Snapshot: {selectedNode.data['parent-snapshot-id'] ? String(selectedNode.data['parent-snapshot-id']) : 'None (Table Root)'}</div>
                    <div>Manifest List: <span className="text-[#0052FF] dark:text-[#4D7CFF]">{getFilename(selectedNode.data['manifest-list'])}</span></div>
                  </div>
                </div>
              </div>
            )}

            {(selectedNode.type === 'data-file' || selectedNode.type === 'delete-file') && (
              <div className="space-y-3">
                <div className="card-signature p-4 space-y-2.5">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-calistoga">Parquet Physical Properties</span>
                  <div className="p-3 bg-slate-50 dark:bg-[#0F172A] rounded-xl border border-slate-200 dark:border-[#334155] text-xs font-mono space-y-1.5 text-slate-700 dark:text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">File Format:</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">{selectedNode.data.data_file?.file_format || 'PARQUET'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Record Count:</span>
                      <span className="text-slate-900 dark:text-white font-bold">{selectedNode.data.data_file?.record_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">File Size:</span>
                      <span className="text-amber-600 dark:text-amber-400 font-bold">{formatBytes(selectedNode.data.data_file?.file_size_in_bytes || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Partition Key:</span>
                      <span className="text-[#0052FF] dark:text-[#4D7CFF]">{JSON.stringify(selectedNode.data.data_file?.partition || {})}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: SPEC JSON ================= */}
        {activeTab === 'json' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                Official Apache Iceberg Spec v2 Payload
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#1E293B] hover:border-[#0052FF]/40 border border-slate-200 dark:border-[#334155] text-slate-800 dark:text-slate-200 text-xs font-medium transition-all shadow-sm"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#0052FF]" />}
                <span>{copied ? 'Copied' : 'Copy JSON'}</span>
              </button>
            </div>

            <div className="p-4 bg-[#0F172A] text-slate-100 border border-slate-800 rounded-xl font-mono text-xs overflow-x-auto max-h-[500px] shadow-lg">
              <pre
                className="leading-relaxed whitespace-pre font-mono"
                dangerouslySetInnerHTML={{ __html: syntaxHighlightJson(jsonString) }}
              />
            </div>
          </div>
        )}

        {/* ================= TAB 3: COLUMN STATS & BOUNDS ================= */}
        {activeTab === 'stats' && (
          <div className="space-y-3">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block font-calistoga">
              Column Metrics &amp; Min/Max Bound Encodings
            </span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Iceberg query engines inspect these lower and upper bounds during query planning to skip reading Parquet footers and chunks.
            </p>

            {selectedNode.data.data_file ? (
              <div className="border border-slate-200 dark:border-[#334155] rounded-xl overflow-hidden bg-white dark:bg-[#0F172A] shadow-sm">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-50 dark:bg-[#1E293B] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-[#334155]">
                    <tr>
                      <th className="p-2.5">Field ID</th>
                      <th className="p-2.5">Lower Bound (Min)</th>
                      <th className="p-2.5">Upper Bound (Max)</th>
                      <th className="p-2.5">Nulls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {Object.keys(selectedNode.data.data_file.value_counts || {}).map(fieldIdStr => {
                      const fId = parseInt(fieldIdStr, 10);
                      const lower = selectedNode.data.data_file.lower_bounds[fId];
                      const upper = selectedNode.data.data_file.upper_bounds[fId];
                      const nulls = selectedNode.data.data_file.null_value_counts[fId] || 0;

                      return (
                        <tr key={fId} className="hover:bg-slate-50 dark:hover:bg-[#1E293B]/50 transition-colors">
                          <td className="p-2.5 font-bold text-[#0052FF] dark:text-[#4D7CFF]">col_{fId}</td>
                          <td className="p-2.5 text-emerald-600 dark:text-emerald-300">{lower !== undefined ? String(lower) : '-'}</td>
                          <td className="p-2.5 text-purple-600 dark:text-purple-300">{upper !== undefined ? String(upper) : '-'}</td>
                          <td className="p-2.5 text-slate-400">{nulls}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 bg-white dark:bg-[#1E293B] rounded-xl border border-slate-200 dark:border-[#334155] text-center text-xs text-slate-400 font-mono">
                Select a Data File or Manifest File to inspect column statistics.
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: PHYSICAL ROWS ================= */}
        {activeTab === 'rows' && (
          <div className="space-y-3">
            {(() => {
              const filePath = 'path' in selectedNode ? selectedNode.path : (selectedNode.data?.data_file?.file_path || '');
              const storageEntry = state?.dataFileStorage?.[filePath];
              const df = selectedNode.data?.data_file || selectedNode.data;
              const rows: any[] = storageEntry?.rows || df?.rows_data || [];
              const isEqDelete = df?.content === 2;
              const isPosDelete = df?.content === 1;
              const isDeleteFile = selectedNode.type === 'delete-file' || isEqDelete || isPosDelete;

              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block font-calistoga">
                      Physical Columnar File Contents (.parquet)
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                      isEqDelete
                        ? 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/40'
                        : isPosDelete
                        ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-500/40'
                        : 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40'
                    }`}>
                      {isEqDelete ? 'Spec v2 Equality Delete (2)' : isPosDelete ? 'Spec v2 Positional Delete (1)' : 'Data Parquet (0)'}
                    </span>
                  </div>

                  <div className="p-3 bg-[#0052FF]/5 dark:bg-[#0052FF]/10 border border-[#0052FF]/20 rounded-xl text-xs space-y-1">
                    <span className="font-bold text-[#0052FF] dark:text-[#4D7CFF] block">
                      Manifest vs. Physical Parquet Decoupling:
                    </span>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
                      Under Apache Iceberg Spec v2, manifests strictly store summary bounds and metrics. Physical row data is stored only inside columnar Parquet data and delete files.
                    </p>
                  </div>

                  <div className="p-2.5 bg-slate-50 dark:bg-[#0F172A] rounded-xl border border-slate-200 dark:border-[#334155] font-mono text-[11px] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Physical Path:</span>
                      <span className="text-slate-700 dark:text-slate-300 truncate max-w-[260px] font-semibold">{getFilename(filePath)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Records Stored:</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">{rows.length}</span>
                    </div>
                    {isEqDelete && df?.equality_ids && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Equality Field IDs:</span>
                        <span className="text-amber-600 dark:text-amber-400 font-bold">[{df.equality_ids.join(', ')}]</span>
                      </div>
                    )}
                    {isPosDelete && df?.referenced_data_file && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Target Data File:</span>
                        <span className="text-rose-600 dark:text-rose-400 truncate max-w-[240px]">{getFilename(df.referenced_data_file)}</span>
                      </div>
                    )}
                  </div>

                  {rows.length > 0 ? (
                    <div className="border border-slate-200 dark:border-[#334155] rounded-xl overflow-hidden bg-white dark:bg-[#0F172A] shadow-sm max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-50 dark:bg-[#1E293B] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-[#334155] sticky top-0">
                          <tr>
                            <th className="p-2.5">#</th>
                            {Object.keys(rows[0] || {}).map(key => (
                              <th key={key} className="p-2.5 uppercase text-[10px] tracking-wider">{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                          {rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-[#1E293B]/50 transition-colors">
                              <td className="p-2.5 text-slate-400 font-bold text-[10px]">{idx}</td>
                              {Object.keys(row).map(key => (
                                <td key={key} className="p-2.5 truncate max-w-[140px]">
                                  {typeof row[key] === 'object' ? JSON.stringify(row[key]) : String(row[key])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-4 bg-white dark:bg-[#1E293B] rounded-xl border border-slate-200 dark:border-[#334155] text-center text-xs text-slate-400 font-mono">
                      {isDeleteFile ? 'No delete records stored in this delete file.' : 'No rows stored in this Parquet file.'}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ================= TAB 5: OBJECT STORAGE ================= */}
        {activeTab === 'storage' && (
          <div className="space-y-3">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block font-calistoga">
              Virtual Cloud Storage Object (S3 / GCS)
            </span>

            <div className="card-signature p-4 space-y-2.5 text-xs font-mono">
              <div className="flex items-center space-x-2 text-[#0052FF] dark:text-[#4D7CFF]">
                <HardDrive className="w-4 h-4" />
                <span className="font-bold">Cloud Storage Lineage</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-[#0F172A] rounded-xl border border-slate-200 dark:border-[#334155] text-slate-700 dark:text-slate-300 space-y-1.5">
                <div>Storage Class: <span className="text-emerald-600 dark:text-emerald-400 font-bold">Standard Object</span></div>
                <div>Encryption: <span className="text-slate-400">SSE-S3 (AES-256)</span></div>
                <div>Compression: <span className="text-amber-600 dark:text-amber-400">Snappy / Gzip</span></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MetadataInspector;
