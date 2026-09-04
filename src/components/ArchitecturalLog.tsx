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
        return { label: 'O(1) Reuse', bg: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30', icon: <Zap className="w-3 h-3 text-amber-500" /> };
      case 'COMMIT':
        return { label: 'Atomic Commit', bg: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30', icon: <CheckCircle className="w-3 h-3 text-emerald-500" /> };
      case 'MOR':
        return { label: 'Merge-on-Read', bg: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30', icon: <Split className="w-3 h-3 text-rose-500" /> };
      case 'COW':
        return { label: 'Copy-on-Write', bg: 'bg-[#0052FF]/10 text-[#0052FF] dark:text-[#4D7CFF] border-[#0052FF]/20', icon: <FileCode className="w-3 h-3 text-[#0052FF]" /> };
      case 'PRUNING':
        return { label: 'Two-Tier Pruning', bg: 'bg-[#0052FF]/10 text-[#0052FF] dark:text-[#4D7CFF] border-[#0052FF]/20', icon: <Search className="w-3 h-3 text-[#0052FF]" /> };
      case 'MAINTENANCE':
        return { label: 'Lakehouse GC', bg: 'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-500/30', icon: <Archive className="w-3 h-3 text-teal-500" /> };
      case 'TIME_TRAVEL':
        return { label: 'Snapshot Isolation', bg: 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30', icon: <History className="w-3 h-3 text-purple-500" /> };
      default:
        return { label: 'Insight', bg: 'bg-slate-100 dark:bg-[#1E293B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#334155]', icon: <Sparkles className="w-3 h-3 text-[#0052FF]" /> };
    }
  };

  const filteredInsights = activeCategory === 'ALL'
    ? insights
    : insights.filter(i => i.category === activeCategory);

  return (
    <div className="border-t border-slate-200 dark:border-[#334155] bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-md select-none z-20 transition-colors duration-200">
      {/* Ticker / Summary Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-5 py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-[#1E293B]/50 transition-colors"
      >
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className="section-label py-0.5 px-2.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Architecture Insights</span>
          </div>

          {latestInsight && (
            <div className="flex items-center space-x-2 text-xs truncate">
              {(() => {
                const badge = getCategoryBadge(latestInsight.category);
                return (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border flex items-center gap-1 ${badge.bg}`}>
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
            {insights.length} insight(s)
          </span>
          <button className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded History Drawer */}
      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-[#334155] p-4 bg-[#FAFAFA] dark:bg-[#0F172A] max-h-72 overflow-y-auto space-y-3">
          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-1.5 pb-1">
            {['ALL', 'REUSE', 'COMMIT', 'MOR', 'COW', 'MAINTENANCE'].map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1 rounded-full text-[11px] font-mono transition-all ${
                  activeCategory === cat
                    ? 'btn-signature-primary font-semibold shadow-sm'
                    : 'bg-white dark:bg-[#1E293B] hover:bg-slate-100 dark:hover:bg-[#25334A] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#334155]'
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
                  className="card-signature p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border flex items-center gap-1 ${badge.bg}`}>
                        {badge.icon}
                        <span>{badge.label}</span>
                      </span>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{insight.title}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">{formatTimestamp(insight.timestamp)}</span>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300">{insight.description}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 font-mono bg-slate-50 dark:bg-[#0F172A] p-2.5 rounded-xl border border-slate-200 dark:border-[#334155]">
                    💡 <span className="text-[#0052FF] dark:text-[#4D7CFF] font-semibold">Engine Mechanics:</span> {insight.technicalDetails}
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
