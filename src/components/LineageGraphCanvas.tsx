import React, { useState, useRef, useMemo } from 'react';
import {
  TableState,
  QueryExecutionResult
} from '../engine/types';
import {
  Database,
  FileJson,
  Camera,
  ListTree,
  FileSpreadsheet,
  FileCode,
  FileX2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Zap,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { formatBytes, truncateMiddle, getFilename } from '../utils/formatting';

export type SelectedNodeType =
  | { type: 'catalog'; data: { tableIdentifier: string; location: string } }
  | { type: 'metadata'; location: string; data: any }
  | { type: 'snapshot'; snapshotId: number; data: any }
  | { type: 'manifest-list'; path: string; data: any[] }
  | { type: 'manifest-file'; path: string; data: any }
  | { type: 'data-file'; path: string; data: any }
  | { type: 'delete-file'; path: string; data: any };

interface LineageGraphCanvasProps {
  state: TableState;
  activeSnapshotId: number | null;
  onSelectNode: (node: SelectedNodeType) => void;
  selectedNode: SelectedNodeType | null;
  queryResult: QueryExecutionResult | null;
  isTimeTravelActive: boolean;
}

interface GraphNode {
  id: string;
  type: 'catalog' | 'metadata' | 'snapshot' | 'manifest-list' | 'manifest-file' | 'data-file' | 'delete-file';
  label: string;
  sublabel: string;
  badge?: string;
  badgeColor?: string;
  color: string;
  borderColor: string;
  layerIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isReused?: boolean;
  reusedFromSnapshotId?: number;
  isOrphan?: boolean;
  pruneStatus?: 'scanned' | 'pruned-manifest' | 'pruned-stats' | 'none';
  pruneReason?: string;
  rawPayload: any;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  isReused?: boolean;
  color: string;
  isPruned?: boolean;
}

export const LineageGraphCanvas: React.FC<LineageGraphCanvasProps> = ({
  state,
  activeSnapshotId,
  onSelectNode,
  selectedNode,
  queryResult
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Calculate Layout and Nodes
  const { nodes, edges } = useMemo(() => {
    const currentMetadata = state.metadataHistory[state.catalogPointer.currentMetadataLocation];
    if (!currentMetadata) return { nodes: [], edges: [] };

    // Determine target snapshot to render
    const targetSnap = activeSnapshotId
      ? currentMetadata.snapshots.find(s => s['snapshot-id'] === activeSnapshotId)
      : (currentMetadata.snapshots[currentMetadata.snapshots.length - 1] || null);

    const generatedNodes: GraphNode[] = [];
    const generatedEdges: GraphEdge[] = [];

    // Columns X Coordinates
    const colSpacing = 280;
    const startX = 60;
    const startY = 80;
    const nodeWidth = 220;
    const nodeHeight = 84;

    // Layer 0: Catalog Pointer
    const catalogNode: GraphNode = {
      id: 'node-catalog',
      type: 'catalog',
      label: 'Catalog Pointer',
      sublabel: state.catalogPointer.tableIdentifier,
      color: '#F59E0B',
      borderColor: '#D97706',
      layerIndex: 0,
      x: startX,
      y: startY + 120,
      width: nodeWidth,
      height: nodeHeight,
      rawPayload: state.catalogPointer
    };
    generatedNodes.push(catalogNode);

    // Layer 1: Table Metadata JSON
    const metadataUri = state.catalogPointer.currentMetadataLocation;
    const metadataFileName = getFilename(metadataUri);
    const metadataNode: GraphNode = {
      id: 'node-metadata',
      type: 'metadata',
      label: 'Table Metadata JSON',
      sublabel: metadataFileName,
      badge: `v${currentMetadata['last-sequence-number'] || 1} (Spec v2)`,
      badgeColor: 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40',
      color: '#6366F1',
      borderColor: '#4F46E5',
      layerIndex: 1,
      x: startX + colSpacing,
      y: startY + 120,
      width: nodeWidth,
      height: nodeHeight,
      rawPayload: currentMetadata
    };
    generatedNodes.push(metadataNode);

    // Edge: Catalog -> Metadata
    generatedEdges.push({
      id: 'edge-catalog-meta',
      from: catalogNode.id,
      to: metadataNode.id,
      fromX: catalogNode.x + nodeWidth,
      fromY: catalogNode.y + nodeHeight / 2,
      toX: metadataNode.x,
      toY: metadataNode.y + nodeHeight / 2,
      color: '#F59E0B'
    });

    if (!targetSnap) {
      return { nodes: generatedNodes, edges: generatedEdges };
    }

    // Layer 2: Snapshots
    const activeSnapshots = currentMetadata.snapshots;
    const snapSpacing = 110;
    const snapStartY = Math.max(startY, startY + 120 - ((activeSnapshots.length - 1) * snapSpacing) / 2);

    const snapshotNodeMap: Record<number, GraphNode> = {};

    activeSnapshots.forEach((snap, idx) => {
      const isTarget = snap['snapshot-id'] === targetSnap['snapshot-id'];
      const sNode: GraphNode = {
        id: `node-snap-${snap['snapshot-id']}`,
        type: 'snapshot',
        label: `Snapshot S${snap['sequence-number']}`,
        sublabel: `ID: ${String(snap['snapshot-id']).slice(-6)}...`,
        badge: snap.summary.operation.toUpperCase(),
        badgeColor: snap.summary.operation === 'append' ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40' : 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/40',
        color: isTarget ? '#8B5CF6' : '#6B7280',
        borderColor: isTarget ? '#7C3AED' : '#94A3B8',
        layerIndex: 2,
        x: startX + colSpacing * 2,
        y: snapStartY + idx * snapSpacing,
        width: nodeWidth,
        height: nodeHeight,
        rawPayload: snap
      };
      generatedNodes.push(sNode);
      snapshotNodeMap[snap['snapshot-id']] = sNode;

      // Edge: Metadata -> Snapshot
      generatedEdges.push({
        id: `edge-meta-snap-${snap['snapshot-id']}`,
        from: metadataNode.id,
        to: sNode.id,
        fromX: metadataNode.x + nodeWidth,
        fromY: metadataNode.y + nodeHeight / 2,
        toX: sNode.x,
        toY: sNode.y + nodeHeight / 2,
        color: isTarget ? '#8B5CF6' : '#94A3B8'
      });
    });

    // Layer 3: Manifest List
    const targetSnapNode = snapshotNodeMap[targetSnap['snapshot-id']];
    const manifestListEntries = state.manifestLists[targetSnap['manifest-list']] || [];
    const mListFileName = getFilename(targetSnap['manifest-list']);

    const mListNode: GraphNode = {
      id: `node-mlist-${targetSnap['snapshot-id']}`,
      type: 'manifest-list',
      label: 'Manifest List (.avro)',
      sublabel: mListFileName,
      badge: `${manifestListEntries.length} Manifest(s)`,
      badgeColor: 'bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/40',
      color: '#0284C7',
      borderColor: '#0369A1',
      layerIndex: 3,
      x: startX + colSpacing * 3,
      y: targetSnapNode ? targetSnapNode.y : startY + 120,
      width: nodeWidth,
      height: nodeHeight,
      rawPayload: manifestListEntries
    };
    generatedNodes.push(mListNode);

    if (targetSnapNode) {
      generatedEdges.push({
        id: `edge-snap-mlist-${targetSnap['snapshot-id']}`,
        from: targetSnapNode.id,
        to: mListNode.id,
        fromX: targetSnapNode.x + nodeWidth,
        fromY: targetSnapNode.y + nodeHeight / 2,
        toX: mListNode.x,
        toY: mListNode.y + nodeHeight / 2,
        color: '#0284C7'
      });
    }

    // Layer 4 & 5: Manifest Files & Data/Delete Files
    const manifestSpacing = 160;
    const totalM = Math.max(1, manifestListEntries.length);
    const mStartY = Math.max(startY, mListNode.y - ((totalM - 1) * manifestSpacing) / 2);

    manifestListEntries.forEach((mEntry, mIdx) => {
      const mDoc = state.manifestFiles[mEntry.manifest_path];
      const mFileName = getFilename(mEntry.manifest_path);
      const isReused = Boolean(mEntry.reused_from_snapshot_id);
      const isDeleteManifest = mEntry.content === 1;

      let pruneStatus: GraphNode['pruneStatus'] = 'none';
      let pruneReason: string | undefined = undefined;

      if (queryResult) {
        if (queryResult.prunedManifestPaths.includes(mEntry.manifest_path)) {
          pruneStatus = 'pruned-manifest';
          const matchTrace = queryResult.stages.find(s => s.stage === 3)?.details.find(d => d.includes(mFileName));
          pruneReason = matchTrace || 'Partition bounds outside query filter';
        } else if (queryResult.scannedManifestPaths.includes(mEntry.manifest_path)) {
          pruneStatus = 'scanned';
        }
      }

      const mNodeY = mStartY + mIdx * manifestSpacing;
      const mNode: GraphNode = {
        id: `node-manifest-${mEntry.manifest_path}`,
        type: 'manifest-file',
        label: isDeleteManifest ? 'Delete Manifest (.avro)' : 'Manifest File (.avro)',
        sublabel: mFileName,
        badge: isReused
          ? `⚡ O(1) Reused (S${mEntry.added_snapshot_id ? String(mEntry.added_snapshot_id).slice(-4) : ''})`
          : (isDeleteManifest ? 'DELETES (1)' : `${mDoc ? mDoc.entries.length : 0} Data File(s)`),
        badgeColor: isReused
          ? 'bg-amber-50 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 font-bold'
          : (isDeleteManifest ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-500/40' : 'bg-teal-50 dark:bg-teal-500/20 text-teal-800 dark:text-teal-300 border-teal-300 dark:border-teal-500/40'),
        color: isDeleteManifest ? '#DC2626' : (isReused ? '#F59E0B' : '#0D9488'),
        borderColor: isDeleteManifest ? '#B91C1C' : (isReused ? '#D97706' : '#0F766E'),
        layerIndex: 4,
        x: startX + colSpacing * 4,
        y: mNodeY,
        width: nodeWidth,
        height: nodeHeight,
        isReused,
        reusedFromSnapshotId: mEntry.reused_from_snapshot_id,
        pruneStatus,
        pruneReason,
        rawPayload: mDoc || mEntry
      };
      generatedNodes.push(mNode);

      generatedEdges.push({
        id: `edge-mlist-m-${mEntry.manifest_path}`,
        from: mListNode.id,
        to: mNode.id,
        fromX: mListNode.x + nodeWidth,
        fromY: mListNode.y + nodeHeight / 2,
        toX: mNode.x,
        toY: mNode.y + nodeHeight / 2,
        isReused,
        color: isReused ? '#F59E0B' : (isDeleteManifest ? '#DC2626' : '#0D9488'),
        isPruned: pruneStatus === 'pruned-manifest'
      });

      // Layer 5: Data Files / Delete Files inside this manifest
      if (mDoc) {
        const fileSpacing = 95;
        const validEntries = mDoc.entries.filter(e => e.status !== 2);
        const fileStartY = mNodeY - ((Math.max(1, validEntries.length) - 1) * fileSpacing) / 2;

        validEntries.forEach((entry, fIdx) => {
          const df = entry.data_file;
          const isPosDelete = df.content === 1;
          const fileName = getFilename(df.file_path);

          let filePruneStatus: GraphNode['pruneStatus'] = 'none';
          let filePruneReason: string | undefined = undefined;

          if (queryResult) {
            if (pruneStatus === 'pruned-manifest') {
              filePruneStatus = 'pruned-manifest';
              filePruneReason = 'Parent manifest was skipped by partition filter';
            } else if (queryResult.prunedDataFilePaths.includes(df.file_path)) {
              filePruneStatus = 'pruned-stats';
              const matchTrace = queryResult.stages.find(s => s.stage === 4)?.details.find(d => d.includes(fileName));
              filePruneReason = matchTrace || 'Column min/max stats mismatch';
            } else if (queryResult.scannedDataFilePaths.includes(df.file_path)) {
              filePruneStatus = 'scanned';
            }
          }

          const fileNode: GraphNode = {
            id: `node-file-${df.file_path}`,
            type: isPosDelete ? 'delete-file' : 'data-file',
            label: isPosDelete ? 'Positional Delete (.delete)' : 'Data File (.parquet)',
            sublabel: fileName,
            badge: isPosDelete ? `-${df.record_count} row offset(s)` : `${df.record_count} row(s) • ${formatBytes(df.file_size_in_bytes)}`,
            badgeColor: isPosDelete ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-500/40' : 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40',
            color: isPosDelete ? '#DC2626' : '#16A34A',
            borderColor: isPosDelete ? '#991B1B' : '#15803D',
            layerIndex: 5,
            x: startX + colSpacing * 5,
            y: fileStartY + fIdx * fileSpacing,
            width: nodeWidth,
            height: nodeHeight,
            pruneStatus: filePruneStatus,
            pruneReason: filePruneReason,
            rawPayload: entry
          };
          generatedNodes.push(fileNode);

          generatedEdges.push({
            id: `edge-m-file-${df.file_path}`,
            from: mNode.id,
            to: fileNode.id,
            fromX: mNode.x + nodeWidth,
            fromY: mNode.y + nodeHeight / 2,
            toX: fileNode.x,
            toY: fileNode.y + nodeHeight / 2,
            color: isPosDelete ? '#DC2626' : '#16A34A',
            isPruned: filePruneStatus === 'pruned-manifest' || filePruneStatus === 'pruned-stats'
          });
        });
      }
    });

    return { nodes: generatedNodes, edges: generatedEdges };
  }, [state, activeSnapshotId, queryResult]);

  // Pan & Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.graph-node-interactive')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => setZoom(z => Math.min(1.8, z + 0.15));
  const handleZoomOut = () => setZoom(z => Math.max(0.4, z - 0.15));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 50, y: 50 });
  };

  const handleNodeClick = (node: GraphNode) => {
    switch (node.type) {
      case 'catalog':
        onSelectNode({ type: 'catalog', data: node.rawPayload });
        break;
      case 'metadata':
        onSelectNode({ type: 'metadata', location: state.catalogPointer.currentMetadataLocation, data: node.rawPayload });
        break;
      case 'snapshot':
        onSelectNode({ type: 'snapshot', snapshotId: node.rawPayload['snapshot-id'], data: node.rawPayload });
        break;
      case 'manifest-list':
        onSelectNode({ type: 'manifest-list', path: node.sublabel, data: node.rawPayload });
        break;
      case 'manifest-file':
        onSelectNode({ type: 'manifest-file', path: node.rawPayload.path || node.id, data: node.rawPayload });
        break;
      case 'data-file':
        onSelectNode({ type: 'data-file', path: node.rawPayload.data_file?.file_path || node.id, data: node.rawPayload });
        break;
      case 'delete-file':
        onSelectNode({ type: 'delete-file', path: node.rawPayload.data_file?.file_path || node.id, data: node.rawPayload });
        break;
    }
  };

  const getNodeIcon = (type: GraphNode['type']) => {
    switch (type) {
      case 'catalog':
        return <Database className="w-4 h-4 text-amber-500 dark:text-amber-400" />;
      case 'metadata':
        return <FileJson className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />;
      case 'snapshot':
        return <Camera className="w-4 h-4 text-purple-500 dark:text-purple-400" />;
      case 'manifest-list':
        return <ListTree className="w-4 h-4 text-sky-500 dark:text-sky-400" />;
      case 'manifest-file':
        return <FileSpreadsheet className="w-4 h-4 text-teal-500 dark:text-teal-400" />;
      case 'data-file':
        return <FileCode className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />;
      case 'delete-file':
        return <FileX2 className="w-4 h-4 text-rose-500" />;
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className={`relative w-full h-full overflow-hidden bg-slate-50 dark:bg-[#0B0F17] canvas-grid-pattern cursor-${isDragging ? 'grabbing' : 'grab'} select-none transition-colors duration-200`}
    >
      {/* Canvas Top Bar Controls & Legend */}
      <div className="absolute top-4 left-4 z-20 flex items-center space-x-2 bg-white/95 dark:bg-[#111827]/90 backdrop-blur-md border border-slate-200 dark:border-[#243048] p-1.5 rounded-xl shadow-xl">
        <button
          onClick={handleZoomIn}
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-sky-500 hover:bg-slate-100 dark:hover:bg-[#1E293B] rounded-lg transition-all"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-sky-500 hover:bg-slate-100 dark:hover:bg-[#1E293B] rounded-lg transition-all"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetView}
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-sky-500 hover:bg-slate-100 dark:hover:bg-[#1E293B] rounded-lg transition-all"
          title="Reset View"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 px-2">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Layer Hierarchy Header Legend */}
      <div className="absolute top-4 right-4 z-20 hidden md:flex items-center space-x-3 bg-white/95 dark:bg-[#111827]/90 backdrop-blur-md border border-slate-200 dark:border-[#243048] px-3 py-1.5 rounded-xl text-[11px] font-mono shadow-xl">
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
          <span className="text-slate-700 dark:text-slate-300">Catalog</span>
        </div>
        <span className="text-slate-400 dark:text-slate-600">➔</span>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#6366F1]" />
          <span className="text-slate-700 dark:text-slate-300">Metadata JSON</span>
        </div>
        <span className="text-slate-400 dark:text-slate-600">➔</span>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0284C7]" />
          <span className="text-slate-700 dark:text-slate-300">Manifest List</span>
        </div>
        <span className="text-slate-400 dark:text-slate-600">➔</span>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0D9488]" />
          <span className="text-slate-700 dark:text-slate-300">Manifest File</span>
        </div>
        <span className="text-slate-400 dark:text-slate-600">➔</span>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" />
          <span className="text-slate-700 dark:text-slate-300">Data / Delete File</span>
        </div>
      </div>

      {/* Main SVG & Canvas Transform Area */}
      <div
        className="w-full h-full transform-gpu transition-transform duration-75 origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
        }}
      >
        {/* SVG Connectors */}
        <svg className="absolute top-0 left-0 w-[4000px] h-[3000px] pointer-events-none z-0">
          {edges.map(edge => {
            const dx = edge.toX - edge.fromX;
            const control1X = edge.fromX + dx * 0.45;
            const control1Y = edge.fromY;
            const control2X = edge.fromX + dx * 0.55;
            const control2Y = edge.toY;
            const pathD = `M ${edge.fromX} ${edge.fromY} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${edge.toX} ${edge.toY}`;

            const isPruned = edge.isPruned;

            return (
              <g key={edge.id}>
                {/* Background Shadow line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={isPruned ? '#E2E8F0' : (edge.isReused ? 'rgba(245, 158, 11, 0.4)' : `${edge.color}33`)}
                  strokeWidth={edge.isReused ? 4 : 3}
                  strokeDasharray={edge.isReused ? '6,4' : undefined}
                />
                {/* Active Main line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={isPruned ? '#94A3B8' : (edge.isReused ? '#F59E0B' : edge.color)}
                  strokeWidth={edge.isReused ? 2.5 : 1.5}
                  strokeDasharray={edge.isReused ? '6,4' : undefined}
                  opacity={isPruned ? 0.3 : 0.85}
                />
              </g>
            );
          })}
        </svg>

        {/* Graph Nodes */}
        {nodes.map(node => {
          const isSelected = selectedNode && (
            (selectedNode.type === 'catalog' && node.type === 'catalog') ||
            (selectedNode.type === 'metadata' && node.type === 'metadata') ||
            (selectedNode.type === 'snapshot' && node.type === 'snapshot' && selectedNode.snapshotId === node.rawPayload['snapshot-id']) ||
            (selectedNode.type === 'manifest-list' && node.type === 'manifest-list') ||
            (selectedNode.type === 'manifest-file' && node.type === 'manifest-file' && (selectedNode.path === node.rawPayload.path || selectedNode.path === node.id)) ||
            (selectedNode.type === 'data-file' && node.type === 'data-file' && (selectedNode.path === node.rawPayload.data_file?.file_path || selectedNode.path === node.id)) ||
            (selectedNode.type === 'delete-file' && node.type === 'delete-file' && (selectedNode.path === node.rawPayload.data_file?.file_path || selectedNode.path === node.id))
          );

          const isPruned = node.pruneStatus === 'pruned-manifest' || node.pruneStatus === 'pruned-stats';
          const isScanned = node.pruneStatus === 'scanned';

          return (
            <div
              key={node.id}
              onClick={() => handleNodeClick(node)}
              className={`graph-node-interactive absolute rounded-xl p-3 flex flex-col justify-between transition-all duration-150 cursor-pointer shadow-md ${
                isSelected
                  ? 'ring-2 ring-sky-500 dark:ring-sky-400 shadow-sky-500/30 scale-105 z-10'
                  : 'hover:scale-[1.02] hover:shadow-lg'
              } ${
                isPruned
                  ? 'opacity-40 grayscale border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-[#0F1420]/80'
                  : isScanned
                  ? 'border-2 border-emerald-500 dark:border-emerald-400 bg-emerald-50/90 dark:bg-[#111A2E]/95 shadow-emerald-500/20'
                  : 'border bg-white dark:bg-[#131B2E]/95'
              }`}
              style={{
                left: `${node.x}px`,
                top: `${node.y}px`,
                width: `${node.width}px`,
                height: `${node.height}px`,
                borderColor: !isPruned && !isScanned ? node.borderColor : undefined
              }}
            >
              {/* Top Row: Icon, Title & Badge */}
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex items-center space-x-2 min-w-0">
                  <div
                    className="p-1 rounded-lg shrink-0"
                    style={{ backgroundColor: `${node.color}20` }}
                  >
                    {getNodeIcon(node.type)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate tracking-tight">
                      {node.label}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      {truncateMiddle(node.sublabel, 20)}
                    </div>
                  </div>
                </div>

                {node.isReused && (
                  <span className="shrink-0 flex items-center space-x-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40">
                    <Zap className="w-2.5 h-2.5 fill-amber-500 dark:fill-amber-300" />
                    <span>O(1)</span>
                  </span>
                )}
              </div>

              {/* Bottom Row: Metadata Badge & Pruning State */}
              <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-slate-200 dark:border-slate-700/40">
                {node.badge && (
                  <span className={`px-1.5 py-0.5 rounded border text-[9px] font-medium truncate max-w-[150px] ${node.badgeColor || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
                    {node.badge}
                  </span>
                )}

                {/* Pruning Indicator Badge */}
                {isScanned && (
                  <span className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[9px]">
                    <CheckCircle className="w-3 h-3" />
                    <span>Scanned</span>
                  </span>
                )}

                {isPruned && (
                  <span className="flex items-center space-x-1 text-rose-600 dark:text-rose-400 font-semibold text-[9px]">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Skipped</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LineageGraphCanvas;
