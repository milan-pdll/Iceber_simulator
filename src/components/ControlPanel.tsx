import React, { useState } from 'react';
import {
  TableState,
  SchemaField,
  PartitionField,
  PrimitiveType
} from '../engine/types';
import {
  Plus,
  Trash2,
  Zap,
  Split,
  FolderSync,
  Archive,
  Trash,
  Sliders,
  FilePlus2,
  GitMerge
} from 'lucide-react';
import { formatBytes } from '../utils/formatting';

interface ControlPanelProps {
  state: TableState;
  onAppendRecords: (records: Record<string, any>[], msg?: string) => void;
  onDeleteRecordsMoR: (predicate: string, msg?: string) => void;
  onDeleteRecordsCoW: (predicate: string, msg?: string) => void;
  onUpdateRecords: (predicate: string, updates: Record<string, any>, mode: 'mor' | 'cow', msg?: string) => void;
  onMergeRecords: (records: Record<string, any>[], matchKey: string, mode: 'mor' | 'cow', msg?: string) => void;
  onCompactTable: (msg?: string) => void;
  onExpireSnapshots: (snapshotIds: number[]) => void;
  onPurgeOrphans: () => void;
  onInitCustomTable: (name: string, fields: SchemaField[], partFields: PartitionField[]) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  state,
  onAppendRecords,
  onDeleteRecordsMoR,
  onDeleteRecordsCoW,
  onUpdateRecords,
  onMergeRecords,
  onCompactTable,
  onExpireSnapshots,
  onPurgeOrphans,
  onInitCustomTable
}) => {
  const [activeTab, setActiveTab] = useState<'append' | 'delete' | 'merge' | 'maintenance' | 'schema'>('append');

  const currentMetadata = state.metadataHistory[state.catalogPointer.currentMetadataLocation];
  const currentSchema = currentMetadata.schemas.find(s => s['schema-id'] === currentMetadata['current-schema-id']) || currentMetadata.schemas[0];

  // Append state
  const [appendForm, setAppendForm] = useState<Record<string, any>>({});
  const [customAppendJson, setCustomAppendJson] = useState<string>('');
  const [useJsonMode, setUseJsonMode] = useState<boolean>(false);

  // Delete & Update state
  const [predicateInput, setPredicateInput] = useState<string>("dept = 'Engineering'");
  const [deleteMode, setDeleteMode] = useState<'mor' | 'cow'>('mor');
  const [updateField, setUpdateField] = useState<string>('customer_tier');
  const [updateValue, setUpdateValue] = useState<string>('VIP-Platinum');

  // Merge (Upsert) state
  const [mergeMatchKey, setMergeMatchKey] = useState<string>('id');
  const [mergeMode, setMergeMode] = useState<'mor' | 'cow'>('mor');
  const [mergeJsonInput, setMergeJsonInput] = useState<string>('');

  // Schema creation state
  const [newTableName, setNewTableName] = useState<string>('db.custom_events');
  const [newFields, setNewFields] = useState<SchemaField[]>([
    { id: 1, name: 'id', type: 'long', required: true },
    { id: 2, name: 'dept', type: 'string', required: true },
    { id: 3, name: 'amount', type: 'double', required: false },
    { id: 4, name: 'created_at', type: 'timestamp', required: true }
  ]);
  const [partitionSourceField, setPartitionSourceField] = useState<string>('dept');

  // Expire snapshots state
  const [selectedSnapshotToPrune, setSelectedSnapshotToPrune] = useState<number[]>([]);

  // Batch append generators
  const handleGenerateBatch = (count: number) => {
    const departments = ['Engineering', 'Marketing', 'Sales', 'Support', 'Finance'];
    const tiers = ['Enterprise', 'Pro', 'Growth', 'Standard'];
    const generated: Record<string, any>[] = [];

    for (let i = 0; i < count; i++) {
      const rowId = 100 + Math.floor(Math.random() * 900);
      const dept = departments[Math.floor(Math.random() * departments.length)];
      const tier = tiers[Math.floor(Math.random() * tiers.length)];
      const amt = parseFloat((Math.random() * 4500 + 50).toFixed(2));
      const date = new Date(Date.now() - Math.floor(Math.random() * 86400000 * 5)).toISOString();

      const row: Record<string, any> = {};
      currentSchema.fields.forEach(f => {
        if (f.name === 'id' || f.name.endsWith('_id')) row[f.name] = rowId + i;
        else if (f.name === 'dept' || f.name === 'department' || f.name === 'facility' || f.name === 'country') row[f.name] = dept;
        else if (f.name === 'customer_tier' || f.name === 'tier' || f.name === 'currency') row[f.name] = tier;
        else if (f.name === 'amount' || f.name === 'reading_val' || f.name === 'price') row[f.name] = amt;
        else if (f.name === 'created_at' || f.name === 'timestamp') row[f.name] = date;
        else if (f.name === 'event_type') row[f.name] = 'transaction_commit';
        else row[f.name] = `val_${i}`;
      });

      generated.push(row);
    }

    onAppendRecords(generated, `Appended batch of ${count} record(s)`);
  };

  const handleSingleAppend = (e: React.FormEvent) => {
    e.preventDefault();
    if (useJsonMode) {
      try {
        const parsed = JSON.parse(customAppendJson);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        onAppendRecords(arr, 'Appended custom JSON records');
      } catch (err) {
        alert('Invalid JSON: ' + (err as Error).message);
      }
      return;
    }

    const row: Record<string, any> = {};
    currentSchema.fields.forEach(f => {
      let val = appendForm[f.name];
      if (val === undefined || val === '') {
        if (f.type === 'long' || f.type === 'int') val = Math.floor(Math.random() * 1000);
        else if (f.type === 'double' || f.type === 'float') val = 100.0;
        else if (f.type === 'timestamp') val = new Date().toISOString();
        else val = `test_${f.name}`;
      } else {
        if (f.type === 'long' || f.type === 'int') val = parseInt(val, 10);
        else if (f.type === 'double' || f.type === 'float') val = parseFloat(val);
      }
      row[f.name] = val;
    });

    onAppendRecords([row], `Appended record (${row.id ? `id: ${row.id}` : ''})`);
  };

  const handleDelete = () => {
    if (deleteMode === 'mor') {
      onDeleteRecordsMoR(predicateInput, `MoR Positional Delete: ${predicateInput}`);
    } else {
      onDeleteRecordsCoW(predicateInput, `CoW Rewrite Delete: ${predicateInput}`);
    }
  };

  const handleUpdate = () => {
    const updateObj: Record<string, any> = {
      [updateField]: updateValue
    };
    onUpdateRecords(predicateInput, updateObj, deleteMode, `Updated where ${predicateInput}`);
  };

  // Helper to extract active records for realistic Merge Upsert simulation
  const getActiveRows = () => {
    const rows: Record<string, any>[] = [];
    const snap = currentMetadata.snapshots.find(s => s['snapshot-id'] === currentMetadata['current-snapshot-id']);
    if (!snap) return rows;
    const mList = state.manifestLists[snap['manifest-list']] || [];
    const delPositionsByFile: Record<string, Set<number>> = {};
    mList.forEach(m => {
      const doc = state.manifestFiles[m.manifest_path];
      if (doc && doc.content === 1) {
        doc.entries.forEach(e => {
          if (e.status !== 2 && e.data_file.referenced_data_file && e.data_file.delete_positions) {
            const target = e.data_file.referenced_data_file;
            if (!delPositionsByFile[target]) delPositionsByFile[target] = new Set();
            e.data_file.delete_positions.forEach(p => delPositionsByFile[target].add(p));
          }
        });
      }
    });
    mList.forEach(m => {
      const doc = state.manifestFiles[m.manifest_path];
      if (!doc || doc.content === 1) return;
      doc.entries.forEach(e => {
        if (e.status === 2) return;
        const dRows = e.data_file.rows_data || [];
        const dels = delPositionsByFile[e.data_file.file_path] || new Set();
        dRows.forEach((r, idx) => {
          if (!dels.has(idx)) rows.push(r);
        });
      });
    });
    return rows;
  };

  const handleMergePreset = (preset: 'quick' | 'cdc') => {
    const active = getActiveRows();
    const existingRow = active.length > 0 ? active[0] : null;
    const departments = ['Engineering', 'Marketing', 'Sales', 'Support', 'Finance'];
    const tiers = ['VIP-Elite', 'Enterprise-Max', 'Growth-Plus', 'Diamond'];

    const records: Record<string, any>[] = [];

    if (preset === 'quick') {
      if (existingRow && existingRow[mergeMatchKey] !== undefined) {
        const updated = {
          ...existingRow,
          amount: existingRow.amount ? parseFloat((existingRow.amount * 1.5).toFixed(2)) : 8900.0,
          customer_tier: 'VIP-Diamond',
          tier: 'VIP-Diamond',
          dept: existingRow.dept || 'Engineering',
          created_at: new Date().toISOString()
        };
        records.push(updated);
      } else {
        records.push({
          [mergeMatchKey]: 101,
          dept: 'Engineering',
          customer_tier: 'VIP-Gold',
          amount: 3200.0,
          created_at: new Date().toISOString()
        });
      }

      records.push({
        [mergeMatchKey]: 888,
        dept: 'Sales',
        customer_tier: 'Enterprise',
        amount: 4950.0,
        created_at: new Date().toISOString()
      });
      records.push({
        [mergeMatchKey]: 999,
        dept: 'Support',
        customer_tier: 'Pro',
        amount: 1250.0,
        created_at: new Date().toISOString()
      });
    } else {
      for (let i = 0; i < 5; i++) {
        if (i < 2 && active[i] && active[i][mergeMatchKey] !== undefined) {
          records.push({
            ...active[i],
            amount: parseFloat((Math.random() * 5000 + 100).toFixed(2)),
            customer_tier: tiers[i % tiers.length],
            created_at: new Date().toISOString()
          });
        } else {
          records.push({
            [mergeMatchKey]: 700 + i,
            dept: departments[i % departments.length],
            customer_tier: tiers[i % tiers.length],
            amount: parseFloat((Math.random() * 4000 + 200).toFixed(2)),
            created_at: new Date().toISOString()
          });
        }
      }
    }

    onMergeRecords(
      records,
      mergeMatchKey,
      mergeMode,
      `MERGE INTO: ${preset === 'quick' ? 'Quick Demo Upsert' : 'CDC Stream Batch'} (${records.length} records)`
    );
  };

  const handleCustomMergeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeJsonInput.trim()) {
      handleMergePreset('quick');
      return;
    }
    try {
      const parsed = JSON.parse(mergeJsonInput);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      onMergeRecords(arr, mergeMatchKey, mergeMode, `MERGE INTO: Custom batch (${arr.length} records)`);
    } catch (err) {
      alert('Invalid JSON: ' + (err as Error).message);
    }
  };

  const orphanCount = Object.values(state.storageObjects).filter(o => o.isOrphan).length;
  const orphanBytes = Object.values(state.storageObjects)
    .filter(o => o.isOrphan)
    .reduce((acc, o) => acc + o.sizeBytes, 0);

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-[#0F1626] border-r border-slate-200 dark:border-[#243048] w-80 lg:w-96 select-none shrink-0 transition-colors duration-200">
      {/* Navigation Tabs */}
      <div className="grid grid-cols-5 bg-slate-100 dark:bg-[#0B0F17] border-b border-slate-200 dark:border-[#243048] p-1 gap-1 text-[11px]">
        <button
          onClick={() => setActiveTab('append')}
          className={`py-2 px-1 rounded-lg font-medium transition-all flex items-center justify-center space-x-1 ${
            activeTab === 'append'
              ? 'bg-white dark:bg-[#1A2338] text-sky-700 dark:text-sky-300 font-semibold shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <FilePlus2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="truncate">Insert</span>
        </button>

        <button
          onClick={() => setActiveTab('delete')}
          className={`py-2 px-1 rounded-lg font-medium transition-all flex items-center justify-center space-x-1 ${
            activeTab === 'delete'
              ? 'bg-white dark:bg-[#1A2338] text-rose-700 dark:text-rose-300 font-semibold shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          <span className="truncate">Mutate</span>
        </button>

        <button
          onClick={() => setActiveTab('merge')}
          className={`py-2 px-1 rounded-lg font-medium transition-all flex items-center justify-center space-x-1 ${
            activeTab === 'merge'
              ? 'bg-white dark:bg-[#1A2338] text-sky-700 dark:text-sky-300 font-semibold shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <GitMerge className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          <span className="truncate">Merge</span>
        </button>

        <button
          onClick={() => setActiveTab('maintenance')}
          className={`py-2 px-1 rounded-lg font-medium transition-all flex items-center justify-center space-x-1 ${
            activeTab === 'maintenance'
              ? 'bg-white dark:bg-[#1A2338] text-amber-700 dark:text-amber-300 font-semibold shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <FolderSync className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span className="truncate">Cleanup</span>
        </button>

        <button
          onClick={() => setActiveTab('schema')}
          className={`py-2 px-1 rounded-lg font-medium transition-all flex items-center justify-center space-x-1 ${
            activeTab === 'schema'
              ? 'bg-white dark:bg-[#1A2338] text-indigo-700 dark:text-indigo-300 font-semibold shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span className="truncate">Schema</span>
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ================= TAB 1: APPEND / INSERT ================= */}
        {activeTab === 'append' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center space-x-1.5">
                <FilePlus2 className="w-4 h-4" />
                <span>Transactional Insert (Append)</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Generates Parquet data files, builds new manifest entries, and reuses unchanged parent manifests with O(1) commit speed.
              </p>
            </div>

            {/* Quick batch generator buttons */}
            <div className="bg-white dark:bg-[#131B2E] p-3 rounded-xl border border-slate-200 dark:border-[#243048] space-y-2 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">
                ⚡ Quick Batch Data Ingestion
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleGenerateBatch(1)}
                  className="py-1.5 px-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 border border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300 text-xs font-medium transition-all"
                >
                  +1 Row
                </button>
                <button
                  onClick={() => handleGenerateBatch(5)}
                  className="py-1.5 px-2 rounded-lg bg-sky-50 dark:bg-sky-500/15 hover:bg-sky-100 dark:hover:bg-sky-500/25 border border-sky-300 dark:border-sky-500/40 text-sky-800 dark:text-sky-300 text-xs font-medium transition-all"
                >
                  +5 Rows
                </button>
                <button
                  onClick={() => handleGenerateBatch(15)}
                  className="py-1.5 px-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 border border-indigo-300 dark:border-indigo-500/40 text-indigo-800 dark:text-indigo-300 text-xs font-medium transition-all"
                >
                  +15 Rows
                </button>
              </div>
            </div>

            {/* Manual Form Builder */}
            <form onSubmit={handleSingleAppend} className="bg-white dark:bg-[#131B2E] p-3.5 rounded-xl border border-slate-200 dark:border-[#243048] space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Custom Row Attributes
                </span>
                <button
                  type="button"
                  onClick={() => setUseJsonMode(!useJsonMode)}
                  className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline"
                >
                  {useJsonMode ? 'Form View' : 'Raw JSON Mode'}
                </button>
              </div>

              {!useJsonMode ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {currentSchema.fields.map(field => (
                    <div key={field.id} className="flex flex-col space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="font-mono text-slate-700 dark:text-slate-300">{field.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{field.type}</span>
                      </div>
                      <input
                        type="text"
                        placeholder={`e.g. ${field.name === 'dept' ? 'Engineering' : field.name === 'amount' ? '1250.00' : '42'}`}
                        value={appendForm[field.name] || ''}
                        onChange={e => setAppendForm({ ...appendForm, [field.name]: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-[#243048] rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <textarea
                  rows={5}
                  value={customAppendJson}
                  onChange={e => setCustomAppendJson(e.target.value)}
                  placeholder={`[\n  {\n    "id": 501,\n    "dept": "Sales",\n    "amount": 2400.0\n  }\n]`}
                  className="w-full p-2 bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-[#243048] rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                />
              )}

              <button
                type="submit"
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Commit Append Transaction</span>
              </button>
            </form>
          </div>
        )}

        {/* ================= TAB 2: DELETE & UPDATE (MoR vs CoW) ================= */}
        {activeTab === 'delete' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center space-x-1.5">
                <Trash2 className="w-4 h-4" />
                <span>Delete & Update Mutations</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Compare Merge-on-Read (positional delete tombstones) vs Copy-on-Write (data file rewrites).
              </p>
            </div>

            {/* MoR vs CoW Selector */}
            <div className="bg-white dark:bg-[#131B2E] p-3 rounded-xl border border-slate-200 dark:border-[#243048] space-y-2.5 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">
                Row-Level Mutation Mode
              </span>

              <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-[#0B0F17] p-1 rounded-lg border border-slate-200 dark:border-[#243048]">
                <button
                  type="button"
                  onClick={() => setDeleteMode('mor')}
                  className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-all ${
                    deleteMode === 'mor'
                      ? 'bg-white dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Merge-on-Read (MoR)
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteMode('cow')}
                  className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-all ${
                    deleteMode === 'cow'
                      ? 'bg-white dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-500/40 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Copy-on-Write (CoW)
                </button>
              </div>

              {/* Mode Explainer Card */}
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0F17]/70 border border-slate-200 dark:border-slate-700/50 text-[10px] space-y-1">
                {deleteMode === 'mor' ? (
                  <>
                    <div className="font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                      <span>Merge-on-Read (Fast Writes):</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">
                      Leaves original Parquet data files untouched on disk. Writes a lightweight positional <code className="text-rose-600 dark:text-rose-400 font-semibold">.delete</code> file containing row offsets.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                      <Split className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                      <span>Copy-on-Write (Fast Reads):</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">
                      Rewrites surviving records into a brand new Parquet data file. Marks the old file entry as <code className="text-indigo-600 dark:text-indigo-400 font-bold">status: 2 (DELETED)</code>.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Predicate Target Filter */}
            <div className="bg-white dark:bg-[#131B2E] p-3 rounded-xl border border-slate-200 dark:border-[#243048] space-y-2 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">
                Target Row Predicate (WHERE Clause)
              </span>
              <input
                type="text"
                value={predicateInput}
                onChange={e => setPredicateInput(e.target.value)}
                placeholder="e.g. id = 102 or dept = 'Marketing'"
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-[#243048] rounded-lg text-xs font-mono text-rose-700 dark:text-rose-300 focus:outline-none focus:border-rose-500"
              />
              <div className="flex gap-1 text-[10px]">
                <button
                  onClick={() => setPredicateInput("dept = 'Engineering'")}
                  className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                >
                  dept='Engineering'
                </button>
                <button
                  onClick={() => setPredicateInput("id = 101")}
                  className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                >
                  id=101
                </button>
              </div>

              <button
                onClick={handleDelete}
                className="w-full mt-2 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-rose-600/20 flex items-center justify-center space-x-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Execute {deleteMode.toUpperCase()} Delete</span>
              </button>
            </div>

            {/* Atomic Update Section */}
            <div className="bg-white dark:bg-[#131B2E] p-3 rounded-xl border border-slate-200 dark:border-[#243048] space-y-2 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">
                Atomic UPDATE Transaction
              </span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Field (e.g. amount)"
                  value={updateField}
                  onChange={e => setUpdateField(e.target.value)}
                  className="px-2 py-1 bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-[#243048] rounded text-xs font-mono text-slate-800 dark:text-slate-200"
                />
                <input
                  type="text"
                  placeholder="New Value"
                  value={updateValue}
                  onChange={e => setUpdateValue(e.target.value)}
                  className="px-2 py-1 bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-[#243048] rounded text-xs font-mono text-slate-800 dark:text-slate-200"
                />
              </div>

              <button
                onClick={handleUpdate}
                className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
              >
                Execute Atomic Update
              </button>
            </div>
          </div>
        )}

        {/* ================= TAB 3: MERGE INTO (UPSERT) ================= */}
        {activeTab === 'merge' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400 flex items-center space-x-1.5">
                <GitMerge className="w-4 h-4" />
                <span>MERGE INTO (Upsert / CDC)</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Evaluates incoming batch against active rows on a match key. Atomically updates matched records and inserts new records.
              </p>
            </div>

            {/* SQL Spec Preview */}
            <div className="p-3 bg-slate-100 dark:bg-[#0B0F17] rounded-xl border border-slate-200 dark:border-[#243048] font-mono text-[11px] text-sky-700 dark:text-sky-300 leading-relaxed shadow-inner">
              <span className="text-slate-400">MERGE INTO </span>
              <span className="font-bold text-amber-600 dark:text-amber-400">{state.catalogPointer.tableIdentifier}</span>
              <span className="text-slate-400"> t USING source s</span>
              <br />
              <span className="text-slate-400">ON t.</span>
              <span className="font-bold text-sky-600 dark:text-sky-400">{mergeMatchKey}</span>
              <span className="text-slate-400"> = s.</span>
              <span className="font-bold text-sky-600 dark:text-sky-400">{mergeMatchKey}</span>
              <br />
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">WHEN MATCHED THEN UPDATE</span>
              <br />
              <span className="text-indigo-600 dark:text-indigo-400 font-semibold">WHEN NOT MATCHED THEN INSERT</span>
            </div>

            {/* Config: Match Key & Mutability Mode */}
            <div className="bg-white dark:bg-[#131B2E] p-3 rounded-xl border border-slate-200 dark:border-[#243048] space-y-3 shadow-sm">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">
                  Join / Match Key Column
                </span>
                <select
                  value={mergeMatchKey}
                  onChange={e => setMergeMatchKey(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-[#243048] rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  {currentSchema.fields.map(f => (
                    <option key={f.id} value={f.name}>
                      {f.name} ({f.type}) {f.id === 1 ? '— Primary ID' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mode Switcher */}
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">
                  Iceberg Mutability Architecture
                </span>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-[#0B0F17] rounded-lg border border-slate-200 dark:border-[#243048] text-xs">
                  <button
                    onClick={() => setMergeMode('mor')}
                    className={`py-1.5 px-2 rounded-md font-semibold transition-all flex items-center justify-center space-x-1 ${
                      mergeMode === 'mor'
                        ? 'bg-sky-500 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>MoR (Tombstones)</span>
                  </button>

                  <button
                    onClick={() => setMergeMode('cow')}
                    className={`py-1.5 px-2 rounded-md font-semibold transition-all flex items-center justify-center space-x-1 ${
                      mergeMode === 'cow'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Split className="w-3.5 h-3.5" />
                    <span>CoW (Rewrite)</span>
                  </button>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-[#1E2A44]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Quick 1-Click Simulation Presets
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleMergePreset('quick')}
                    className="py-2 px-2.5 rounded-lg bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 border border-sky-200 dark:border-sky-500/30 text-sky-700 dark:text-sky-300 text-xs font-semibold text-left transition-all"
                  >
                    <div className="font-bold text-[11px]">⚡ Quick Upsert</div>
                    <div className="text-[10px] text-sky-600/80 dark:text-sky-400/80 font-normal">1 Update + 2 Inserts</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMergePreset('cdc')}
                    className="py-2 px-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold text-left transition-all"
                  >
                    <div className="font-bold text-[11px]">🌊 CDC Stream</div>
                    <div className="text-[10px] text-indigo-600/80 dark:text-indigo-400/80 font-normal">5 Micro-Batch Events</div>
                  </button>
                </div>
              </div>
            </div>

            {/* Custom JSON Merge Form */}
            <form onSubmit={handleCustomMergeSubmit} className="bg-white dark:bg-[#131B2E] p-3 rounded-xl border border-slate-200 dark:border-[#243048] space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Custom Ingestion Payload (JSON)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const active = getActiveRows();
                    const existingId = active.length > 0 && active[0][mergeMatchKey] !== undefined ? active[0][mergeMatchKey] : 101;
                    const sample = [
                      { [mergeMatchKey]: existingId, dept: 'Engineering', amount: 9500.0, customer_tier: 'VIP-Diamond' },
                      { [mergeMatchKey]: 999, dept: 'Sales', amount: 3400.0, customer_tier: 'Enterprise' }
                    ];
                    setMergeJsonInput(JSON.stringify(sample, null, 2));
                  }}
                  className="text-[10px] text-sky-600 hover:text-sky-500 font-mono"
                >
                  Load Sample
                </button>
              </div>

              <textarea
                value={mergeJsonInput}
                onChange={e => setMergeJsonInput(e.target.value)}
                rows={4}
                placeholder={`[\n  { "${mergeMatchKey}": 101, "amount": 9500.0 },\n  { "${mergeMatchKey}": 999, "amount": 1200.0 }\n]`}
                className="w-full p-2 bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-[#243048] rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
              />

              <button
                type="submit"
                className="w-full py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-sky-600/20 flex items-center justify-center space-x-1.5"
              >
                <GitMerge className="w-4 h-4" />
                <span>Execute MERGE INTO ({mergeMode.toUpperCase()})</span>
              </button>
            </form>
          </div>
        )}

        {/* ================= TAB 4: MAINTENANCE & GC ================= */}
        {activeTab === 'maintenance' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center space-x-1.5">
                <FolderSync className="w-4 h-4" />
                <span>Lakehouse Maintenance & GC</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Optimize storage layouts, expire historical snapshots, and reclaim orphaned cloud storage bytes.
              </p>
            </div>

            {/* Routine 1: Compaction */}
            <div className="bg-white dark:bg-[#131B2E] p-3.5 rounded-xl border border-slate-200 dark:border-[#243048] space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <FolderSync className="w-3.5 h-3.5" />
                  <span>Compaction / Rewrite Data Files</span>
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 font-mono">
                  Small File Fix
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Merges small Parquet files and resolves all active positional delete files into consolidated clean data files.
              </p>
              <button
                onClick={() => onCompactTable()}
                className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-amber-600/20"
              >
                Run File Compaction
              </button>
            </div>

            {/* Routine 2: Expire Snapshots */}
            <div className="bg-white dark:bg-[#131B2E] p-3.5 rounded-xl border border-slate-200 dark:border-[#243048] space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                  <Archive className="w-3.5 h-3.5" />
                  <span>Expire Historical Snapshots</span>
                </span>
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  Total: {currentMetadata.snapshots.length}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Removes older snapshot references from metadata JSON. Unreachable manifest lists and files become orphans.
              </p>

              {currentMetadata.snapshots.length > 1 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {currentMetadata.snapshots.slice(0, -1).map(snap => (
                    <label
                      key={snap['snapshot-id']}
                      className="flex items-center justify-between p-1.5 rounded bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-[#243048] text-[11px] font-mono cursor-pointer hover:border-slate-400"
                    >
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={selectedSnapshotToPrune.includes(snap['snapshot-id'])}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedSnapshotToPrune([...selectedSnapshotToPrune, snap['snapshot-id']]);
                            } else {
                              setSelectedSnapshotToPrune(selectedSnapshotToPrune.filter(id => id !== snap['snapshot-id']));
                            }
                          }}
                          className="rounded accent-indigo-500"
                        />
                        <span className="text-slate-800 dark:text-slate-200">S{snap['sequence-number']} ({snap.summary.operation})</span>
                      </div>
                      <span className="text-slate-400 text-[10px]">ID: {snap['snapshot-id']}</span>
                    </label>
                  ))}

                  <button
                    onClick={() => {
                      if (selectedSnapshotToPrune.length > 0) {
                        onExpireSnapshots(selectedSnapshotToPrune);
                        setSelectedSnapshotToPrune([]);
                      }
                    }}
                    disabled={selectedSnapshotToPrune.length === 0}
                    className="w-full mt-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all"
                  >
                    Expire Selected ({selectedSnapshotToPrune.length})
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 italic p-2 bg-slate-50 dark:bg-[#0B0F17] rounded">
                  Only 1 active snapshot exists.
                </div>
              )}
            </div>

            {/* Routine 3: Orphan File Cleanup */}
            <div className="bg-white dark:bg-[#131B2E] p-3.5 rounded-xl border border-slate-200 dark:border-[#243048] space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                  <Trash className="w-3.5 h-3.5" />
                  <span>Purge Orphan Files</span>
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40 font-mono">
                  {orphanCount} Orphan(s)
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Permanently deletes unreferenced files from object storage.
              </p>

              <div className="p-2 rounded bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-[#243048] flex items-center justify-between text-xs font-mono">
                <span className="text-slate-500 dark:text-slate-400">Reclaimable Storage:</span>
                <span className="text-amber-600 dark:text-amber-400 font-bold">{formatBytes(orphanBytes)}</span>
              </div>

              <button
                onClick={onPurgeOrphans}
                disabled={orphanCount === 0}
                className="w-full py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-rose-600/20"
              >
                Purge {orphanCount} Orphan File(s)
              </button>
            </div>
          </div>
        )}

        {/* ================= TAB 4: SCHEMA & TABLE INIT ================= */}
        {activeTab === 'schema' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center space-x-1.5">
                <Sliders className="w-4 h-4" />
                <span>Schema & Partition Spec</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Configure table metadata schema and partition strategy for a new mock Iceberg table.
              </p>
            </div>

            <div className="bg-white dark:bg-[#131B2E] p-3.5 rounded-xl border border-slate-200 dark:border-[#243048] space-y-3 shadow-sm">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Table Identifier</label>
                <input
                  type="text"
                  value={newTableName}
                  onChange={e => setNewTableName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-[#243048] rounded-lg text-xs font-mono text-sky-700 dark:text-sky-300"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Schema Fields</label>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {newFields.map((f, idx) => (
                    <div key={f.id} className="flex items-center space-x-1.5 text-xs font-mono">
                      <input
                        type="text"
                        value={f.name}
                        onChange={e => {
                          const updated = [...newFields];
                          updated[idx].name = e.target.value;
                          setNewFields(updated);
                        }}
                        className="flex-1 px-2 py-1 bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-[#243048] rounded text-slate-800 dark:text-slate-200"
                      />
                      <select
                        value={f.type}
                        onChange={e => {
                          const updated = [...newFields];
                          updated[idx].type = e.target.value as PrimitiveType;
                          setNewFields(updated);
                        }}
                        className="px-2 py-1 bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-[#243048] rounded text-slate-700 dark:text-slate-300"
                      >
                        <option value="long">long</option>
                        <option value="string">string</option>
                        <option value="double">double</option>
                        <option value="timestamp">timestamp</option>
                        <option value="boolean">boolean</option>
                      </select>
                      {newFields.length > 2 && (
                        <button
                          onClick={() => setNewFields(newFields.filter((_, i) => i !== idx))}
                          className="p-1 text-rose-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setNewFields([...newFields, { id: newFields.length + 1, name: `col_${newFields.length + 1}`, type: 'string', required: false }])}
                  className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Column</span>
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Partition Spec</label>
                <select
                  value={partitionSourceField}
                  onChange={e => setPartitionSourceField(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-[#243048] rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200"
                >
                  <option value="none">Unpartitioned</option>
                  {newFields.map(f => (
                    <option key={f.id} value={f.name}>identity({f.name})</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => {
                  const partFields: PartitionField[] = partitionSourceField !== 'none'
                    ? [{
                        'source-id': newFields.find(f => f.name === partitionSourceField)?.id || 1,
                        'field-id': 1000,
                        name: partitionSourceField,
                        transform: 'identity'
                      }]
                    : [];
                  onInitCustomTable(newTableName, newFields, partFields);
                }}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
              >
                Initialize Table (v1.metadata.json)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ControlPanel;

