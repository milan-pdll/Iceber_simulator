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
  icon: React.ReactNode;
  content: string[];
  distributedInsight: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: '1. The 3-Tier Metadata Hierarchy',
    subtitle: 'Decoupling Object Storage from Query Engines',
    badge: 'Core Architecture',
    icon: <Layers className="w-6 h-6 text-[#0052FF] dark:text-[#4D7CFF]" />,
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
    icon: <Zap className="w-6 h-6 text-amber-500" />,
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
    icon: <Split className="w-6 h-6 text-rose-500" />,
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
    icon: <Search className="w-6 h-6 text-[#0052FF] dark:text-[#4D7CFF]" />,
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
    icon: <FolderSync className="w-6 h-6 text-teal-500" />,
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
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155] rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="h-16 border-b border-slate-200 dark:border-[#334155] px-6 flex items-center justify-between bg-[#FAFAFA] dark:bg-[#1E293B]">
          <div className="flex items-center space-x-3.5">
            <div className="p-2 rounded-xl bg-[#0052FF]/10 dark:bg-[#0052FF]/20 border border-[#0052FF]/20 text-[#0052FF] dark:text-[#4D7CFF] shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-calistoga text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>Architecture Tour</span>
                <span className="section-label py-0.5 px-2.5 text-[10px]">
                  {currentStep.badge}
                </span>
              </h2>
              <span className="text-[11px] text-slate-400 font-mono">
                Step {stepIndex + 1} of {TOUR_STEPS.length}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-[#0F172A] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5">
          <div className="flex items-start space-x-4">
            <div className="p-3.5 rounded-2xl bg-[#FAFAFA] dark:bg-[#1E293B] border border-slate-200 dark:border-[#334155] shadow-sm shrink-0">
              {currentStep.icon}
            </div>
            <div>
              <h3 className="text-lg font-calistoga text-slate-900 dark:text-white tracking-tight">{currentStep.title}</h3>
              <p className="text-xs text-[#0052FF] dark:text-[#4D7CFF] font-medium mt-0.5">{currentStep.subtitle}</p>
            </div>
          </div>

          <div className="space-y-2.5 bg-slate-50 dark:bg-[#0F172A] p-4 rounded-xl border border-slate-200 dark:border-[#334155] text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            {currentStep.content.map((p, idx) => (
              <p key={idx}>{p}</p>
            ))}
          </div>

          {/* Engine Mechanic Callout */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#0052FF]/5 to-[#4D7CFF]/5 border border-[#0052FF]/20 text-xs">
            <div className="font-bold text-[#0052FF] dark:text-[#4D7CFF] flex items-center gap-1.5 mb-1 font-mono text-[11px]">
              <HardDrive className="w-4 h-4" />
              <span>Distributed Systems Deep-Dive</span>
            </div>
            <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
              {currentStep.distributedInsight}
            </p>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="h-16 border-t border-slate-200 dark:border-[#334155] px-6 flex items-center justify-between bg-[#FAFAFA] dark:bg-[#1E293B]">
          <button
            onClick={handlePrev}
            disabled={stepIndex === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#0F172A] hover:bg-slate-100 dark:hover:bg-[#1E293B] disabled:opacity-30 disabled:cursor-not-allowed border border-slate-200 dark:border-[#334155] text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all shadow-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          {/* Dots Indicator */}
          <div className="flex items-center space-x-1.5">
            {TOUR_STEPS.map((_, idx) => (
              <span
                key={idx}
                className={`h-2 rounded-full transition-all ${
                  idx === stepIndex ? 'btn-signature-primary w-6' : 'bg-slate-300 dark:bg-slate-700 w-2'
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            className="btn-signature-primary flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm"
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
