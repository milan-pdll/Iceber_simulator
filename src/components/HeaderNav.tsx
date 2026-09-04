import React from 'react';
import {
  Layers,
  Database,
  Search,
  Sparkles,
  Table as TableIcon,
  RotateCcw,
  HardDrive,
  FileCode,
  FileJson,
  CheckCircle2,
  ChevronDown,
  Sun,
  Moon,
  Archive
} from 'lucide-react';
import { TableState } from '../engine/types';
import { PRESET_SCENARIOS, ScenarioDefinition } from '../engine/presetScenarios';
import { formatBytes } from '../utils/formatting';

interface HeaderNavProps {
  state: TableState;
  activeScenarioId: string;
  onSelectScenario: (scenario: ScenarioDefinition) => void;
  onResetTable: () => void;
  onOpenDataModal: () => void;
  onOpenMetadataModal: () => void;
  onOpenTour: () => void;
  onOpenGCSimulator: () => void;
  isQueryDrawerOpen: boolean;
  onToggleQueryDrawer: () => void;
  isTimeTravelActive: boolean;
  activeSnapshotId: number | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const HeaderNav: React.FC<HeaderNavProps> = ({
  state,
  activeScenarioId,
  onSelectScenario,
  onResetTable,
  onOpenDataModal,
  onOpenMetadataModal,
  onOpenTour,
  onOpenGCSimulator,
  isQueryDrawerOpen,
  onToggleQueryDrawer,
  isTimeTravelActive,
  activeSnapshotId,
  theme,
  onToggleTheme
}) => {
  const currentMetadata = state.metadataHistory[state.catalogPointer.currentMetadataLocation];
  const totalSnapshots = currentMetadata ? currentMetadata.snapshots.length : 0;
  const currentSnapshot = currentMetadata && activeSnapshotId !== null
    ? currentMetadata.snapshots.find(s => s['snapshot-id'] === activeSnapshotId)
    : (currentMetadata?.snapshots[currentMetadata.snapshots.length - 1] || null);

  const totalFiles = Object.values(state.storageObjects).filter(o => !o.isOrphan).length;
  const totalStorageBytes = Object.values(state.storageObjects)
    .filter(o => !o.isOrphan)
    .reduce((acc, obj) => acc + obj.sizeBytes, 0);

  return (
    <header className="h-16 border-b border-slate-200 dark:border-[#334155] bg-[#FAFAFA]/95 dark:bg-[#0F172A]/95 backdrop-blur-md px-5 flex items-center justify-between z-30 sticky top-0 transition-colors">
      {/* Brand Logo & Title with Minimalist Modern Calistoga Typography */}
      <div className="flex items-center space-x-3.5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0052FF] to-[#4D7CFF] p-[1.5px] shadow-sm shadow-[#0052FF]/20">
          <div className="w-full h-full bg-white dark:bg-[#0F172A] rounded-[10px] flex items-center justify-center">
            <Layers className="w-5 h-5 text-[#0052FF] dark:text-[#4D7CFF] animate-pulse-slow" />
          </div>
        </div>

        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-calistoga tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>Apache</span>
              <span className="gradient-text font-calistoga font-bold">Iceberg</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0052FF]/10 text-[#0052FF] dark:text-[#4D7CFF] border border-[#0052FF]/20 font-mono font-semibold tracking-wider uppercase">
                v2 Spec
              </span>
            </h1>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tracking-wider uppercase">
            Visual Architecture & Lineage Platform
          </p>
        </div>
      </div>

      {/* Scenario Selector & Table Pointer */}
      <div className="flex items-center space-x-3">
        {/* Preset Selector Dropdown */}
        <div className="relative group">
          <button className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-[#334155] hover:border-[#0052FF]/50 text-slate-800 dark:text-slate-200 text-xs font-medium transition-all shadow-sm hover:shadow">
            <Database className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-mono text-amber-600 dark:text-amber-400 font-semibold">{state.catalogPointer.tableIdentifier}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* Dropdown Menu */}
          <div className="absolute top-full left-0 mt-1.5 w-72 py-2 rounded-xl bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-[#334155] shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
            <div className="px-3.5 py-1 text-[10px] uppercase tracking-widest font-mono font-semibold text-slate-400 dark:text-slate-400">
              Preset Lakehouse Workloads
            </div>
            {PRESET_SCENARIOS.map(sc => (
              <button
                key={sc.id}
                onClick={() => onSelectScenario(sc)}
                className={`w-full text-left px-3.5 py-2 flex flex-col space-y-0.5 hover:bg-slate-50 dark:hover:bg-[#25334A] transition-colors ${
                  activeScenarioId === sc.id ? 'bg-[#0052FF]/5 dark:bg-[#0052FF]/15 border-l-2 border-[#0052FF]' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">{sc.name}</span>
                  {activeScenarioId === sc.id && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#4D7CFF]" />
                  )}
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">{sc.tagline}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Live Metrics Pill */}
        <div className="hidden lg:flex items-center space-x-3 px-3.5 py-1.5 rounded-full bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-[#334155] text-xs font-mono text-slate-700 dark:text-slate-300 shadow-sm">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-400 text-[11px]">Snapshots:</span>
            <span className="font-semibold text-slate-900 dark:text-white">{totalSnapshots}</span>
          </div>
          <span className="text-slate-200 dark:text-slate-600">|</span>
          <div className="flex items-center space-x-1.5">
            <FileCode className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#4D7CFF]" />
            <span className="text-slate-400 text-[11px]">Files:</span>
            <span className="font-semibold text-slate-900 dark:text-white">{totalFiles}</span>
          </div>
          <span className="text-slate-200 dark:text-slate-600">|</span>
          <div className="flex items-center space-x-1.5">
            <HardDrive className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-slate-400 text-[11px]">Storage:</span>
            <span className="font-semibold text-slate-900 dark:text-white">{formatBytes(totalStorageBytes)}</span>
          </div>
        </div>

        {isTimeTravelActive && (
          <div className="section-label text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            <span>Time-Travel S{currentSnapshot ? currentSnapshot['sequence-number'] : ''}</span>
          </div>
        )}
      </div>

      {/* Action Buttons & Theme Switcher */}
      <div className="flex items-center space-x-2">
        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-xl bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-[#334155] hover:border-[#0052FF]/40 text-slate-700 dark:text-slate-300 transition-all shadow-sm hover:shadow"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
          ) : (
            <Moon className="w-4 h-4 text-[#0052FF] transition-transform duration-200 hover:-rotate-12" />
          )}
        </button>

        <button
          onClick={onOpenTour}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-[#334155] hover:border-[#0052FF]/50 text-slate-800 dark:text-slate-200 text-xs font-medium transition-all shadow-sm hover:shadow"
          title="Interactive Guided Architectural Tour"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#4D7CFF]" />
          <span className="hidden sm:inline">Guided Tour</span>
        </button>

        <button
          onClick={onOpenMetadataModal}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-[#334155] hover:border-[#0052FF]/50 text-slate-800 dark:text-slate-200 text-xs font-medium transition-all shadow-sm hover:shadow"
          title="Inspect Official Apache Iceberg Table Metadata JSON (Spec v2)"
        >
          <FileJson className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#4D7CFF]" />
          <span className="hidden sm:inline">Table Metadata</span>
        </button>

        <button
          onClick={onOpenDataModal}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-[#334155] hover:border-slate-300 dark:hover:border-slate-600 text-slate-800 dark:text-slate-200 text-xs font-medium transition-all shadow-sm hover:shadow"
          title="Inspect Table Data Grid"
        >
          <TableIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="hidden sm:inline">Table Data</span>
        </button>

        <button
          onClick={onOpenGCSimulator}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#0052FF]/10 to-[#4D7CFF]/15 border border-[#0052FF]/30 hover:border-[#0052FF] text-[#0052FF] dark:text-[#4D7CFF] text-xs font-semibold transition-all shadow-sm hover:shadow"
          title="Snapshot Expiration & Orphan File Cleanup Simulator"
        >
          <Archive className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#4D7CFF]" />
          <span className="hidden sm:inline">GC Simulator</span>
        </button>

        <button
          onClick={onToggleQueryDrawer}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all shadow-sm ${
            isQueryDrawerOpen
              ? 'btn-signature-primary border-transparent'
              : 'bg-white dark:bg-[#1E293B] border-slate-200 dark:border-[#334155] hover:border-[#0052FF]/50 text-slate-800 dark:text-slate-200 hover:shadow'
          }`}
          title="Lakehouse Query Engine Pruning Simulator"
        >
          <Search className={`w-3.5 h-3.5 ${isQueryDrawerOpen ? 'text-white' : 'text-[#0052FF] dark:text-[#4D7CFF]'}`} />
          <span>Query Pruning</span>
        </button>

        <button
          onClick={onResetTable}
          className="p-2 rounded-xl bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-[#334155] hover:border-rose-500/50 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-all shadow-sm hover:shadow"
          title="Reset Table to Clean State"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};

export default HeaderNav;
