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
  Moon
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
  isQueryDrawerOpen,
  onToggleQueryDrawer,
  isTimeTravelActive,
  activeSnapshotId,
  theme,
  onToggleTheme
}) => {
  const currentMetadata = state.metadataHistory[state.catalogPointer.currentMetadataLocation];
  const totalSnapshots = currentMetadata ? currentMetadata.snapshots.length : 0;
  const currentSnapshot = currentMetadata && activeSnapshotId
    ? currentMetadata.snapshots.find(s => s['snapshot-id'] === activeSnapshotId)
    : (currentMetadata?.snapshots[currentMetadata.snapshots.length - 1] || null);

  const totalFiles = Object.values(state.storageObjects).filter(o => !o.isOrphan).length;
  const totalStorageBytes = Object.values(state.storageObjects)
    .filter(o => !o.isOrphan)
    .reduce((acc, obj) => acc + obj.sizeBytes, 0);

  return (
    <header className="h-16 border-b border-slate-200 dark:border-[#243048] bg-white/95 dark:bg-[#0E1422]/90 backdrop-blur-md px-5 flex items-center justify-between z-30 sticky top-0 transition-colors">
      {/* Brand Logo & Title */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-teal-400 p-[1.5px] shadow-lg shadow-sky-500/20">
          <div className="w-full h-full bg-slate-900 dark:bg-[#0B0F17] rounded-[10px] flex items-center justify-center">
            <Layers className="w-5 h-5 text-sky-400 animate-pulse-slow" />
          </div>
        </div>

        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>Apache Iceberg</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-300 dark:border-sky-500/30 font-mono font-medium">
                v2 Spec
              </span>
            </h1>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tracking-wide">
            Visual Architecture & Lineage Simulation Platform
          </p>
        </div>
      </div>

      {/* Scenario Selector & Table Pointer */}
      <div className="flex items-center space-x-3">
        {/* Preset Selector Dropdown */}
        <div className="relative group">
          <button className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#161F32] border border-slate-300 dark:border-[#2A3852] hover:border-sky-500/50 text-slate-800 dark:text-slate-200 text-xs font-medium transition-all shadow-sm">
            <Database className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="font-mono text-amber-700 dark:text-amber-300 font-semibold">{state.catalogPointer.tableIdentifier}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* Dropdown Menu */}
          <div className="absolute top-full left-0 mt-1.5 w-72 py-1.5 rounded-xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-[#2A3852] shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
            <div className="px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
              Preset Lakehouse Workloads
            </div>
            {PRESET_SCENARIOS.map(sc => (
              <button
                key={sc.id}
                onClick={() => onSelectScenario(sc)}
                className={`w-full text-left px-3 py-2 flex flex-col space-y-0.5 hover:bg-slate-100 dark:hover:bg-[#1C273E] transition-colors ${
                  activeScenarioId === sc.id ? 'bg-sky-50 dark:bg-sky-500/10 border-l-2 border-sky-500 dark:border-sky-400' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">{sc.name}</span>
                  {activeScenarioId === sc.id && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                  )}
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">{sc.tagline}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Live Metrics Pill */}
        <div className="hidden lg:flex items-center space-x-3 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#111827]/80 border border-slate-200 dark:border-[#243048] text-xs font-mono text-slate-700 dark:text-slate-300">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-slate-500 dark:text-slate-400">Snapshots:</span>
            <span className="font-semibold text-slate-900 dark:text-white">{totalSnapshots}</span>
          </div>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <div className="flex items-center space-x-1.5">
            <FileCode className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span className="text-slate-500 dark:text-slate-400">Files:</span>
            <span className="font-semibold text-slate-900 dark:text-white">{totalFiles}</span>
          </div>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <div className="flex items-center space-x-1.5">
            <HardDrive className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-slate-500 dark:text-slate-400">Storage:</span>
            <span className="font-semibold text-slate-900 dark:text-white">{formatBytes(totalStorageBytes)}</span>
          </div>
        </div>

        {isTimeTravelActive && (
          <div className="px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-300 text-xs font-mono flex items-center space-x-1.5 animate-pulse">
            <span>🕰️ Time-Travel AS OF S{currentSnapshot ? currentSnapshot['sequence-number'] : ''}</span>
          </div>
        )}
      </div>

      {/* Action Buttons & Theme Switcher */}
      <div className="flex items-center space-x-2">
        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          className="p-1.5 rounded-lg bg-slate-100 dark:bg-[#161F32] border border-slate-300 dark:border-[#2A3852] hover:border-sky-500/50 text-slate-700 dark:text-slate-300 transition-all shadow-sm"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-600 transition-transform duration-200 hover:-rotate-12" />
          )}
        </button>

        <button
          onClick={onOpenTour}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-500/15 border border-sky-200 dark:border-sky-500/30 hover:border-sky-400 text-sky-700 dark:text-sky-300 text-xs font-medium transition-all shadow-sm"
          title="Interactive Guided Architectural Tour"
        >
          <Sparkles className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
          <span className="hidden sm:inline">Guided Tour</span>
        </button>

        <button
          onClick={onOpenMetadataModal}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 hover:border-indigo-400 text-indigo-700 dark:text-indigo-300 text-xs font-medium transition-all shadow-sm"
          title="Inspect Official Apache Iceberg Table Metadata JSON (Spec v2)"
        >
          <FileJson className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span className="hidden sm:inline">Table Metadata</span>
        </button>

        <button
          onClick={onOpenDataModal}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#161F32] border border-slate-300 dark:border-[#2A3852] hover:border-slate-400 text-slate-800 dark:text-slate-200 text-xs font-medium transition-all shadow-sm"
          title="Inspect Table Data Grid"
        >
          <TableIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="hidden sm:inline">Table Data</span>
        </button>

        <button
          onClick={onToggleQueryDrawer}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all shadow-sm ${
            isQueryDrawerOpen
              ? 'bg-sky-500 text-white dark:text-slate-950 border-sky-500 font-semibold'
              : 'bg-slate-100 dark:bg-[#161F32] border-slate-300 dark:border-[#2A3852] hover:border-sky-500/50 text-slate-800 dark:text-slate-200'
          }`}
          title="Lakehouse Query Engine Pruning Simulator"
        >
          <Search className={`w-3.5 h-3.5 ${isQueryDrawerOpen ? 'text-white dark:text-slate-950' : 'text-sky-600 dark:text-sky-400'}`} />
          <span>Query Pruning</span>
        </button>

        <button
          onClick={onResetTable}
          className="p-1.5 rounded-lg bg-slate-100 dark:bg-[#161F32] border border-slate-300 dark:border-[#2A3852] hover:border-rose-500/50 text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-all"
          title="Reset Table to Clean State"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};

export default HeaderNav;
