import React, { useState } from 'react';
import {
  TableState,
  QueryExecutionResult
} from '../engine/types';
import { executeQuerySimulation } from '../engine/querySimulator';
import {
  Search,
  Play,
  ChevronRight,
  Database,
  X
} from 'lucide-react';
import { PRESET_SCENARIOS } from '../engine/presetScenarios';

interface QueryVisualizerProps {
  state: TableState;
  activeSnapshotId: number | null;
  onExecuteQuery: (result: QueryExecutionResult) => void;
  queryResult: QueryExecutionResult | null;
  onClose: () => void;
}

export const QueryVisualizer: React.FC<QueryVisualizerProps> = ({
  state,
  activeSnapshotId,
  onExecuteQuery,
  queryResult,
  onClose
}) => {
  const defaultQuery = `SELECT * FROM ${state.catalogPointer.tableIdentifier} WHERE dept = 'Engineering' AND amount >= 500`;
  const [sqlInput, setSqlInput] = useState<string>(defaultQuery);
  const [selectedStageIndex, setSelectedStageIndex] = useState<number | null>(null);

  const handleRun = () => {
    try {
      const result = executeQuerySimulation(state, sqlInput, activeSnapshotId);
      onExecuteQuery(result);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const currentScenario = PRESET_SCENARIOS.find(s => s.tableIdentifier === state.catalogPointer.tableIdentifier);

  return (
    <div className="h-full flex flex-col bg-[#FAFAFA] dark:bg-[#0F172A] border-l border-slate-200 dark:border-[#334155] w-96 lg:w-[480px] shadow-2xl select-none shrink-0 z-30 transition-colors duration-200">
      {/* Header with Calistoga Title & Section Label */}
      <div className="h-16 border-b border-slate-200 dark:border-[#334155] px-4 flex items-center justify-between bg-white/95 dark:bg-[#1E293B]/95 backdrop-blur-md">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-[#0052FF]/10 border border-[#0052FF]/20 text-[#0052FF] dark:text-[#4D7CFF]">
            <Search className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-calistoga tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>Query Engine Pruning</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#0052FF]/10 text-[#0052FF] dark:text-[#4D7CFF] border border-[#0052FF]/20 uppercase">
                Trino / Spark
              </span>
            </h2>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-[#0F172A] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Query Editor & Suggested queries */}
      <div className="p-4 border-b border-slate-200 dark:border-[#334155] bg-white dark:bg-[#1E293B] space-y-3">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-amber-500" />
            <span>SQL Query Editor</span>
          </span>
          <span className="section-label py-0.5 px-2 text-[9px]">ANSI SQL</span>
        </div>

        <div className="relative">
          <textarea
            rows={3}
            value={sqlInput}
            onChange={e => setSqlInput(e.target.value)}
            className="w-full p-3 bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155] rounded-xl text-xs font-mono text-slate-800 dark:text-sky-200 focus:outline-none focus:ring-2 focus:ring-[#0052FF] resize-none transition-all"
            placeholder="SELECT * FROM table WHERE ..."
          />
        </div>

        {/* Suggested query chips */}
        {currentScenario && (
          <div className="space-y-1.5">
            <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Suggested Filters:</span>
            <div className="flex flex-wrap gap-1.5">
              {currentScenario.defaultQueries.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => setSqlInput(q)}
                  className="px-2.5 py-1 rounded-xl text-[10px] font-mono bg-slate-50 dark:bg-[#0F172A] hover:bg-[#0052FF]/10 text-slate-700 dark:text-slate-300 hover:text-[#0052FF] dark:hover:text-[#4D7CFF] border border-slate-200 dark:border-[#334155] transition-all truncate max-w-[210px]"
                  title={q}
                >
                  {q.split('WHERE')[1] ? `WHERE ${q.split('WHERE')[1].trim()}` : q}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleRun}
          className="btn-signature-primary w-full py-2.5 px-3 flex items-center justify-center space-x-2 text-xs font-semibold"
        >
          <Play className="w-3.5 h-3.5 fill-white" />
          <span>Execute &amp; Trace Pruning Pipeline</span>
        </button>
      </div>

      {/* Execution Results & Step Tracer */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {queryResult ? (
          <>
            {/* High-Level I/O Avoidance Stats */}
            <div className="grid grid-cols-3 gap-2.5 card-signature p-3.5 shadow-sm">
              <div className="text-center p-2.5 rounded-xl bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155]">
                <span className="text-[10px] font-mono text-slate-400 block uppercase tracking-wider">I/O Avoided</span>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {queryResult.ioAvoidancePercentage}%
                </span>
              </div>
              <div className="text-center p-2.5 rounded-xl bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155]">
                <span className="text-[10px] font-mono text-slate-400 block uppercase tracking-wider">Manifests Pruned</span>
                <span className="text-lg font-bold text-[#0052FF] dark:text-[#4D7CFF] font-mono">
                  {queryResult.skippedManifests}/{queryResult.totalManifests}
                </span>
              </div>
              <div className="text-center p-2.5 rounded-xl bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155]">
                <span className="text-[10px] font-mono text-slate-400 block uppercase tracking-wider">Files Skipped</span>
                <span className="text-lg font-bold text-amber-500 font-mono">
                  {queryResult.skippedDataFiles}/{queryResult.totalDataFiles}
                </span>
              </div>
            </div>

            {/* 5-Stage Stepper Breakdown */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-calistoga tracking-tight text-slate-900 dark:text-white">
                  5-Stage Lakehouse Scan Trace
                </span>
                <span className="section-label py-0.5 px-2 text-[10px]">{queryResult.executionTimeMs} ms</span>
              </div>

              <div className="space-y-2">
                {queryResult.stages.map((stage, idx) => {
                  const isSelected = selectedStageIndex === idx;

                  return (
                    <div
                      key={stage.stage}
                      onClick={() => setSelectedStageIndex(isSelected ? null : idx)}
                      className={`card-signature p-3.5 cursor-pointer ${
                        stage.status === 'pruned'
                          ? 'border-[#0052FF]/30 dark:border-[#4D7CFF]/30'
                          : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-2.5">
                          <span className="w-5 h-5 rounded-full bg-[#0052FF]/10 dark:bg-[#0052FF]/20 border border-[#0052FF]/30 flex items-center justify-center text-[10px] font-mono font-bold text-[#0052FF] dark:text-[#4D7CFF] shrink-0 mt-0.5">
                            {stage.stage}
                          </span>
                          <div>
                            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                              <span>{stage.name}</span>
                              {stage.status === 'pruned' && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                                  Pruned I/O
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{stage.description}</p>
                          </div>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                      </div>

                      {/* Expanded Details */}
                      {isSelected && stage.details && stage.details.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-[#334155] text-[11px] font-mono space-y-1.5">
                          {stage.details.map((d, dIdx) => (
                            <div
                              key={dIdx}
                              className={`p-2 rounded-xl ${
                                d.includes('[SKIPPED]')
                                  ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/20'
                                  : d.includes('[Scanned]')
                                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20'
                                  : 'bg-slate-50 dark:bg-[#0F172A] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#334155]'
                              }`}
                            >
                              {d}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Query Result Rows Preview */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-[#334155]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-calistoga tracking-tight text-slate-900 dark:text-white">
                  Matching Records ({queryResult.matchingRows.length})
                </span>
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">Reconciled</span>
              </div>

              {queryResult.matchingRows.length > 0 ? (
                <div className="overflow-x-auto max-h-48 border border-slate-200 dark:border-[#334155] rounded-xl bg-white dark:bg-[#0F172A] shadow-sm">
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="bg-slate-50 dark:bg-[#1E293B] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-[#334155]">
                      <tr>
                        {Object.keys(queryResult.matchingRows[0])
                          .filter(k => k !== '__file_source')
                          .map(col => (
                            <th key={col} className="p-2.5 font-medium">{col}</th>
                          ))}
                        <th className="p-2.5 font-medium text-[#0052FF] dark:text-[#4D7CFF]">Source Parquet</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {queryResult.matchingRows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-[#1E293B]/50 transition-colors">
                          {Object.entries(row)
                            .filter(([k]) => k !== '__file_source')
                            .map(([, v], cIdx) => (
                              <td key={cIdx} className="p-2.5 truncate max-w-[120px]">
                                {String(v)}
                              </td>
                            ))}
                          <td className="p-2.5 text-[10px] text-[#0052FF] dark:text-[#4D7CFF] font-mono truncate max-w-[130px]">
                            {row.__file_source}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 bg-white dark:bg-[#1E293B] rounded-xl border border-slate-200 dark:border-[#334155] text-center text-xs text-slate-400 font-mono">
                  No records matched the query predicate.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2.5">
            <div className="p-3 rounded-full bg-[#0052FF]/5 dark:bg-[#0052FF]/10 text-[#0052FF] dark:text-[#4D7CFF]">
              <Search className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">No Query Executed Yet</span>
            <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
              Click &quot;Execute &amp; Trace Pruning Pipeline&quot; to see how Iceberg skips manifests and parquet files before scanning data.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QueryVisualizer;
