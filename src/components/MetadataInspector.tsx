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
}

export const MetadataInspector: React.FC<MetadataInspectorProps> = ({
  selectedNode,
  onClose
}) => {
  if (!selectedNode) return null;

  const [activeTab, setActiveTab] = useState<'summary' | 'json' | 'stats' | 'storage'>('summary');
  const [copied, setCopied] = useState<boolean>(false);

  const jsonPayload = React.useMemo(() => {
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
      case 'manifest-file':
        return selectedNode.data;
      case 'data-file':
        return selectedNode.data;
      case 'delete-file':
        return selectedNode.data;
      default:
        return {};
    }
  }, [selectedNode]);

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
        return 'Table Metadata JSON (v2)';
      case 'snapshot':
        return `Snapshot S${selectedNode.data['sequence-number']}`;
      case 'manifest-list':
        return 'Manifest List (.avro)';
      case 'manifest-file':
        return 'Manifest File (.avro)';
      case 'data-file':
        return 'Data File (.parquet)';
      case 'delete-file':
        return 'Positional Delete (.delete)';
    }
  };

  const getNodeIcon = () => {
    switch (selectedNode.type) {
      case 'catalog':
        return <Database className="w-5 h-5 text-amber-500 dark:text-amber-400" />;
      case 'metadata':
        return <FileJson className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />;
      case 'snapshot':
        return <Camera className="w-5 h-5 text-purple-500 dark:text-purple-400" />;
      case 'manifest-list':
        return <ListTree className="w-5 h-5 text-sky-500 dark:text-sky-400" />;
      case 'manifest-file':
        return <FileSpreadsheet className="w-5 h-5 text-teal-500 dark:text-teal-400" />;
      case 'data-file':
        return <FileCode className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />;
      case 'delete-file':
        return <FileX2 className="w-5 h-5 text-rose-500" />;
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] lg:w-[580px] bg-white/95 dark:bg-[#0E1525]/95 backdrop-blur-xl border-l border-slate-200 dark:border-[#243048] shadow-2xl flex flex-col z-50 select-none animate-in slide-in-from-right duration-200 transition-colors">
      {/* Header */}
      <div className="h-16 border-b border-slate-200 dark:border-[#243048] px-5 flex items-center justify-between bg-slate-100 dark:bg-[#111A2E]/80">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-slate-200 dark:bg-[#162035] border border-slate-300 dark:border-slate-700/60 shadow-inner">
            {getNodeIcon()}
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>{getTitle()}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-300 dark:border-sky-500/30 font-mono">
                Iceberg Spec v2
              </span>
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate block max-w-sm">
              {selectedNode.type === 'catalog' ? selectedNode.data.tableIdentifier : ('path' in selectedNode ? selectedNode.path : ('location' in selectedNode ? selectedNode.location : 'Snapshot Object'))}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 bg-slate-100 dark:bg-[#0B0F17] border-b border-slate-200 dark:border-[#243048] px-2 pt-1 text-xs">
        <button
          onClick={() => setActiveTab('summary')}
          className={`py-2 font-medium border-b-2 transition-all ${
            activeTab === 'summary'
              ? 'border-sky-500 text-sky-700 dark:text-sky-300 font-semibold'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('json')}
          className={`py-2 font-medium border-b-2 transition-all ${
            activeTab === 'json'
              ? 'border-sky-500 text-sky-700 dark:text-sky-300 font-semibold'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Raw Spec JSON
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`py-2 font-medium border-b-2 transition-all ${
            activeTab === 'stats'
              ? 'border-sky-500 text-sky-700 dark:text-sky-300 font-semibold'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Metrics & Bounds
        </button>
        <button
          onClick={() => setActiveTab('storage')}
          className={`py-2 font-medium border-b-2 transition-all ${
            activeTab === 'storage'
              ? 'border-sky-500 text-sky-700 dark:text-sky-300 font-semibold'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Object Storage
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* ================= TAB 1: SUMMARY ================= */}
        {activeTab === 'summary' && (
          <div className="space-y-4">
            {selectedNode.type === 'catalog' && (
              <div className="bg-slate-50 dark:bg-[#131B2E] p-4 rounded-xl border border-slate-200 dark:border-[#243048] space-y-3">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Catalog Decoupling Principles</span>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  In Apache Iceberg, the catalog merely tracks the atomic pointer to the current table metadata JSON file. Unlike Hive Metastore (HMS), table transactions do not take database locks or require directory partition rewrites.
                </p>
                <div className="p-3 bg-white dark:bg-[#0B0F17] rounded-lg border border-slate-200 dark:border-[#243048] space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Table Identifier:</span>
                    <span className="text-amber-700 dark:text-amber-300">{selectedNode.data.tableIdentifier}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Current Metadata Pointer:</span>
                    <span className="text-sky-700 dark:text-sky-300 truncate max-w-[240px]">{getFilename(selectedNode.data.location)}</span>
                  </div>
                </div>
              </div>
            )}

            {selectedNode.type === 'metadata' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 dark:bg-[#131B2E] p-3 rounded-xl border border-slate-200 dark:border-[#243048]">
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">Format Version</span>
                    <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400 block font-mono">
                      v{selectedNode.data['format-version']} (Row-Level Deletes)
                    </span>
                  </div>
                  <div className="bg-slate-50 dark:bg-[#131B2E] p-3 rounded-xl border border-slate-200 dark:border-[#243048]">
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">Last Sequence Number</span>
                    <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 block font-mono">
                      #{selectedNode.data['last-sequence-number']}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-[#131B2E] p-4 rounded-xl border border-slate-200 dark:border-[#243048] space-y-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Table UUID & Schema Catalog</span>
                  <div className="p-2.5 bg-white dark:bg-[#0B0F17] rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300 space-y-1">
                    <div>UUID: <span className="text-sky-700 dark:text-sky-300">{selectedNode.data['table-uuid']}</span></div>
                    <div>Location: <span className="text-slate-500 dark:text-slate-400 truncate block">{selectedNode.data.location}</span></div>
                    <div>Total Snapshots in History: <span className="text-amber-600 dark:text-amber-400 font-bold">{selectedNode.data.snapshots?.length}</span></div>
                  </div>
                </div>
              </div>
            )}

            {selectedNode.type === 'snapshot' && (
              <div className="space-y-3">
                <div className="bg-slate-50 dark:bg-[#131B2E] p-4 rounded-xl border border-slate-200 dark:border-[#243048] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-700 dark:text-purple-300">
                      Snapshot #{selectedNode.data['sequence-number']}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-500/40 font-mono">
                      {selectedNode.data.summary?.operation.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                    <div className="p-2 bg-white dark:bg-[#0B0F17] rounded-lg border border-slate-200 dark:border-[#243048]">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Total Files</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{selectedNode.data.summary?.['total-data-files']}</span>
                    </div>
                    <div className="p-2 bg-white dark:bg-[#0B0F17] rounded-lg border border-slate-200 dark:border-[#243048]">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Deletes</span>
                      <span className="font-bold text-rose-600 dark:text-rose-400">{selectedNode.data.summary?.['total-delete-files'] || 0}</span>
                    </div>
                    <div className="p-2 bg-white dark:bg-[#0B0F17] rounded-lg border border-slate-200 dark:border-[#243048]">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Total Records</span>
                      <span className="font-bold text-sky-600 dark:text-sky-400">{selectedNode.data.summary?.['total-records']}</span>
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 space-y-1">
                    <div>Committed: {formatTimestamp(selectedNode.data['timestamp-ms'])}</div>
                    <div>Parent Snapshot: {selectedNode.data['parent-snapshot-id'] ? String(selectedNode.data['parent-snapshot-id']) : 'None (Table Root)'}</div>
                    <div>Manifest List: <span className="text-sky-700 dark:text-sky-300">{getFilename(selectedNode.data['manifest-list'])}</span></div>
                  </div>
                </div>
              </div>
            )}

            {(selectedNode.type === 'data-file' || selectedNode.type === 'delete-file') && (
              <div className="space-y-3">
                <div className="bg-slate-50 dark:bg-[#131B2E] p-4 rounded-xl border border-slate-200 dark:border-[#243048] space-y-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Parquet Physical Properties</span>
                  <div className="p-3 bg-white dark:bg-[#0B0F17] rounded-lg text-xs font-mono space-y-1.5 text-slate-700 dark:text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">File Format:</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">{selectedNode.data.data_file?.file_format || 'PARQUET'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Record Count:</span>
                      <span className="text-slate-900 dark:text-white font-bold">{selectedNode.data.data_file?.record_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">File Size:</span>
                      <span className="text-amber-600 dark:text-amber-400 font-bold">{formatBytes(selectedNode.data.data_file?.file_size_in_bytes || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Partition Key:</span>
                      <span className="text-sky-700 dark:text-sky-300">{JSON.stringify(selectedNode.data.data_file?.partition || {})}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: SPEC JSON ================= */}
        {activeTab === 'json' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Official Apache Iceberg Spec v2 Payload
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#162035] hover:bg-sky-50 dark:hover:bg-sky-500/20 border border-slate-300 dark:border-[#243048] hover:border-sky-400 text-slate-800 dark:text-slate-200 hover:text-sky-600 dark:hover:text-sky-300 text-xs font-medium transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied to Clipboard' : 'Copy JSON'}</span>
              </button>
            </div>

            <div className="p-3.5 bg-slate-900 text-slate-100 border border-slate-700 rounded-xl font-mono text-xs overflow-x-auto max-h-[500px]">
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
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
              Column Metrics & Min/Max Bound Encodings
            </span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Iceberg query engines inspect these lower and upper bounds during query planning to skip reading Parquet footers and chunks.
            </p>

            {selectedNode.data.data_file ? (
              <div className="border border-slate-200 dark:border-[#243048] rounded-xl overflow-hidden bg-white dark:bg-[#0B0F17]">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-100 dark:bg-[#121929] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-[#243048]">
                    <tr>
                      <th className="p-2.5">Field ID</th>
                      <th className="p-2.5">Lower Bound (Min)</th>
                      <th className="p-2.5">Upper Bound (Max)</th>
                      <th className="p-2.5">Nulls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {Object.keys(selectedNode.data.data_file.value_counts || {}).map(fieldIdStr => {
                      const fId = parseInt(fieldIdStr, 10);
                      const lower = selectedNode.data.data_file.lower_bounds[fId];
                      const upper = selectedNode.data.data_file.upper_bounds[fId];
                      const nulls = selectedNode.data.data_file.null_value_counts[fId] || 0;

                      return (
                        <tr key={fId} className="hover:bg-slate-50 dark:hover:bg-[#141C30]">
                          <td className="p-2.5 font-bold text-sky-600 dark:text-sky-400">col_{fId}</td>
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
              <div className="p-4 bg-slate-100 dark:bg-[#121828] rounded-xl text-center text-xs text-slate-500 font-mono">
                Select a Data File or Manifest File to inspect column statistics.
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: OBJECT STORAGE ================= */}
        {activeTab === 'storage' && (
          <div className="space-y-3">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
              Virtual Cloud Storage Object (S3 / GCS)
            </span>

            <div className="bg-slate-50 dark:bg-[#131B2E] p-4 rounded-xl border border-slate-200 dark:border-[#243048] space-y-2 text-xs font-mono">
              <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400">
                <HardDrive className="w-4 h-4" />
                <span className="font-bold">Cloud Storage Lineage</span>
              </div>
              <div className="p-2.5 bg-white dark:bg-[#0B0F17] rounded-lg text-slate-700 dark:text-slate-300 space-y-1">
                <div>Storage Class: <span className="text-emerald-600 dark:text-emerald-400 font-bold">Standard Object</span></div>
                <div>Encryption: <span className="text-slate-500 dark:text-slate-400">SSE-S3 (AES-256)</span></div>
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

