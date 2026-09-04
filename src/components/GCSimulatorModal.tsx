import React, { useState, useMemo } from 'react';
import {
  GCState,
  createInitialGCState,
  advanceDayOperation,
  runMaintenance,
  resetGCState
} from '../engine/gcSimulator';
import {
  Trash2,
  Play,
  RotateCcw,
  X,
  Calendar,
  Clock,
  HardDrive,
  FileCode,
  AlertTriangle,
  Archive,
  Terminal
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface GCSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GCSimulatorModal: React.FC<GCSimulatorModalProps> = ({ isOpen, onClose }) => {
  const [gcState, setGcState] = useState<GCState>(() => createInitialGCState());

  const currentDay = gcState.currentDay;
  const snapCutoffDay = currentDay - gcState.retentionSnapDays;
  const orphanCutoffDay = currentDay - gcState.retentionOrphanDays;

  const handleAdvanceDay = () => {
    setGcState(prev => advanceDayOperation(prev));
  };

  const handleRunMaintenance = () => {
    setGcState(prev => {
      const newState = runMaintenance(prev);
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 }
      });
      return newState;
    });
  };

  const handleReset = () => {
    setGcState(resetGCState(gcState.workloadMode));
  };

  // Metrics calculations
  const totalReclaimedMB = gcState.storageFiles
    .filter(f => f.status === 'deleted')
    .reduce((acc, f) => acc + f.sizeMB, 0);
  const activeSnapshotsCount = gcState.snapshots.filter(s => s.status === 'active').length;

  // Snapshot referencing sets for matrix lookup
  const liveSnapshots = useMemo(() => gcState.snapshots.filter(s => s.status === 'active'), [gcState.snapshots]);
  const liveReferencedFileIds = useMemo(() => {
    const set = new Set<string>();
    liveSnapshots.forEach(s => s.referencedFiles.forEach(f => set.add(f)));
    return set;
  }, [liveSnapshots]);

  const expiredSnapshots = useMemo(() => gcState.snapshots.filter(s => s.status === 'expired'), [gcState.snapshots]);
  const expiredReferencedFileIds = useMemo(() => {
    const set = new Set<string>();
    expiredSnapshots.forEach(s => s.referencedFiles.forEach(f => set.add(f)));
    return set;
  }, [expiredSnapshots]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155] rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
        
        {/* ================= HEADER ================= */}
        <div className="border-b border-slate-200 dark:border-[#334155] px-6 py-4 flex items-center justify-between bg-[#FAFAFA] dark:bg-[#1E293B]">
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-[#0052FF] to-[#4D7CFF] text-white shadow-sm shadow-[#0052FF]/30">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h2 className="text-base font-calistoga text-slate-900 dark:text-white tracking-tight">
                  Snapshot Expiration &amp; Orphan File Cleanup Simulator
                </h2>
                <span className="section-label py-0.5 px-2.5 text-[10px]">
                  Iceberg GC Engine
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                <span>Current Timeline: <strong className="text-[#0052FF] dark:text-[#4D7CFF]">Day {currentDay}</strong></span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span>Active Snapshots: <strong>{activeSnapshotsCount}</strong></span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span>Storage Reclaimed: <strong className="text-emerald-600 dark:text-emerald-400">{totalReclaimedMB} MB</strong></span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleReset}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155] hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 text-xs font-medium transition-all shadow-sm"
              title="Reset Simulation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 dark:bg-[#0F172A] text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              title="Close Simulator"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ================= CONFIGURATION & ACTION BAR ================= */}
        <div className="bg-[#FAFAFA] dark:bg-[#0F172A] border-b border-slate-200 dark:border-[#334155] px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
          {/* Controls: R_snap & R_orphan */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Snapshot Retention Slider */}
            <div className="flex items-center space-x-2 bg-white dark:bg-[#1E293B] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#334155] shadow-sm">
              <Clock className="w-4 h-4 text-[#0052FF] dark:text-[#4D7CFF]" />
              <span className="text-slate-500 dark:text-slate-400">R_snap:</span>
              <input
                type="range"
                min={1}
                max={20}
                value={gcState.retentionSnapDays}
                onChange={e => setGcState({ ...gcState, retentionSnapDays: parseInt(e.target.value, 10) })}
                className="w-20 accent-[#0052FF] dark:accent-[#4D7CFF] cursor-pointer"
              />
              <span className="font-bold text-slate-900 dark:text-white min-w-[36px]">{gcState.retentionSnapDays}d</span>
            </div>

            {/* Orphan Retention Slider */}
            <div className="flex items-center space-x-2 bg-white dark:bg-[#1E293B] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#334155] shadow-sm">
              <HardDrive className="w-4 h-4 text-orange-500" />
              <span className="text-slate-500 dark:text-slate-400">R_orphan:</span>
              <input
                type="range"
                min={1}
                max={20}
                value={gcState.retentionOrphanDays}
                onChange={e => setGcState({ ...gcState, retentionOrphanDays: parseInt(e.target.value, 10) })}
                className="w-20 accent-orange-500 cursor-pointer"
              />
              <span className="font-bold text-slate-900 dark:text-white min-w-[36px]">{gcState.retentionOrphanDays}d</span>
            </div>

            {/* Workload Mode Toggle */}
            <div className="flex items-center bg-white dark:bg-[#1E293B] p-1 rounded-xl border border-slate-200 dark:border-[#334155] shadow-sm">
              <button
                onClick={() => setGcState({ ...gcState, workloadMode: 'append' })}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  gcState.workloadMode === 'append'
                    ? 'btn-signature-primary shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Pure Append
              </button>
              <button
                onClick={() => setGcState({ ...gcState, workloadMode: 'row_level' })}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  gcState.workloadMode === 'row_level'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Row-Level (Mutate)
              </button>
            </div>

            {/* Crashed write toggle (only applicable in row_level mode) */}
            {gcState.workloadMode === 'row_level' && (
              <label className="flex items-center space-x-2 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 px-3 py-1.5 rounded-xl cursor-pointer text-orange-700 dark:text-orange-300">
                <input
                  type="checkbox"
                  checked={gcState.simulateCrashedWrite}
                  onChange={e => setGcState({ ...gcState, simulateCrashedWrite: e.target.checked })}
                  className="rounded accent-orange-500"
                />
                <span className="text-[11px] font-semibold">Simulate Crashed Write (Orphans)</span>
              </label>
            )}
          </div>

          {/* Action CTAs */}
          <div className="flex items-center space-x-2.5">
            <button
              onClick={handleAdvanceDay}
              className="btn-signature-primary flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Advance Day (+1 Day)</span>
            </button>

            <button
              onClick={handleRunMaintenance}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 hover:-translate-y-0.5 active:scale-98 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Run Maintenance (Expire &amp; GC)</span>
            </button>
          </div>
        </div>

        {/* ================= MAIN SIMULATOR BODY ================= */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* --- SECTION 1: TIMELINE VIEW --- */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-[#0052FF] dark:text-[#4D7CFF]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 font-calistoga">
                  Horizontal Snapshot Timeline
                </h3>
              </div>
              <div className="flex items-center space-x-3 text-[11px] font-mono">
                <span className="text-slate-400">Expiration Cutoff: Day &le; {snapCutoffDay > 0 ? snapCutoffDay : 0} (age &gt; {gcState.retentionSnapDays}d)</span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="text-slate-400">Orphan Cutoff: Day &le; {orphanCutoffDay > 0 ? orphanCutoffDay : 0} (age &ge; {gcState.retentionOrphanDays}d)</span>
              </div>
            </div>

            <div className="card-signature p-4 overflow-x-auto">
              <div className="flex items-center space-x-4 min-w-max pb-2">
                {gcState.snapshots.map((snap) => {
                  const isExpired = snap.status === 'expired';
                  const isOlderThanCutoff = snap.day <= snapCutoffDay;

                  return (
                    <div
                      key={snap.id}
                      className={`relative w-44 rounded-xl p-3 border transition-all flex flex-col justify-between ${
                        isExpired
                          ? 'bg-slate-100 dark:bg-[#1E293B]/40 border-slate-300 dark:border-slate-700/60 opacity-60'
                          : 'bg-white dark:bg-[#1E293B] border-emerald-400 dark:border-emerald-500 shadow-md shadow-emerald-500/10'
                      }`}
                    >
                      {/* Top Row: Snapshot ID & Status Pill */}
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold font-mono ${isExpired ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                          Snapshot S{snap.id}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full font-mono uppercase ${
                            isExpired
                              ? 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                              : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30'
                          }`}
                        >
                          {isExpired ? 'Expired' : 'Active'}
                        </span>
                      </div>

                      {/* Day & Operation */}
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                        <div>Created: Day {snap.day}</div>
                        <div className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">{snap.operation}</div>
                      </div>

                      {/* Pinned Files List */}
                      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-[#334155] space-y-1">
                        <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider block">Pinned Files ({snap.referencedFiles.length}):</span>
                        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                          {snap.referencedFiles.map(fileId => (
                            <span
                              key={fileId}
                              className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                                isExpired
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 line-through'
                                  : 'bg-[#0052FF]/10 text-[#0052FF] dark:text-[#4D7CFF] border-[#0052FF]/20 font-semibold'
                              }`}
                            >
                              {fileId}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Retention Indicator Warning */}
                      {!isExpired && isOlderThanCutoff && (
                        <div className="mt-2 text-[9px] font-mono font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Eligible for Expiry</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* --- SECTION 2: STORAGE MATRIX TABLE --- */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <HardDrive className="w-4 h-4 text-[#0052FF] dark:text-[#4D7CFF]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 font-calistoga">
                  Physical Storage Inventory &amp; Snapshot Pinning Matrix
                </h3>
              </div>

              {/* Status Color Legend */}
              <div className="flex items-center space-x-2 text-[10px] font-mono">
                <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 font-semibold">
                  Active (Pinned)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 font-semibold">
                  Obsolete (Expired Snapshot Only)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-500/30 font-semibold">
                  Orphan (Untracked)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 font-semibold">
                  Deleted / Purged
                </span>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-[#334155] rounded-xl overflow-hidden bg-white dark:bg-[#0F172A] shadow-sm">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-50 dark:bg-[#1E293B] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-[#334155]">
                  <tr>
                    <th className="p-3 font-semibold">Physical File</th>
                    <th className="p-3 font-semibold">Created</th>
                    <th className="p-3 font-semibold">Size</th>
                    <th className="p-3 font-semibold">Active Pinning Snapshots</th>
                    <th className="p-3 font-semibold">Historical Pinning Snapshots</th>
                    <th className="p-3 font-semibold">Lifecycle Status</th>
                    <th className="p-3 font-semibold">Engine Action / Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                  {gcState.storageFiles.map((file) => {
                    const isPinnedActive = liveReferencedFileIds.has(file.id);
                    const isPinnedExpiredOnly = !isPinnedActive && expiredReferencedFileIds.has(file.id);

                    // Find matching active snapshot IDs
                    const activePinSnaps = liveSnapshots.filter(s => s.referencedFiles.includes(file.id)).map(s => `S${s.id}`);
                    const expiredPinSnaps = expiredSnapshots.filter(s => s.referencedFiles.includes(file.id)).map(s => `S${s.id}`);

                    // Status style
                    let rowBg = 'hover:bg-slate-50 dark:hover:bg-[#1E293B]/40';
                    let statusBadge = null;

                    if (file.status === 'deleted') {
                      rowBg = 'bg-rose-50/40 dark:bg-rose-950/15 opacity-60';
                      statusBadge = (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40 line-through">
                          Purged
                        </span>
                      );
                    } else if (file.status === 'orphan') {
                      rowBg = 'bg-orange-50/40 dark:bg-orange-950/15';
                      statusBadge = (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-300 dark:border-orange-500/40">
                          Orphan File
                        </span>
                      );
                    } else if (isPinnedActive) {
                      statusBadge = (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-500/40">
                          Active Live
                        </span>
                      );
                    } else if (isPinnedExpiredOnly) {
                      statusBadge = (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40">
                          Obsolete (Unreferenced)
                        </span>
                      );
                    }

                    return (
                      <tr key={file.id} className={`transition-colors ${rowBg}`}>
                        <td className="p-3 font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <FileCode className="w-3.5 h-3.5 text-slate-400" />
                          <span className={file.status === 'deleted' ? 'line-through text-slate-400' : ''}>{file.id}</span>
                        </td>
                        <td className="p-3 text-slate-500">Day {file.createdDay}</td>
                        <td className="p-3 font-semibold">{file.sizeMB} MB</td>
                        <td className="p-3">
                          {activePinSnaps.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {activePinSnaps.map(s => (
                                <span key={s} className="px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30 text-[10px] font-bold">
                                  {s}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px]">None</span>
                          )}
                        </td>
                        <td className="p-3">
                          {expiredPinSnaps.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {expiredPinSnaps.map(s => (
                                <span key={s} className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700 text-[10px] line-through">
                                  {s}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px]">-</span>
                          )}
                        </td>
                        <td className="p-3">{statusBadge}</td>
                        <td className="p-3 text-[11px] text-slate-500 dark:text-slate-400 max-w-xs truncate">
                          {file.deletionReason ? (
                            <span className="text-rose-600 dark:text-rose-400 font-semibold">{file.deletionReason}</span>
                          ) : file.status === 'orphan' ? (
                            <span>Uncommitted write (age: {currentDay - file.createdDay}d)</span>
                          ) : file.replacedBy ? (
                            <span>Replaced by {file.replacedBy}</span>
                          ) : (
                            <span>Referenced in current lakehouse state</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* --- SECTION 3: STEP-BY-STEP MAINTENANCE LOG PANEL --- */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-[#0052FF] dark:text-[#4D7CFF]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 font-calistoga">
                  Maintenance Execution &amp; Garbage Collection Event Log
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">{gcState.logs.length} events recorded</span>
            </div>

            <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 font-mono text-xs max-h-56 overflow-y-auto space-y-1.5 shadow-inner">
              {gcState.logs.map((log) => {
                let badgeColor = 'text-slate-400';
                if (log.category === 'EXPIRATION') badgeColor = 'text-amber-400';
                if (log.category === 'DATA_CLEANUP') badgeColor = 'text-rose-400';
                if (log.category === 'ORPHAN_CLEANUP') badgeColor = 'text-orange-400';
                if (log.category === 'SUMMARY') badgeColor = 'text-emerald-400 font-bold';
                if (log.category === 'OPERATION') badgeColor = 'text-[#4D7CFF]';

                return (
                  <div key={log.id} className="flex items-start space-x-2 leading-relaxed">
                    <span className="text-slate-500 select-none">[{log.timestamp}]</span>
                    <span className={`select-none ${badgeColor}`}>[{log.category}]</span>
                    <span className="text-slate-200">{log.message}</span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default GCSimulatorModal;
