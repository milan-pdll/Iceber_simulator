import React, { useState } from 'react';
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  Layers,
  Zap,
  Split,
  Search,
  FolderSync,
  HardDrive
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface GuidedTourProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TourStep {
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
  content: string[];
  distributedInsight: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: '1. The 3-Tier Metadata Hierarchy',
    subtitle: 'Decoupling Object Storage from Query Engines',
    badge: 'Core Architecture',
    badgeColor: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-500/40',
    icon: <Layers className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />,
    content: [
      'Traditional Hive tables tracked partitions directly in an external database, requiring expensive file system LIST operations on object storage like S3.',
      'Apache Iceberg organizes metadata into a deterministic, immutable 3-tier tree:',
      '• Catalog: Holds a single atomic pointer to the current vN.metadata.json file.',
      '• Metadata JSON: Contains the schemas, partition specs, and snapshots array.',
      '• Manifest List & Manifest Files: Avro trees tracking data files with complete column metrics.'
    ],
    distributedInsight: 'Because Iceberg tracks files explicitly in Avro manifests, table state is independent of physical object storage directory structures.'
  },
  {
    title: '2. O(1) Commits & Metadata Reuse',
    subtitle: 'Constant Time Transactions at Petabyte Scale',
    badge: 'Performance & Scale',
    badgeColor: 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/40',
    icon: <Zap className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
    content: [
      'When appending new records to a table with 10,000 existing data files, naive formats rewrite the entire metadata index (O(N) write amplification).',
      'In Apache Iceberg, snapshots achieve O(1) commit complexity:',
      '• New data files are bundled into a single new Manifest file.',
      '• The new Manifest List links the new manifest alongside the unchanged manifests from the parent snapshot without touching them.',
      '• The catalog atomically swaps its pointer to the new metadata JSON.'
    ],
    distributedInsight: 'Notice the ⚡ O(1) badges in the DAG canvas—those manifests are shared across multiple snapshot generations without memory or disk duplication.'
  },
  {
    title: '3. Merge-on-Read (MoR) vs Copy-on-Write (CoW)',
    subtitle: 'Balancing Write Amplification against Query Scan Latency',
    badge: 'Row-Level Deletes',
    badgeColor: 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-500/40',
    icon: <Split className="w-6 h-6 text-rose-600 dark:text-rose-400" />,
    content: [
      'Iceberg v2 Spec introduces first-class row-level mutations:',
      '• Merge-on-Read (MoR): Keeps original Parquet data files completely untouched. Writes a small .delete Parquet file containing row positions.',
      '• Copy-on-Write (CoW): Rewrites surviving rows into a new Parquet file and marks the old file as status: 2 (DELETED).',
      '• Query engines (Trino/Spark/DuckDB) reconcile MoR positional deletes in-memory during scan execution.'
    ],
    distributedInsight: 'MoR is optimal for high-throughput streaming CDC pipelines, while CoW is optimal for read-heavy batch reporting tables.'
  },
  {
    title: '4. Two-Tier Query Engine Pruning',
    subtitle: 'Skipping 95%+ of Storage I/O Before Reading Parquet Footers',
    badge: 'Query Engine Internals',
    badgeColor: 'bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-500/40',
    icon: <Search className="w-6 h-6 text-sky-600 dark:text-sky-400" />,
    content: [
      'When a query with a filter runs (e.g., WHERE dept = "Engineering" AND id >= 100), Iceberg executes a two-tier pruning sequence:',
      '• Tier 1 (Manifest List Level): Inspects partition summary bounds. Completely skips entire Manifest files without opening them from object storage.',
      '• Tier 2 (Manifest File Level): Inspects column lower_bounds and upper_bounds for each data file. Skips non-matching Parquet files without reading footers.',
      '• Only matching Parquet files are opened by query worker nodes.'
    ],
    distributedInsight: 'Test this in the Query Pruning tab! You can visually watch skipped manifests turn dim while surviving files glow green.'
  },
  {
    title: '5. Compaction & Garbage Collection',
    subtitle: 'Resolving the Small-File Problem and Reclaiming Storage',
    badge: 'Table Maintenance',
    badgeColor: 'bg-teal-100 dark:bg-teal-500/20 text-teal-800 dark:text-teal-300 border-teal-300 dark:border-teal-500/40',
    icon: <FolderSync className="w-6 h-6 text-teal-600 dark:text-teal-400" />,
    content: [
      'Lakehouse tables naturally accumulate small files and MoR delete files over time.',
      'Iceberg table maintenance solves this via two built-in routines:',
      '• Compaction (rewrite_data_files): Consolidates small files and absorbs positional delete tombstones into clean, full-sized Parquet files.',
      '• Expire Snapshots & Orphan Cleanup: Prunes old snapshots from metadata and physically purges unreachable files from object storage (S3/GCS).'
    ],
    distributedInsight: 'Run Compaction in the Cleanup tab to see positional delete files disappear and data files consolidate atomically into a single clean snapshot.'
  }
];

export const GuidedTour: React.FC<GuidedTourProps> = ({ isOpen, onClose }) => {
  const [stepIndex, setStepIndex] = useState<number>(0);

  if (!isOpen) return null;

  const currentStep = TOUR_STEPS[stepIndex];

  const handleNext = () => {
    if (stepIndex < TOUR_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
      onClose();
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#0E1626] border border-slate-200 dark:border-[#243048] rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="h-16 border-b border-slate-200 dark:border-[#243048] px-6 flex items-center justify-between bg-slate-100 dark:bg-[#121B2E]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-500/15 border border-sky-300 dark:border-sky-500/30 text-sky-600 dark:text-sky-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>Apache Iceberg Architecture Tour</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${currentStep.badgeColor}`}>
                  {currentStep.badge}
                </span>
              </h2>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Step {stepIndex + 1} of {TOUR_STEPS.length}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5">
          <div className="flex items-start space-x-4">
            <div className="p-3 rounded-2xl bg-slate-100 dark:bg-[#141E33] border border-slate-300 dark:border-slate-700/60 shadow-inner shrink-0">
              {currentStep.icon}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">{currentStep.title}</h3>
              <p className="text-xs text-sky-600 dark:text-sky-400 font-medium mt-0.5">{currentStep.subtitle}</p>
            </div>
          </div>

          <div className="space-y-2.5 bg-slate-50 dark:bg-[#090D17] p-4 rounded-xl border border-slate-200 dark:border-[#243048] text-xs text-slate-700 dark:text-slate-300 leading-relaxed shadow-inner">
            {currentStep.content.map((p, idx) => (
              <p key={idx}>{p}</p>
            ))}
          </div>

          {/* Engine Mechanic Callout */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-sky-50 via-indigo-50 to-purple-50 dark:from-sky-950/40 dark:via-indigo-950/30 dark:to-purple-950/40 border border-sky-200 dark:border-sky-500/30 text-xs">
            <div className="font-bold text-sky-700 dark:text-sky-300 flex items-center gap-1.5 mb-1">
              <HardDrive className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>Distributed Systems Deep-Dive</span>
            </div>
            <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
              {currentStep.distributedInsight}
            </p>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="h-16 border-t border-slate-200 dark:border-[#243048] px-6 flex items-center justify-between bg-slate-100 dark:bg-[#121B2E]">
          <button
            onClick={handlePrev}
            disabled={stepIndex === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#162035] hover:bg-slate-100 dark:hover:bg-[#1E2B45] disabled:opacity-30 disabled:cursor-not-allowed border border-slate-300 dark:border-[#243048] text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          {/* Dots Indicator */}
          <div className="flex items-center space-x-1.5">
            {TOUR_STEPS.map((_, idx) => (
              <span
                key={idx}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === stepIndex ? 'bg-sky-500 dark:bg-sky-400 w-5' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-sky-500/20"
          >
            <span>{stepIndex === TOUR_STEPS.length - 1 ? 'Finish Tour' : 'Next Step'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default GuidedTour;

