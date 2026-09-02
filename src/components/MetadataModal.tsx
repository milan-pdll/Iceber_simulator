import React, { useState, useMemo } from 'react';
import { TableState } from '../engine/types';
import {
  FileJson,
  X,
  Copy,
  Check,
  Download,
  Layers,
  Search,
  Database,
  Camera,
  HardDrive,
  Sliders,
  FileCode,
  ShieldCheck
} from 'lucide-react';
import { formatBytes, formatTimestamp, getFilename } from '../utils/formatting';
import { syntaxHighlightJson } from '../utils/syntaxHighlight';

interface MetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: TableState;
  activeSnapshotId?: number | null;
}

export const MetadataModal: React.FC<MetadataModalProps> = ({
  isOpen,
  onClose,
  state
}) => {
  const currentMetadataLocation = state.catalogPointer.currentMetadataLocation;
  const [selectedLocation, setSelectedLocation] = useState<string>(currentMetadataLocation);
  const [activeTab, setActiveTab] = useState<'specs' | 'snapshots' | 'storage' | 'json'>('specs');
  const [copied, setCopied] = useState<boolean>(false);
  const [jsonSearchQuery, setJsonSearchQuery] = useState<string>('');

  // Sync selectedLocation if currentMetadataLocation changes and selectedLocation is invalid
  const metadataLocations = useMemo(() => Object.keys(state.metadataHistory), [state.metadataHistory]);

  const activeMetadata = useMemo(() => {
    return state.metadataHistory[selectedLocation] || state.metadataHistory[currentMetadataLocation];
  }, [state.metadataHistory, selectedLocation, currentMetadataLocation]);

  const jsonString = useMemo(() => {
    return JSON.stringify(activeMetadata, null, 2);
  }, [activeMetadata]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const filename = getFilename(selectedLocation) || 'table-metadata.json';
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const currentSchema = activeMetadata?.schemas.find(s => s['schema-id'] === activeMetadata['current-schema-id'])
    || activeMetadata?.schemas[0];

  const currentPartitionSpec = activeMetadata?.['partition-specs'].find(p => p['spec-id'] === activeMetadata['default-spec-id'])
    || activeMetadata?.['partition-specs'][0];

  const snapshots = activeMetadata?.snapshots || [];

  // Group storage objects by type
  const storageObjectsList = Object.values(state.storageObjects);
  const storageSummary = {
    metadata: storageObjectsList.filter(o => o.type === 'metadata'),
    manifestList: storageObjectsList.filter(o => o.type === 'manifest-list'),
    manifest: storageObjectsList.filter(o => o.type === 'manifest'),
    data: storageObjectsList.filter(o => o.type === 'data'),
    delete: storageObjectsList.filter(o => o.type === 'delete'),
    orphan: storageObjectsList.filter(o => o.isOrphan)
  };

  const totalStorageBytes = storageObjectsList.reduce((acc, o) => acc + o.sizeBytes, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 select-none animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#0D1424] border border-slate-200 dark:border-[#243048] rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="border-b border-slate-200 dark:border-[#243048] px-6 py-4 flex items-center justify-between bg-slate-100 dark:bg-[#121B2E]">
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 shadow-inner">
              <FileJson className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Apache Iceberg Table Metadata
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-500/30 font-mono font-semibold">
                  Spec v2
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-amber-500" />
                <span>{state.catalogPointer.tableIdentifier}</span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="text-slate-400 dark:text-slate-500 truncate max-w-sm">{selectedLocation}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Version Switcher */}
            <div className="flex items-center space-x-1.5 bg-white dark:bg-[#182338] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#2A3852] text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Version:</span>
              <select
                value={selectedLocation}
                onChange={e => setSelectedLocation(e.target.value)}
                className="bg-transparent text-slate-900 dark:text-white font-mono font-semibold focus:outline-none cursor-pointer"
              >
                {metadataLocations.map((loc, idx) => (
                  <option key={loc} value={loc} className="bg-white dark:bg-[#121B2E] text-slate-900 dark:text-white">
                    {getFilename(loc)} {loc === currentMetadataLocation ? '(Current)' : `(v${idx + 1})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-200 dark:bg-[#1A2338] text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
              title="Close Metadata Explorer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Spec Metrics Bar */}
        <div className="bg-slate-50 dark:bg-[#0B101D] border-b border-slate-200 dark:border-[#1E293B] px-6 py-2.5 flex flex-wrap items-center gap-y-2 gap-x-6 text-xs font-mono text-slate-600 dark:text-slate-400">
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">Table UUID:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[150px]" title={activeMetadata?.['table-uuid']}>
              {activeMetadata?.['table-uuid']}
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">Sequence #:</span>
            <span className="font-semibold text-sky-600 dark:text-sky-400">
              {activeMetadata?.['last-sequence-number']}
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">Current Snapshot:</span>
            <span className="font-semibold text-purple-600 dark:text-purple-400">
              {activeMetadata?.['current-snapshot-id'] ? `S${snapshots.length}` : 'None'}
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">Last Updated:</span>
            <span className="text-slate-700 dark:text-slate-300">
              {activeMetadata?.['last-updated-ms'] ? formatTimestamp(activeMetadata['last-updated-ms']) : 'N/A'}
            </span>
          </div>
          <div className="flex items-center space-x-1.5 ml-auto">
            <span className="text-slate-400">Snapshots Log:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {snapshots.length} commit(s)
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-1 px-6 pt-3 bg-slate-100/70 dark:bg-[#0E1626] border-b border-slate-200 dark:border-[#243048]">
          <button
            onClick={() => setActiveTab('specs')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-all flex items-center space-x-1.5 border-t-2 ${
              activeTab === 'specs'
                ? 'bg-white dark:bg-[#152036] text-sky-700 dark:text-sky-300 border-sky-500 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Schema & Partitioning</span>
          </button>

          <button
            onClick={() => setActiveTab('snapshots')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-all flex items-center space-x-1.5 border-t-2 ${
              activeTab === 'snapshots'
                ? 'bg-white dark:bg-[#152036] text-purple-700 dark:text-purple-300 border-purple-500 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Snapshots Log ({snapshots.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('storage')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-all flex items-center space-x-1.5 border-t-2 ${
              activeTab === 'storage'
                ? 'bg-white dark:bg-[#152036] text-emerald-700 dark:text-emerald-300 border-emerald-500 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Storage & Manifests</span>
          </button>

          <button
            onClick={() => setActiveTab('json')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-all flex items-center space-x-1.5 border-t-2 ${
              activeTab === 'json'
                ? 'bg-white dark:bg-[#152036] text-indigo-700 dark:text-indigo-300 border-indigo-500 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Raw Spec v2 JSON</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-[#10192C]">
          {/* ================= TAB 1: SCHEMA & SPECS ================= */}
          {activeTab === 'specs' && (
            <div className="space-y-6">
              {/* Schema Table */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      Table Schema
                    </h3>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                      schema-id: {currentSchema?.['schema-id']}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">
                    Last assigned column ID: {activeMetadata?.['last-assigned-column-id']}
                  </span>
                </div>

                <div className="border border-slate-200 dark:border-[#243048] rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-[#162138] border-b border-slate-200 dark:border-[#243048] text-slate-600 dark:text-slate-400 font-semibold font-mono">
                        <th className="py-2.5 px-4 w-16">ID</th>
                        <th className="py-2.5 px-4">Field Name</th>
                        <th className="py-2.5 px-4">Spec Type</th>
                        <th className="py-2.5 px-4">Nullability</th>
                        <th className="py-2.5 px-4">Doc / Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-[#243048]">
                      {currentSchema?.fields.map(field => {
                        const isPartCol = currentPartitionSpec?.fields.some(p => p['source-id'] === field.id);
                        return (
                          <tr key={field.id} className="hover:bg-slate-50 dark:hover:bg-[#18243C] transition-colors">
                            <td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400">{field.id}</td>
                            <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-white flex items-center space-x-1.5">
                              <span>{field.name}</span>
                              {isPartCol && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30">
                                  Partition Key
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4">
                              <span className={`px-2 py-0.5 rounded font-mono text-[11px] font-medium ${
                                field.type === 'long' || field.type === 'int'
                                  ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'
                                  : field.type === 'double' || field.type === 'float'
                                  ? 'bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300'
                                  : field.type === 'timestamp' || field.type === 'date'
                                  ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300'
                                  : 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              }`}>
                                {field.type}
                              </span>
                            </td>
                            <td className="py-2.5 px-4">
                              {field.required ? (
                                <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">Required (NON-NULL)</span>
                              ) : (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">Optional (Nullable)</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                              {field.doc || (field.name === 'id' ? 'Primary Row Key' : 'Payload attribute')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Partition Spec & Table Properties Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Partition Spec */}
                <div className="border border-slate-200 dark:border-[#243048] rounded-xl p-4 bg-slate-50/50 dark:bg-[#141E34]">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                      <Layers className="w-3.5 h-3.5 text-amber-500" />
                      <span>Partition Specification</span>
                    </h4>
                    <span className="text-[11px] font-mono text-slate-500">
                      spec-id: {currentPartitionSpec?.['spec-id']}
                    </span>
                  </div>

                  {currentPartitionSpec && currentPartitionSpec.fields.length > 0 ? (
                    <div className="space-y-2">
                      {currentPartitionSpec.fields.map(pf => (
                        <div key={pf['field-id']} className="p-2.5 rounded-lg bg-white dark:bg-[#1A2640] border border-slate-200 dark:border-[#293754] text-xs flex items-center justify-between font-mono">
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-white">{pf.name}</span>
                            <span className="text-slate-400 text-[11px] ml-2">(source-id: {pf['source-id']})</span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[11px] font-semibold">
                            transform: {pf.transform}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">Table is unpartitioned.</p>
                  )}
                </div>

                {/* Table Properties */}
                <div className="border border-slate-200 dark:border-[#243048] rounded-xl p-4 bg-slate-50/50 dark:bg-[#141E34]">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center space-x-1.5 mb-3">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Table Properties & Settings</span>
                  </h4>

                  <div className="space-y-2 text-xs font-mono">
                    {Object.entries(activeMetadata?.properties || {}).map(([key, val]) => (
                      <div key={key} className="p-2 rounded bg-white dark:bg-[#1A2640] border border-slate-200 dark:border-[#293754] flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{key}</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[150px]">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 2: SNAPSHOTS LOG ================= */}
          {activeTab === 'snapshots' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Historical Snapshot Lineage & Commits
                </h3>
                <span className="text-xs font-mono text-slate-500">
                  Total snapshots: {snapshots.length}
                </span>
              </div>

              {snapshots.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-300 dark:border-[#2A3852] rounded-xl text-slate-500">
                  No snapshots committed yet. Execute an Insert, Merge, or Mutate transaction to create the first snapshot.
                </div>
              ) : (
                <div className="space-y-3">
                  {snapshots.slice().reverse().map((snap, idx) => {
                    const isHead = idx === 0;
                    return (
                      <div
                        key={snap['snapshot-id']}
                        className={`p-4 rounded-xl border transition-all ${
                          isHead
                            ? 'bg-purple-50/50 dark:bg-purple-950/20 border-purple-300 dark:border-purple-500/40 shadow-sm'
                            : 'bg-slate-50 dark:bg-[#141E34] border-slate-200 dark:border-[#243048]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2.5">
                            <span className="px-2 py-0.5 rounded-lg bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-xs font-mono font-bold">
                              S{snap['sequence-number']}
                            </span>
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              Snapshot ID: {snap['snapshot-id']}
                            </span>
                            {isHead && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider">
                                HEAD
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-3 text-xs font-mono text-slate-500 dark:text-slate-400">
                            <span className={`px-2 py-0.5 rounded uppercase font-semibold text-[10px] ${
                              snap.summary.operation === 'append'
                                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                : snap.summary.operation === 'overwrite'
                                ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
                                : 'bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-400'
                            }`}>
                              {snap.summary.operation}
                            </span>
                            <span>{formatTimestamp(snap['timestamp-ms'])}</span>
                          </div>
                        </div>

                        {/* Description */}
                        {snap.summary['commit-desc'] && (
                          <p className="text-xs text-slate-700 dark:text-slate-300 font-mono mb-3 bg-white dark:bg-[#1A2640] p-2 rounded border border-slate-200 dark:border-[#293754]">
                            💬 {snap.summary['commit-desc']}
                          </p>
                        )}

                        {/* Snapshot Summary Metrics Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                          <div className="p-2 rounded bg-white dark:bg-[#1A2640] border border-slate-200 dark:border-[#293754]">
                            <span className="text-slate-400 text-[10px] block">Added Files</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              +{snap.summary['added-data-files'] || '0'} data / +{snap.summary['added-delete-files'] || '0'} del
                            </span>
                          </div>
                          <div className="p-2 rounded bg-white dark:bg-[#1A2640] border border-slate-200 dark:border-[#293754]">
                            <span className="text-slate-400 text-[10px] block">Deleted Files</span>
                            <span className="font-semibold text-rose-600 dark:text-rose-400">
                              -{snap.summary['deleted-data-files'] || '0'} data
                            </span>
                          </div>
                          <div className="p-2 rounded bg-white dark:bg-[#1A2640] border border-slate-200 dark:border-[#293754]">
                            <span className="text-slate-400 text-[10px] block">Total Records</span>
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {snap.summary['total-records']}
                            </span>
                          </div>
                          <div className="p-2 rounded bg-white dark:bg-[#1A2640] border border-slate-200 dark:border-[#293754] truncate">
                            <span className="text-slate-400 text-[10px] block">Parent Snapshot</span>
                            <span className="font-semibold text-slate-600 dark:text-slate-300">
                              {snap['parent-snapshot-id'] ? `S${snap['sequence-number'] - 1}` : 'Root'}
                            </span>
                          </div>
                        </div>

                        {/* Manifest List Path */}
                        <div className="mt-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between">
                          <span className="truncate">Manifest List: {snap['manifest-list']}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 3: STORAGE DISTRIBUTION ================= */}
          {activeTab === 'storage' && (
            <div className="space-y-6">
              {/* Storage Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141E34] border border-slate-200 dark:border-[#243048]">
                  <span className="text-slate-400 text-[10px] block uppercase">Metadata Files</span>
                  <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">{storageSummary.metadata.length}</span>
                  <span className="text-[10px] text-slate-500 block">{formatBytes(storageSummary.metadata.reduce((a, b) => a + b.sizeBytes, 0))}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141E34] border border-slate-200 dark:border-[#243048]">
                  <span className="text-slate-400 text-[10px] block uppercase">Manifest Lists</span>
                  <span className="text-base font-bold text-sky-600 dark:text-sky-400">{storageSummary.manifestList.length}</span>
                  <span className="text-[10px] text-slate-500 block">{formatBytes(storageSummary.manifestList.reduce((a, b) => a + b.sizeBytes, 0))}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141E34] border border-slate-200 dark:border-[#243048]">
                  <span className="text-slate-400 text-[10px] block uppercase">Manifest Files</span>
                  <span className="text-base font-bold text-teal-600 dark:text-teal-400">{storageSummary.manifest.length}</span>
                  <span className="text-[10px] text-slate-500 block">{formatBytes(storageSummary.manifest.reduce((a, b) => a + b.sizeBytes, 0))}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141E34] border border-slate-200 dark:border-[#243048]">
                  <span className="text-slate-400 text-[10px] block uppercase">Parquet Data</span>
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">{storageSummary.data.length}</span>
                  <span className="text-[10px] text-slate-500 block">{formatBytes(storageSummary.data.reduce((a, b) => a + b.sizeBytes, 0))}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141E34] border border-slate-200 dark:border-[#243048]">
                  <span className="text-slate-400 text-[10px] block uppercase">Positional Deletes</span>
                  <span className="text-base font-bold text-rose-600 dark:text-rose-400">{storageSummary.delete.length}</span>
                  <span className="text-[10px] text-slate-500 block">{formatBytes(storageSummary.delete.reduce((a, b) => a + b.sizeBytes, 0))}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141E34] border border-slate-200 dark:border-[#243048]">
                  <span className="text-slate-400 text-[10px] block uppercase">Total Objects</span>
                  <span className="text-base font-bold text-amber-600 dark:text-amber-400">{storageObjectsList.length}</span>
                  <span className="text-[10px] text-slate-500 block">{formatBytes(totalStorageBytes)}</span>
                </div>
              </div>

              {/* Physical Storage File Listing */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 mb-2.5">
                  Simulated Object Storage Inventory (S3 / GCS / ADLS)
                </h4>

                <div className="border border-slate-200 dark:border-[#243048] rounded-xl overflow-hidden shadow-sm max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse font-mono">
                    <thead className="bg-slate-100 dark:bg-[#162138] sticky top-0 border-b border-slate-200 dark:border-[#243048] text-slate-600 dark:text-slate-400">
                      <tr>
                        <th className="py-2.5 px-4">Object URI</th>
                        <th className="py-2.5 px-4 w-28">Type</th>
                        <th className="py-2.5 px-4 w-28">Size</th>
                        <th className="py-2.5 px-4 w-28">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-[#243048]">
                      {storageObjectsList.map(obj => (
                        <tr key={obj.uri} className="hover:bg-slate-50 dark:hover:bg-[#18243C] transition-colors">
                          <td className="py-2 px-4 truncate max-w-md text-slate-800 dark:text-slate-200" title={obj.uri}>
                            {obj.uri}
                          </td>
                          <td className="py-2 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${
                              obj.type === 'metadata'
                                ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400'
                                : obj.type === 'manifest-list'
                                ? 'bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-400'
                                : obj.type === 'manifest'
                                ? 'bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-400'
                                : obj.type === 'data'
                                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                : 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400'
                            }`}>
                              {obj.type}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-slate-600 dark:text-slate-400">
                            {formatBytes(obj.sizeBytes)}
                          </td>
                          <td className="py-2 px-4">
                            {obj.isOrphan ? (
                              <span className="text-amber-600 dark:text-amber-400 font-semibold text-[11px]">Orphan</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 text-[11px]">Referenced</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 4: RAW JSON ================= */}
          {activeTab === 'json' && (
            <div className="flex flex-col h-full space-y-3">
              {/* Toolbar */}
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search metadata keys or values..."
                    value={jsonSearchQuery}
                    onChange={e => setJsonSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#162035] border border-slate-300 dark:border-[#2A3852] text-xs font-mono focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white placeholder:text-slate-400"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#162035] border border-slate-300 dark:border-[#2A3852] hover:border-indigo-500 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDownload}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/40 hover:border-indigo-500 text-indigo-700 dark:text-indigo-300 text-xs font-medium transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download JSON</span>
                  </button>
                </div>
              </div>

              {/* Syntax Highlighted JSON Box */}
              <div className="flex-1 overflow-auto rounded-xl bg-slate-950 p-4 border border-slate-800 text-xs font-mono shadow-inner max-h-[500px]">
                <pre
                  className="leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html: syntaxHighlightJson(jsonString)
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
