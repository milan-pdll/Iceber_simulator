import React, { useState, useCallback, useEffect } from 'react';
import { TableState, SchemaField, PartitionField, QueryExecutionResult } from './engine/types';
import { PRESET_SCENARIOS, ScenarioDefinition } from './engine/presetScenarios';
import {
  initTableState,
  appendRecords,
  deleteRecordsMoR,
  deleteRecordsCoW,
  updateRecords,
  mergeRecords,
  compactTable,
  expireSnapshots,
  purgeOrphanFiles
} from './engine/icebergEngine';

import { HeaderNav } from './components/HeaderNav';
import { LineageGraphCanvas, SelectedNodeType } from './components/LineageGraphCanvas';
import { ControlPanel } from './components/ControlPanel';
import { TimeTravelSlider } from './components/TimeTravelSlider';
import { QueryVisualizer } from './components/QueryVisualizer';
import { MetadataInspector } from './components/MetadataInspector';
import { DataTableModal } from './components/DataTableModal';
import { MetadataModal } from './components/MetadataModal';
import { ArchitecturalLog } from './components/ArchitecturalLog';
import { GuidedTour } from './components/GuidedTour';
import { IcebergChatbot } from './components/IcebergChatbot';

export function App() {
  // Theme State: 'dark' | 'light'
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('iceberg_theme');
        if (saved === 'light' || saved === 'dark') return saved;
      }
    } catch {
      // ignore
    }
    return 'light';
  });

  useEffect(() => {
    try {
      const root = document.documentElement;
      if (theme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      localStorage.setItem('iceberg_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Primary Table State initialized with a clean empty table (Snapshot 0 only)
  const [activeScenarioId, setActiveScenarioId] = useState<string>('clean');
  const [tableState, setTableState] = useState<TableState>(() => PRESET_SCENARIOS[0].buildInitialState());

  // Navigation & View States
  const [activeSnapshotId, setActiveSnapshotId] = useState<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<SelectedNodeType | null>(null);
  const [queryResult, setQueryResult] = useState<QueryExecutionResult | null>(null);
  const [isQueryDrawerOpen, setIsQueryDrawerOpen] = useState<boolean>(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState<boolean>(false);
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState<boolean>(false);
  const [isTourOpen, setIsTourOpen] = useState<boolean>(false);

  // Scenario Loader
  const handleSelectScenario = useCallback((scenario: ScenarioDefinition) => {
    setActiveScenarioId(scenario.id);
    const newState = scenario.buildInitialState();
    setTableState(newState);
    setActiveSnapshotId(null);
    setSelectedNode(null);
    setQueryResult(null);
    setIsMetadataModalOpen(false);
  }, []);

  // Table Reset
  const handleResetTable = useCallback(() => {
    const scenario = PRESET_SCENARIOS.find(s => s.id === activeScenarioId) || PRESET_SCENARIOS[0];
    const newState = scenario.buildInitialState();
    setTableState(newState);
    setActiveSnapshotId(null);
    setSelectedNode(null);
    setQueryResult(null);
    setIsMetadataModalOpen(false);
  }, [activeScenarioId]);

  // Append Mutation
  const handleAppend = useCallback((records: Record<string, any>[], msg?: string) => {
    setTableState(prev => appendRecords(prev, records, msg));
    setActiveSnapshotId(null); // return to HEAD on new write
  }, []);

  // Delete MoR
  const handleDeleteMoR = useCallback((predicate: string, msg?: string) => {
    setTableState(prev => deleteRecordsMoR(prev, predicate, msg));
    setActiveSnapshotId(null);
  }, []);

  // Delete CoW
  const handleDeleteCoW = useCallback((predicate: string, msg?: string) => {
    setTableState(prev => deleteRecordsCoW(prev, predicate, msg));
    setActiveSnapshotId(null);
  }, []);

  // Update
  const handleUpdate = useCallback((predicate: string, updates: Record<string, any>, mode: 'mor' | 'cow', msg?: string) => {
    setTableState(prev => updateRecords(prev, predicate, updates, mode, msg));
    setActiveSnapshotId(null);
  }, []);

  // Merge (Upsert)
  const handleMerge = useCallback((records: Record<string, any>[], matchKey: string, mode: 'mor' | 'cow', msg?: string) => {
    setTableState(prev => mergeRecords(prev, records, matchKey, mode, msg));
    setActiveSnapshotId(null);
  }, []);

  // Compaction
  const handleCompact = useCallback((msg?: string) => {
    setTableState(prev => compactTable(prev, msg));
    setActiveSnapshotId(null);
  }, []);

  // Expire Snapshots
  const handleExpireSnapshots = useCallback((snapshotIds: number[]) => {
    setTableState(prev => expireSnapshots(prev, snapshotIds));
    setActiveSnapshotId(null);
  }, []);

  // Purge Orphans
  const handlePurgeOrphans = useCallback(() => {
    setTableState(prev => purgeOrphanFiles(prev).state);
  }, []);

  // Custom Table Init
  const handleInitCustomTable = useCallback((name: string, fields: SchemaField[], partFields: PartitionField[]) => {
    const newState = initTableState(name, fields, partFields, `s3://custom-lakehouse/${name.replace('.', '/')}`);
    setTableState(newState);
    setActiveScenarioId('custom');
    setActiveSnapshotId(null);
    setSelectedNode(null);
    setQueryResult(null);
  }, []);

  // Query Execution Handler
  const handleExecuteQuery = useCallback((result: QueryExecutionResult) => {
    setQueryResult(result);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
      {/* Top Navigation Bar */}
      <HeaderNav
        state={tableState}
        activeScenarioId={activeScenarioId}
        onSelectScenario={handleSelectScenario}
        onResetTable={handleResetTable}
        onOpenDataModal={() => setIsDataModalOpen(true)}
        onOpenMetadataModal={() => setIsMetadataModalOpen(true)}
        onOpenTour={() => setIsTourOpen(true)}
        isQueryDrawerOpen={isQueryDrawerOpen}
        onToggleQueryDrawer={() => setIsQueryDrawerOpen(!isQueryDrawerOpen)}
        isTimeTravelActive={activeSnapshotId !== null}
        activeSnapshotId={activeSnapshotId}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Side: Operations & Control Panel */}
        <ControlPanel
          state={tableState}
          onAppendRecords={handleAppend}
          onDeleteRecordsMoR={handleDeleteMoR}
          onDeleteRecordsCoW={handleDeleteCoW}
          onUpdateRecords={handleUpdate}
          onMergeRecords={handleMerge}
          onCompactTable={handleCompact}
          onExpireSnapshots={handleExpireSnapshots}
          onPurgeOrphans={handlePurgeOrphans}
          onInitCustomTable={handleInitCustomTable}
        />

        {/* Center: Main Visual Lineage Canvas & Time Travel Scrubber */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div className="flex-1 relative overflow-hidden">
            <LineageGraphCanvas
              state={tableState}
              activeSnapshotId={activeSnapshotId}
              onSelectNode={setSelectedNode}
              selectedNode={selectedNode}
              queryResult={queryResult}
              isTimeTravelActive={activeSnapshotId !== null}
            />
          </div>

          {/* Time-Travel Snapshot Scrubber */}
          <TimeTravelSlider
            state={tableState}
            activeSnapshotId={activeSnapshotId}
            onSelectSnapshot={setActiveSnapshotId}
          />
        </div>

        {/* Right Side: Query Engine Pruning Simulator (Collapsible) */}
        {isQueryDrawerOpen && (
          <QueryVisualizer
            state={tableState}
            activeSnapshotId={activeSnapshotId}
            onExecuteQuery={handleExecuteQuery}
            queryResult={queryResult}
            onClose={() => setIsQueryDrawerOpen(false)}
          />
        )}

        {/* Raw Metadata Inspector Drawer (Opens on node click) */}
        <MetadataInspector
          selectedNode={selectedNode}
          onClose={() => setSelectedNode(null)}
          state={tableState}
          onOpenFullMetadata={() => setIsMetadataModalOpen(true)}
        />
      </div>

      {/* Bottom Distributed Systems Architectural Insights Feed */}
      <ArchitecturalLog insights={tableState.insights} />

      {/* Modals */}
      <DataTableModal
        isOpen={isDataModalOpen}
        onClose={() => setIsDataModalOpen(false)}
        state={tableState}
        activeSnapshotId={activeSnapshotId}
      />

      <MetadataModal
        isOpen={isMetadataModalOpen}
        onClose={() => setIsMetadataModalOpen(false)}
        state={tableState}
        activeSnapshotId={activeSnapshotId}
      />

      <GuidedTour
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
      />

      {/* IceBot — Floating Concept Chatbot */}
      <IcebergChatbot />
    </div>
  );
}

export default App;
