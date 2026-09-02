import React, { useState } from 'react';
import { ArchitecturalInsight } from '../engine/types';
import {
  Sparkles,
  Zap,
  Split,
  Search,
  Archive,
  ChevronUp,
  ChevronDown,
  History,
  CheckCircle,
  FileCode
} from 'lucide-react';
import { formatTimestamp } from '../utils/formatting';

interface ArchitecturalLogProps {
  insights: ArchitecturalInsight[];
}

export const ArchitecturalLog: React.FC<ArchitecturalLogProps> = ({ insights }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  const latestInsight = insights[0];

  const getCategoryBadge = (category: ArchitecturalInsight['category']) => {
    switch (category) {
      case 'REUSE':
        return { label: 'O(1) Manifest Reuse', bg: 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/40', icon: <Zap className="w-3 h-3 text-amber-500 dark:text-amber-400" /> };
      case 'COMMIT':
        return { label: 'Atomic Commit', bg: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40', icon: <CheckCircle className="w-3 h-3 text-emerald-500 dark:text-emerald-400" /> };
      case 'MOR':
        return { label: 'Merge-on-Read', bg: 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-500/40', icon: <Split className="w-3 h-3 text-rose-500 dark:text-rose-400" /> };
      case 'COW':
        return { label: 'Copy-on-Write', bg: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-500/40', icon: <FileCode className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> };
      case 'PRUNING':
        return { label: 'Two-Tier Pruning', bg: 'bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-500/40', icon: <Search className="w-3 h-3 text-sky-500 dark:text-sky-400" /> };
      case 'MAINTENANCE':
        return { label: 'Lakehouse GC', bg: 'bg-teal-100 dark:bg-teal-500/20 text-teal-800 dark:text-teal-300 border-teal-300 dark:border-teal-500/40', icon: <Archive className="w-3 h-3 text-teal-500 dark:text-teal-400" /> };
      case 'TIME_TRAVEL':
        return { label: 'Snapshot Isolation', bg: 'bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-500/40', icon: <History className="w-3 h-3 text-purple-500 dark:text-purple-400" /> };
      default:
        return { label: 'Insight', bg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700', icon: <Sparkles className="w-3 h-3" /> };
    }
  };

  const filteredInsights = activeCategory === 'ALL'
    ? insights
    : insights.filter(i => i.category === activeCategory);

  return (
    <div className="border-t border-slate-200 dark:border-[#243048] bg-white/95 dark:bg-[#0A0E17]/95 backdrop-blur-md select-none z-20 transition-colors duration-200">
      {/* Ticker / Summary Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-5 py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-[#111726] transition-colors"
      >
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-500/15 border border-sky-300 dark:border-sky-500/30 text-sky-700 dark:text-sky-400 text-xs font-bold shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Architectural Insights</span>
          </div>

          {latestInsight && (
            <div className="flex items-center space-x-2 text-xs truncate">
              {(() => {
                const badge = getCategoryBadge(latestInsight.category);
                return (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${badge.bg}`}>
                    {badge.icon}
                    <span>{badge.label}</span>
                  </span>
                );
              })()}
              <span className="font-semibold text-slate-900 dark:text-slate-200 truncate">{latestInsight.title}:</span>
              <span className="text-slate-500 dark:text-slate-400 truncate hidden md:inline">{latestInsight.description}</span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 hidden sm:inline">
            {insights.length} insight(s) recorded
          </span>
          <button className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded History Drawer */}
      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-[#243048] p-4 bg-slate-50 dark:bg-[#0B0F18] max-h-72 overflow-y-auto space-y-3">
          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-1.5 pb-1">
            {['ALL', 'REUSE', 'COMMIT', 'MOR', 'COW', 'MAINTENANCE'].map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-all ${
                  activeCategory === cat
                    ? 'bg-sky-500 text-white dark:text-slate-950 font-bold shadow-sm'
                    : 'bg-white dark:bg-[#141C2E] hover:bg-slate-100 dark:hover:bg-[#1C273E] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#243048]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="space-y-2.5">
            {filteredInsights.map(insight => {
              const badge = getCategoryBadge(insight.category);

              return (
                <div
                  key={insight.id}
                  className="p-3.5 rounded-xl bg-white dark:bg-[#111828] border border-slate-200 dark:border-[#243048] space-y-1.5 hover:border-slate-300 dark:hover:border-slate-600 transition-colors shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${badge.bg}`}>
                        {badge.icon}
                        <span>{badge.label}</span>
                      </span>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{insight.title}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{formatTimestamp(insight.timestamp)}</span>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300">{insight.description}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 font-mono bg-slate-50 dark:bg-[#080C14] p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                    💡 <span className="text-sky-700 dark:text-sky-300 font-semibold">Engine Mechanics:</span> {insight.technicalDetails}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ArchitecturalLog;
