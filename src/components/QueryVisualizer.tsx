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
    <div className="h-full flex flex-col bg-slate-50 dark:bg-[#0D1424] border-l border-slate-200 dark:border-[#243048] w-96 lg:w-[480px] shadow-2xl select-none shrink-0 z-30 transition-colors duration-200">
      {/* Header */}
      <div className="h-14 border-b border-slate-200 dark:border-[#243048] px-4 flex items-center justify-between bg-slate-100 dark:bg-[#111A2E]">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-500 dark:text-sky-400">
            <Search className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5">
              <span>Query Engine Pruning Tracer</span>
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-500/30">
                Trino / Spark
              </span>
            </h2>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Query Editor & Suggested queries */}
      <div className="p-4 border-b border-slate-200 dark:border-[#243048] bg-white dark:bg-[#0E1526] space-y-2.5">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1">
            <Database className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span>SQL Query Editor</span>
          </span>
          <span className="text-slate-400 dark:text-slate-500 text-[10px]">ANSI SQL</span>
        </div>

        <div className="relative">
          <textarea
            rows={3}
            value={sqlInput}
            onChange={e => setSqlInput(e.target.value)}
            className="w-full p-2.5 bg-slate-100 dark:bg-[#080C14] border border-slate-300 dark:border-[#243048] rounded-xl text-xs font-mono text-slate-800 dark:text-sky-200 focus:outline-none focus:border-sky-500 resize-none"
            placeholder="SELECT * FROM table WHERE ..."
          />
        </div>

        {/* Suggested query chips */}
        {currentScenario && (
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-mono">Suggested Filters:</span>
            <div className="flex flex-wrap gap-1">
              {currentScenario.defaultQueries.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => setSqlInput(q)}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-[#162035] hover:bg-sky-50 dark:hover:bg-sky-500/20 text-slate-700 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-300 border border-slate-200 dark:border-[#243048] transition-all truncate max-w-[200px]"
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
          className="w-full py-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center space-x-2"
        >
          <Play className="w-3.5 h-3.5 fill-white" />
          <span>Execute & Trace Pruning Pipeline</span>
        </button>
      </div>

      {/* Execution Results & Step Tracer */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {queryResult ? (
          <>
            {/* High-Level I/O Avoidance Stats */}
            <div className="grid grid-cols-3 gap-2 bg-white dark:bg-[#131B2E] p-3 rounded-xl border border-slate-200 dark:border-[#243048] shadow-sm">
              <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-[#0B0F17]/80 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block">I/O Avoided</span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {queryResult.ioAvoidancePercentage}%
                </span>
              </div>
              <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-[#0B0F17]/80 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block">Manifests Skipped</span>
                <span className="text-base font-bold text-sky-600 dark:text-sky-400 font-mono">
                  {queryResult.skippedManifests}/{queryResult.totalManifests}
                </span>
              </div>
              <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-[#0B0F17]/80 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block">Files Skipped</span>
                <span className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono">
                  {queryResult.skippedDataFiles}/{queryResult.totalDataFiles}
                </span>
              </div>
            </div>

            {/* 5-Stage Stepper Breakdown */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                <span>5-Stage Lakehouse Scan Trace</span>
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{queryResult.executionTimeMs} ms</span>
              </span>

              <div className="space-y-2">
                {queryResult.stages.map((stage, idx) => {
                  const isSelected = selectedStageIndex === idx;

                  return (
                    <div
                      key={stage.stage}
                      onClick={() => setSelectedStageIndex(isSelected ? null : idx)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        stage.status === 'pruned'
                          ? 'bg-sky-50 dark:bg-[#142036] border-sky-300 dark:border-sky-500/40 hover:border-sky-500'
                          : 'bg-white dark:bg-[#121828] border-slate-200 dark:border-[#243048] hover:border-slate-400'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-2">
                          <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-[10px] font-bold text-sky-700 dark:text-sky-300 shrink-0 mt-0.5">
                            {stage.stage}
                          </span>
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                              <span>{stage.name}</span>
                              {stage.status === 'pruned' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40">
                                  Pruned I/O
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{stage.description}</p>
                          </div>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                      </div>

                      {/* Expanded Details */}
                      {isSelected && stage.details && stage.details.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] font-mono space-y-1">
                          {stage.details.map((d, dIdx) => (
                            <div
                              key={dIdx}
                              className={`p-1.5 rounded ${
                                d.includes('[SKIPPED]')
                                  ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/20'
                                  : d.includes('[Scanned]')
                                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20'
                                  : 'bg-slate-100 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300'
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
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-[#243048]">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                <span>Matching Records ({queryResult.matchingRows.length})</span>
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">Filtered & Reconciled</span>
              </span>

              {queryResult.matchingRows.length > 0 ? (
                <div className="overflow-x-auto max-h-48 border border-slate-200 dark:border-[#243048] rounded-xl bg-white dark:bg-[#0B0F17]">
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="bg-slate-100 dark:bg-[#121929] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-[#243048]">
                      <tr>
                        {Object.keys(queryResult.matchingRows[0])
                          .filter(k => k !== '__file_source')
                          .map(col => (
                            <th key={col} className="p-2 font-medium">{col}</th>
                          ))}
                        <th className="p-2 font-medium text-emerald-600 dark:text-emerald-400">Source Parquet</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {queryResult.matchingRows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-[#141C30]">
                          {Object.entries(row)
                            .filter(([k]) => k !== '__file_source')
                            .map(([, v], cIdx) => (
                              <td key={cIdx} className="p-2 truncate max-w-[120px]">
                                {String(v)}
                              </td>
                            ))}
                          <td className="p-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono truncate max-w-[130px]">
                            {row.__file_source}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 bg-slate-100 dark:bg-[#121828] rounded-xl text-center text-xs text-slate-500 font-mono">
                  No records matched the query predicate.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
            <Search className="w-8 h-8 text-slate-400 dark:text-slate-600" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">No Query Executed Yet</span>
            <p className="text-[11px] text-slate-500">
              Click &quot;Execute &amp; Trace Pruning Pipeline&quot; to see how Iceberg skips manifests and parquet files before scanning data.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QueryVisualizer;

