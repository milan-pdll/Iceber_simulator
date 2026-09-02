import React from 'react';
import { TableState } from '../engine/types';
import { History, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import { formatTimestamp } from '../utils/formatting';

interface TimeTravelSliderProps {
  state: TableState;
  activeSnapshotId: number | null;
  onSelectSnapshot: (snapshotId: number | null) => void;
}

export const TimeTravelSlider: React.FC<TimeTravelSliderProps> = ({
  state,
  activeSnapshotId,
  onSelectSnapshot
}) => {
  const currentMetadata = state.metadataHistory[state.catalogPointer.currentMetadataLocation];
  if (!currentMetadata || currentMetadata.snapshots.length <= 1) {
    return null;
  }

  const snapshots = currentMetadata.snapshots;
  const latestSnapshot = snapshots[snapshots.length - 1];
  const effectiveSnapshotId = activeSnapshotId || latestSnapshot['snapshot-id'];
  const currentIndex = snapshots.findIndex(s => s['snapshot-id'] === effectiveSnapshotId);
  const isTimeTraveling = activeSnapshotId !== null && activeSnapshotId !== latestSnapshot['snapshot-id'];

  const handlePrev = () => {
    if (currentIndex > 0) {
      onSelectSnapshot(snapshots[currentIndex - 1]['snapshot-id']);
    }
  };

  const handleNext = () => {
    if (currentIndex < snapshots.length - 1) {
      const nextId = snapshots[currentIndex + 1]['snapshot-id'];
      if (nextId === latestSnapshot['snapshot-id']) {
        onSelectSnapshot(null);
      } else {
        onSelectSnapshot(nextId);
      }
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10);
    const selected = snapshots[idx];
    if (selected['snapshot-id'] === latestSnapshot['snapshot-id']) {
      onSelectSnapshot(null);
    } else {
      onSelectSnapshot(selected['snapshot-id']);
    }
  };

  const currentSnapObj = snapshots[currentIndex] || latestSnapshot;

  return (
    <div className="border-t border-slate-200 dark:border-[#243048] bg-white/95 dark:bg-[#0E1524]/95 backdrop-blur-md px-5 py-2.5 flex items-center justify-between z-20 transition-colors duration-200">
      {/* Left info */}
      <div className="flex items-center space-x-3 min-w-[240px]">
        <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400">
          <History className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Snapshot Time-Travel
            </span>
            {isTimeTraveling ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40">
                HISTORICAL VIEW (S{currentSnapObj['sequence-number']})
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40">
                LIVE HEAD (v{currentMetadata['last-sequence-number']})
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
            Commit: {currentSnapObj.summary['commit-desc'] || currentSnapObj.summary.operation.toUpperCase()} • {formatTimestamp(currentSnapObj['timestamp-ms'])}
          </div>
        </div>
      </div>

      {/* Middle Slider & Controls */}
      <div className="flex-1 max-w-xl mx-6 flex items-center space-x-4">
        <button
          onClick={handlePrev}
          disabled={currentIndex <= 0}
          className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Previous Snapshot"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        <div className="flex-1 relative flex flex-col items-center">
          <input
            type="range"
            min={0}
            max={snapshots.length - 1}
            value={currentIndex}
            onChange={handleSliderChange}
            className="w-full accent-sky-500 dark:accent-sky-400 h-1.5 bg-slate-200 dark:bg-[#1F2B42] rounded-lg cursor-pointer transition-all"
          />
          {/* Tick marks */}
          <div className="w-full flex justify-between px-1 mt-1 text-[10px] font-mono text-slate-400 dark:text-slate-500">
            {snapshots.map((s, idx) => (
              <span
                key={s['snapshot-id']}
                className={`cursor-pointer hover:text-sky-600 dark:hover:text-sky-300 ${idx === currentIndex ? 'text-sky-600 dark:text-sky-400 font-bold' : ''}`}
                onClick={() => onSelectSnapshot(s['snapshot-id'] === latestSnapshot['snapshot-id'] ? null : s['snapshot-id'])}
              >
                S{s['sequence-number']}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={handleNext}
          disabled={currentIndex >= snapshots.length - 1}
          className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Next Snapshot"
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      {/* Right Reset / Return to Head */}
      <div className="flex items-center space-x-2">
        {isTimeTraveling && (
          <button
            onClick={() => onSelectSnapshot(null)}
            className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-sky-50 dark:bg-sky-500/20 hover:bg-sky-100 dark:hover:bg-sky-500/30 border border-sky-300 dark:border-sky-400/50 text-sky-700 dark:text-sky-300 text-xs font-semibold transition-all shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Return to Current Head</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default TimeTravelSlider;

