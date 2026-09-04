import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, MessageCircle, Send, Bot, User, Minimize2, ChevronDown, Sparkles, RotateCcw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

interface KBEntry {
  keywords: string[];
  answer: string;
}

// ─── Knowledge Base ──────────────────────────────────────────────────────────
// Rich FAQ corpus covering every concept in the Apache Iceberg Visual Simulator.

const KNOWLEDGE_BASE: KBEntry[] = [
  // ── General / What is this ──────────────────────────────────────────────────
  {
    keywords: ['what is', 'about', 'platform', 'simulator', 'tool', 'purpose', 'overview'],
    answer: `**Apache Iceberg Visual Architecture & Lineage Simulator** 🧊

This is an interactive, production-grade platform for exploring **Apache Iceberg Table Format Spec v2** internals visually.

It models how modern Lakehouse engines — **Trino**, **Apache Spark**, **DuckDB**, and **Flink** — manage:
- ⚡ Atomic commits & snapshot isolation
- 🔄 Merge-on-Read (MoR) & Copy-on-Write (CoW) mutations
- 📊 O(1) manifest reuse for billion-row tables
- 🔍 Two-tier query scan pruning
- ⏱️ Historical time-travel

Every action creates **genuine spec-compliant Iceberg metadata structures** in memory — this isn't a mockup, it's a real implementation!`,
  },

  // ── Apache Iceberg ──────────────────────────────────────────────────────────
  {
    keywords: ['apache iceberg', 'iceberg', 'what is iceberg', 'table format'],
    answer: `**Apache Iceberg** is an open table format for huge analytic datasets. 🧊

**Why it was created:**
Traditional Hive-style data lakes use physical directory structures for partitioning (e.g. \`/dept=Sales/date=2026-01/*.parquet\`), which causes:
- ❌ Expensive recursive file listings
- ❌ Unsafe concurrent mutations
- ❌ No transaction isolation

**What Iceberg does instead:**
It replaces directory listings with a **deterministic, immutable DAG (directed acyclic graph) of metadata files** in object storage.

The metadata tree looks like:
\`\`\`
Catalog Pointer
   └─ Table Metadata JSON (vN.metadata.json)
        └─ Snapshot → Manifest List (.avro)
              └─ Manifest Files (.avro)
                    └─ Data Files (.parquet)
                    └─ Delete Files (.delete)
\`\`\`

**Result:** Full ACID transactions, time-travel, zero-copy schema evolution, and petabyte-scale efficiency.`,
  },

  // ── Metadata Tree / Layers ───────────────────────────────────────────────────
  {
    keywords: ['metadata', 'metadata tree', 'layers', 'hierarchy', 'structure', 'dag'],
    answer: `**The Apache Iceberg v2 Metadata Tree** has 6 layers:

| Layer | File | Role |
|---|---|---|
| **Catalog** | N/A (REST/Nessie/JDBC) | Atomic pointer to current metadata file |
| **Table Metadata** | vN.metadata.json | Schema, partition specs, snapshot log |
| **Manifest List** | snap-{id}.avro | Lists all manifest files in a snapshot |
| **Manifest File** | {id}-m{idx}.avro | Tracks data/delete files with status codes |
| **Data File** | *.parquet | Actual rows + column statistics |
| **Delete File** | *-pos-deletes.delete | MoR tombstone (row positions to skip) |

**Status codes in manifest entries:**
- \`0\` = EXISTING (reused from prior snapshot)
- \`1\` = ADDED (new in this snapshot)
- \`2\` = DELETED (logically removed)`,
  },

  // ── Snapshot ─────────────────────────────────────────────────────────────────
  {
    keywords: ['snapshot', 'snapshots', 'what is snapshot', 'snapshot id', 'commit'],
    answer: `**Snapshots** are the core of Iceberg's ACID guarantees. 📸

Each snapshot represents a **complete, immutable state of the table** at a point in time.

**Structure:**
- \`snapshot-id\`: A unique integer (0, 1, 2, 3…)
- \`parent-snapshot-id\`: Links to the previous snapshot (null for Snapshot 0)
- \`sequence-number\`: Monotonically increasing integer
- \`manifest-list\`: Path to the .avro file listing all manifests
- \`operation\`: append, delete, replace (compaction), etc.

**Snapshot 0 (S0)** is the initial empty table state created automatically when a table is initialized — even before any rows land. This allows time-travel back to the pristine empty state.

**Snapshot chain:** S0 → S1 → S2 → S3 → …

Every write creates a new snapshot atomically, leaving all prior snapshots intact (perfect for time-travel!).`,
  },

  // ── Atomic Commits / OCC ────────────────────────────────────────────────────
  {
    keywords: ['atomic', 'commit', 'atomic commit', 'optimistic', 'concurrency', 'occ', 'cas', 'compare and swap', 'transaction'],
    answer: `**Atomic Commits & Optimistic Concurrency Control (OCC)** ⚛️

When a writer commits to an Iceberg table:

1. **Read**: Writer reads the current vN.metadata.json from the Catalog
2. **Write**: Writer stages new data files, manifests, and a new v{N+1}.metadata.json
3. **CAS**: Writer executes an atomic **Compare-And-Swap** on the Catalog pointer

If another writer updated the catalog between step 1 and 3, the transaction **fails and must retry** (optimistic conflict detection).

**Why OCC instead of locks?**
- No distributed locking infrastructure needed
- Readers never block writers
- Writers rarely block each other (conflicts are uncommon in practice)

This enables true **serializable isolation** at cloud object-storage scale!`,
  },

  // ── Manifest List ────────────────────────────────────────────────────────────
  {
    keywords: ['manifest list', 'snap avro', 'avro', 'manifest list file'],
    answer: `**Manifest List** (snap-{id}.avro) 📋

The manifest list is an Avro file that **lists all manifest files** belonging to a specific snapshot.

**Each entry in the manifest list contains:**
- Path to a manifest file
- Partition boundary summaries (min/max per partition column)
- Added/deleted file counts
- Whether this manifest is reused from a prior snapshot

**Key role in query pruning:**
During a query, the engine uses partition summaries in the manifest list to **skip entire manifests** whose partition ranges don't overlap the query filter — without even reading those manifest files!

This is **Tier 1 pruning** (manifest-level skipping).`,
  },

  // ── Manifest File ────────────────────────────────────────────────────────────
  {
    keywords: ['manifest file', 'manifest', 'manifest entry'],
    answer: `**Manifest Files** ({id}-m{idx}.avro) 📂

A manifest file is an Avro file that **tracks individual data files and delete files**.

**Each manifest entry records:**
- File path (e.g., s3://bucket/table/data/part-00001.parquet)
- File content type: \`0\` = DATA, \`1\` = POSITIONAL_DELETES
- Status: \`0\` = EXISTING, \`1\` = ADDED, \`2\` = DELETED
- **Column statistics**: lower bounds, upper bounds, null counts
- Record count & file size in bytes

**Role in query pruning (Tier 2):**
The engine reads column lower_bounds/upper_bounds to skip individual data files that can't satisfy a query predicate (e.g., skip a file where max(amount) = 890 when querying amount >= 1000).`,
  },

  // ── O(1) Manifest Reuse ──────────────────────────────────────────────────────
  {
    keywords: ['o(1)', 'manifest reuse', 'reuse', 'constant time', 'o1'],
    answer: `**O(1) Manifest Reuse** ⚡

This is one of Iceberg's most powerful optimizations!

**The problem with naive approaches:**
If a table has 1 million data files across 10,000 manifests, every append would need to rewrite all 10,000 manifests — O(N) cost!

**Iceberg's solution:**
When you append new data, Iceberg:
1. Writes **only new manifest files** for the newly added data files
2. **Reuses all unchanged manifest files by reference** in the new manifest list

The new manifest list simply points to the old manifests without copying or re-scanning them.

**Result:** Appending data to a table with a billion rows takes the **same constant time** as appending to an empty table — true O(1) complexity!

In the simulator, you'll see old manifest nodes highlighted in the lineage graph when reused.`,
  },

  // ── MoR ─────────────────────────────────────────────────────────────────────
  {
    keywords: ['merge on read', 'mor', 'merge-on-read', 'positional delete', 'delete file', 'tombstone'],
    answer: `**Merge-on-Read (MoR)** 🔄

MoR is a mutation strategy that writes **lightweight delete files** instead of rewriting data.

**How it works:**
1. A .delete positional file is written containing the (file-path, row-offset) pairs of deleted/updated rows
2. Original Parquet data files are **NOT touched**
3. At read time, the engine **merges** data files with delete files to reconstruct the correct view

**Trade-offs:**

| Aspect | MoR |
|---|---|
| Write speed | ⚡ Ultra-fast |
| Write I/O | ✅ Minimal |
| Read speed | 🐢 Slower (requires join) |
| Compaction needed? | ✅ Yes, periodically |
| Best for | High-frequency updates, CDC streams |

In the simulator, MoR delete files appear as **red tombstone nodes** in the lineage graph.`,
  },

  // ── CoW ─────────────────────────────────────────────────────────────────────
  {
    keywords: ['copy on write', 'cow', 'copy-on-write', 'rewrite'],
    answer: `**Copy-on-Write (CoW)** ✍️

CoW is a mutation strategy that **rewrites entire Parquet files** when rows are modified.

**How it works:**
1. The engine reads the original data file
2. Filters out deleted/updated rows
3. Writes a **brand-new Parquet file** with the surviving rows
4. The old file is marked as status \`2 (DELETED)\` in the manifest

**Trade-offs:**

| Aspect | CoW |
|---|---|
| Write speed | 🐢 High latency |
| Write I/O | ❌ Full file rewrite |
| Read speed | ⚡ Fast (clean files) |
| Compaction needed? | ✅ No, already clean |
| Best for | Read-heavy analytics, infrequent updates |

**When to use CoW vs MoR:**
- Use **MoR** for real-time streaming / CDC workloads
- Use **CoW** for batch analytics with rare mutations`,
  },

  // ── MoR vs CoW comparison ────────────────────────────────────────────────────
  {
    keywords: ['mor vs cow', 'compare mor cow', 'difference between mor and cow', 'mor or cow'],
    answer: `**MoR vs CoW — Full Comparison** 🔄 vs ✍️

| Metric | Merge-on-Read (MoR) | Copy-on-Write (CoW) |
|---|---|---|
| **Write Latency** | ⚡ Ultra-Fast | 🐢 High |
| **Write I/O Amplification** | ✅ Minimal | ❌ Full file rewrite |
| **Read Latency** | 🐢 Requires join with delete files | ⚡ Clean reads |
| **Compaction Needed?** | ✅ Yes | ✅ No |
| **Ideal Workload** | High-frequency streaming, CDC | Read-heavy analytics |

**Rule of thumb:**
- 🌊 Streaming ingestion + frequent small deletes → **MoR**
- 📊 Analytical dashboards + rare mutations → **CoW**

Both strategies produce identical query results — the choice is purely a performance trade-off!`,
  },

  // ── Two-Tier Query Pruning ───────────────────────────────────────────────────
  {
    keywords: ['query', 'pruning', 'two tier', 'scan', 'query pruning', 'filter', 'predicate', 'scan planning'],
    answer: `**Two-Tier Query Pruning Engine** 🔍

When you run a query like:
\`\`\`sql
SELECT * FROM orders WHERE dept = 'Sales' AND amount >= 1000
\`\`\`

The engine avoids reading unnecessary files via 2-tier pruning:

**Tier 1 — Manifest List Pruning (Partition-Level):**
- Reads partition summaries from the manifest list
- Any manifest whose dept partition range doesn't include 'Sales' is **skipped entirely**
- No need to open those manifest files!

**Tier 2 — Data File Pruning (Column Stats):**
- Reads lower_bounds/upper_bounds from manifest entries
- Any file where max(amount) < 1000 is **skipped**
- Only surviving files are actually read

**Then:**
- **MoR Tombstone Application**: Delete positions are applied
- **Vectorized Row Evaluation**: Remaining rows are scanned

**Result:** The simulator shows you exactly which files were pruned and the **I/O storage avoidance %** saved!`,
  },

  // ── Time Travel ──────────────────────────────────────────────────────────────
  {
    keywords: ['time travel', 'as of', 'historical', 'history', 'past', 'rollback', 'time-travel'],
    answer: `**Snapshot Time-Travel** ⏱️

Because every snapshot is immutable and points to a specific manifest list, you can query **any historical state** of the table!

**Query syntax:**
\`\`\`sql
-- By snapshot ID
SELECT * FROM table AS OF snapshot_id = 3

-- By timestamp
SELECT * FROM table AS OF TIMESTAMP '2026-09-01 12:00:00'
\`\`\`

**In this simulator:**
Use the **Time-Travel Scrubber** at the bottom of the screen — drag it left/right to instantly see the metadata tree, data files, and table contents as they existed at any past snapshot!

**Use cases:**
- 🔍 Debug "what changed?" by comparing snapshots
- ⚖️ Audit compliance (GDPR, financial regulations)
- 🔄 Rollback accidental deletions
- 📊 Reproduce historical reports exactly`,
  },

  // ── Compaction ───────────────────────────────────────────────────────────────
  {
    keywords: ['compact', 'compaction', 'rewrite data files', 'small files', 'maintenance'],
    answer: `**Table Compaction** 🧹

Over time, streaming writes and MoR deletes create **small fragmented files** and accumulate delete tombstones.

**Compaction (rewrite_data_files):**
1. Reads records from multiple small data files
2. Applies all pending delete tombstones
3. Rewrites **consolidated, clean Parquet files** under a new snapshot (operation: replace)
4. Marks old small files as status \`2 (DELETED)\`

**Benefits:**
- 📈 Dramatically improves read performance
- 💾 Reduces storage overhead from redundant delete files
- 🔍 Enables better column statistics for query pruning

**Snapshot Expiration:**
- Removes old snapshots from metadata, freeing catalog space

**Orphan File Cleanup:**
- Physically deletes unreferenced files from object storage once retention windows lapse

In the simulator, click **Compact** in the Maintenance tab to see this in action!`,
  },

  // ── MERGE INTO ───────────────────────────────────────────────────────────────
  {
    keywords: ['merge', 'merge into', 'upsert', 'cdc', 'merge operation'],
    answer: `**MERGE INTO (Upsert / CDC)** 🔀

The MERGE INTO operation is the most powerful write pattern in Iceberg.

**How it works:**
Given an incoming batch and a match key (e.g., id):
- **WHEN MATCHED** → Update the existing row (via MoR tombstone + new row, or CoW rewrite)
- **WHEN NOT MATCHED** → Insert the new row (standard append)

**In the simulator:**
1. Go to the **Merge** tab in the Control Panel
2. Choose MoR or CoW mode
3. Paste your CDC batch or use a preset (Quick Upsert, CDC Stream Batch)
4. Watch the lineage graph update with the correct Iceberg structures

**Real-world use cases:**
- 🏦 FinTech ledger reconciliation
- 🛍️ E-commerce order status updates
- 📡 IoT device state synchronization`,
  },

  // ── Catalog ──────────────────────────────────────────────────────────────────
  {
    keywords: ['catalog', 'rest catalog', 'nessie', 'jdbc', 'catalog pointer'],
    answer: `**The Catalog** 📖

The Catalog is the single source of truth that maps a **table name → current metadata file path**.

**Role:**
- Holds the atomic pointer to the active vN.metadata.json
- Commits are atomic CAS (Compare-And-Swap) operations on this pointer
- All readers always start by fetching the current metadata path from the Catalog

**Catalog implementations in the real world:**
- **REST Catalog** (Apache Iceberg REST spec — most common)
- **AWS Glue** (AWS-native)
- **Project Nessie** (Git-like branching for data)
- **JDBC Catalog** (PostgreSQL/MySQL backed)
- **Hive Metastore** (legacy, but supported)

In this simulator, the Catalog is the **top-level node** in the lineage graph — click on it to inspect the atomic pointer!`,
  },

  // ── Table Metadata JSON ──────────────────────────────────────────────────────
  {
    keywords: ['table metadata', 'metadata json', 'vn metadata', 'v1 metadata', 'metadata file'],
    answer: `**Table Metadata JSON** (vN.metadata.json) 📄

This is the heart of every Iceberg table. It's a JSON file stored in object storage.

**Key fields:**
- \`format-version\`: Always 2 for Iceberg v2
- \`table-uuid\`: Globally unique table identifier
- \`schema\`: Column definitions and data types
- \`partition-specs\`: How data is partitioned
- \`current-snapshot-id\`: The active snapshot
- \`snapshots\`: Array of all historical snapshots
- \`snapshot-log\`: Timestamp → snapshot-id log
- \`metadata-log\`: History of metadata file versions

**Click "Table Metadata" in the top nav** to open the full explorer with:
- Schema & types table
- Snapshot commit log
- Storage distribution charts
- Raw syntax-highlighted JSON (downloadable!)`,
  },

  // ── Scenarios ────────────────────────────────────────────────────────────────
  {
    keywords: ['scenario', 'scenarios', 'preset', 'ecommerce', 'fintech', 'iot', 'custom table'],
    answer: `**Pre-Configured Industry Scenarios** 💼

The simulator ships with 4 ready-to-explore scenarios:

**1. 🛍️ E-Commerce Orders** (ecommerce.orders_analytics)
- Partitioned by dept (identity transform)
- Multi-batch ingestion, manifest reuse, MoR cancellations

**2. 🏦 FinTech Transactions** (fintech.ledger_transactions)
- Partitioned by country (identity transform)
- ACID audit logging, real-time transaction streams

**3. 📡 IoT Telemetry** (iot.sensor_telemetry)
- Partitioned by facility (identity transform)
- Micro-batch sensor ingestion + scheduled compaction

**4. 🔧 Custom Table Designer**
- Define your own table name, column types (long, string, double, timestamp…)
- Choose custom partition transforms
- Design and test any Iceberg architecture you imagine!

Select scenarios from the **dropdown in the top navigation bar**.`,
  },

  // ── Lineage Graph ────────────────────────────────────────────────────────────
  {
    keywords: ['lineage', 'graph', 'canvas', 'lineage graph', 'node', 'visualization'],
    answer: `**Interactive Lineage Graph Canvas** 🌳

The center of the screen is the main **visual lineage graph** — a live SVG canvas showing the entire Iceberg metadata hierarchy.

**Node types and colors:**
- 🔵 **Catalog** — top-level atomic pointer
- 📋 **Table Metadata JSON** — schema & snapshot registry
- 📸 **Snapshot** — immutable table state
- 📁 **Manifest List (.avro)** — snapshot's file index
- 📂 **Manifest File (.avro)** — file-level tracker
- 🟢 **Data File (.parquet)** — actual row data
- 🔴 **Delete File (.delete)** — MoR tombstones

**Interactions:**
- **Click any node** → Opens the Metadata Inspector drawer on the right with the raw JSON/Avro payload
- **Active snapshot** nodes are highlighted
- **Reused manifests** from prior snapshots are shown with dashed borders
- **Query pruning** highlights which files were pruned vs. scanned`,
  },

  // ── Control Panel ────────────────────────────────────────────────────────────
  {
    keywords: ['control panel', 'append', 'delete', 'update', 'operations', 'tabs'],
    answer: `**Control Panel** (Left sidebar) ⚙️

The Control Panel is your operations dashboard with 5 tabs:

1. **📥 Append** — Insert new records (specify rows as JSON)
2. **🗑️ Delete** — Remove rows using MoR (fast, writes tombstone) or CoW (rewrites file)
3. **✏️ Update** — Modify existing rows (MoR or CoW)
4. **🔀 Merge** — MERGE INTO / Upsert / CDC batch operations
5. **🔧 Maintenance** — Compaction, snapshot expiration, orphan file purge

Each operation shows you a preview of the Iceberg engine action that will be performed before you confirm it.

**Custom Table Designer** is also accessible from here to define your own schemas.`,
  },

  // ── Metadata Inspector ───────────────────────────────────────────────────────
  {
    keywords: ['inspector', 'metadata inspector', 'drawer', 'raw json', 'inspect'],
    answer: `**Metadata Inspector** (Right drawer) 🔬

Click **any node** in the lineage graph to open the Metadata Inspector.

It shows the **raw JSON/Avro payload** exactly as it would appear on disk, formatted according to the Apache Iceberg Format Specification v2.

**You can inspect:**
- vN.metadata.json — full table metadata with schema, partition specs, snapshot log
- Manifest list entries with partition summaries
- Manifest file entries with column bounds and status codes
- Parquet data file statistics (lower/upper bounds, null counts, byte sizes)
- Positional delete file contents (file path refs + row offsets)

Real-time **syntax highlighting** makes it easy to read!`,
  },

  // ── Query Visualizer ─────────────────────────────────────────────────────────
  {
    keywords: ['query visualizer', 'sql', 'run query', 'query panel', 'query executor'],
    answer: `**Query Engine Pruning Simulator** 🔍

Open the Query panel by clicking **"Run Query"** in the top nav.

**You can:**
- Type any SELECT ... WHERE ... SQL statement
- Choose which snapshot to query (default: HEAD)
- Click **Execute** to run the two-tier pruning engine

**What you'll see:**
1. Catalog resolution → active snapshot metadata
2. **Manifest list pruning** — which manifests were skipped (Tier 1)
3. **Data file pruning** — which Parquet files were skipped (Tier 2)
4. **MoR tombstone application** — delete positions filtered
5. Matching rows displayed in a result table
6. **I/O Avoidance %** — how much storage was saved by pruning

This is how engines like Trino and Spark achieve sub-second queries on petabyte datasets!`,
  },

  // ── Guided Tour ──────────────────────────────────────────────────────────────
  {
    keywords: ['tour', 'guided tour', 'tutorial', 'learn', 'walkthrough', 'how to use'],
    answer: `**Guided Tour** 🎓

New to the platform? Click the **"Guided Tour"** button in the top nav!

The tour walks you through every component step-by-step with contextual explanations:
- What each panel does
- How to trigger operations
- How to read the lineage graph
- How to use the time-travel scrubber
- How to run queries and interpret pruning results

**Architectural Insights Feed** at the bottom of the screen also provides real-time explanations of every operation the engine performs — great for learning the distributed systems reasoning behind each action!`,
  },

  // ── Schema / Types ───────────────────────────────────────────────────────────
  {
    keywords: ['schema', 'column', 'field', 'type', 'data type', 'partition', 'partition spec'],
    answer: `**Schema & Partition Specs** 📊

**Column Types supported:**
- \`long\` — 64-bit integer (IDs, counts, epoch timestamps)
- \`string\` — UTF-8 text (names, categories, identifiers)
- \`double\` — 64-bit floating point (amounts, measurements)
- \`timestamp\` — UTC timestamp with microsecond precision
- \`boolean\` — true/false flags

**Partition Specs (Partition Transforms):**
Iceberg supports logical partition transforms (not physical directories):
- \`identity(col)\` — Partition exactly by column value
- \`year(ts)\` / \`month(ts)\` / \`day(ts)\` / \`hour(ts)\` — Time-based partitioning
- \`bucket(N, col)\` — Hash partition into N buckets
- \`truncate(W, col)\` — Truncate string prefix

The simulator uses identity transforms for all preset scenarios. Custom Table Designer lets you specify any transform!`,
  },

  // ── Tech Stack ───────────────────────────────────────────────────────────────
  {
    keywords: ['tech stack', 'technology', 'react', 'vite', 'typescript', 'tailwind', 'built with'],
    answer: `**Tech Stack** 🛠️

This simulator is built with:

| Technology | Version | Role |
|---|---|---|
| **React** | 19.2 | UI framework |
| **TypeScript** | 6.0 (strict mode) | Type safety |
| **Vite** | 8.2 | Build tool & dev server |
| **Tailwind CSS** | 3.4 | Styling |
| **Lucide React** | latest | Icons |

**Engine:** Pure TypeScript in-memory Iceberg v2 engine with 100% spec-compliant data structures — no backend required!

**Testing:** 8-stage integration test suite (test_engine.ts) run via npx tsx.`,
  },

  // ── Data File / Parquet ───────────────────────────────────────────────────────
  {
    keywords: ['parquet', 'data file', 'column statistics', 'lower bound', 'upper bound', 'null count'],
    answer: `**Data Files (.parquet)** 📦

Data files store the **actual table rows** in Apache Parquet columnar format.

**Each data file tracks:**
- \`record-count\`: Number of rows stored
- \`file-size-in-bytes\`: Physical size on storage
- \`lower-bounds\`: Per-column minimum value (used for query pruning!)
- \`upper-bounds\`: Per-column maximum value
- \`null-value-counts\`: Number of nulls per column
- \`content\`: \`0\` = DATA file, \`1\` = POSITIONAL_DELETES file

**Column statistics enable Tier 2 pruning:**
If a query filter is amount >= 1000 and a file's upper_bounds[amount] = 890, the engine **skips that file entirely** without reading a single byte from it!

Click any green data file node in the lineage graph to see its full statistics in the Inspector.`,
  },

  // ── Orphan files ─────────────────────────────────────────────────────────────
  {
    keywords: ['orphan', 'orphan file', 'purge', 'gc', 'garbage collection', 'cleanup'],
    answer: `**Orphan File Cleanup** 🗑️

Over time, failed writes, abandoned transactions, or expired snapshots can leave **unreferenced files** in object storage that are no longer tracked by any metadata.

These are called **orphan files**, and they waste storage.

**Orphan Purge Process:**
1. Walk all currently reachable files (from active metadata chain)
2. Compare against all files physically present in the storage prefix
3. Any file not reachable from the current metadata is an orphan
4. Delete orphan files after a configurable retention window

**In the simulator:**
After running **Snapshot Expiration**, click **"Purge Orphan Files"** in the Maintenance tab to see how many bytes were reclaimed!

The Architectural Insights feed will log exactly which files were purged.`,
  },

  // ── Help / Commands ──────────────────────────────────────────────────────────
  {
    keywords: ['help', 'commands', 'what can you do', 'ask', 'topics', 'questions'],
    answer: `**I can answer questions about:** 🤖

**Apache Iceberg Concepts:**
- What is Apache Iceberg?
- Snapshot, Catalog, Manifest List, Manifest File
- Atomic commits & Optimistic Concurrency Control
- O(1) Manifest Reuse
- Merge-on-Read (MoR) vs Copy-on-Write (CoW)
- Two-tier query pruning engine
- Snapshot time-travel
- Table compaction & orphan file cleanup
- MERGE INTO / Upsert / CDC operations

**Platform Features:**
- Lineage graph & node types
- Control panel operations (Append, Delete, Update, Merge, Maintenance)
- Query visualizer
- Metadata Inspector drawer
- Time-travel scrubber
- Guided tour
- Pre-configured scenarios (E-Commerce, FinTech, IoT)
- Custom table designer
- Tech stack

Just ask naturally — e.g. "What is MoR?" or "How does query pruning work?"`,
  },
];

// ─── Greeting ────────────────────────────────────────────────────────────────

const GREETING: Message = {
  id: 'greeting',
  role: 'assistant',
  text: `**Hey there! I'm IceBot** 🧊✨

I'm your guide to the **Apache Iceberg Visual Architecture Simulator**.

This platform can feel overwhelming at first — Catalogs, Manifest Lists, MoR vs CoW, O(1) reuse… Let me help you make sense of it all!

**Try asking me:**
- "What is Apache Iceberg?"
- "How does MoR differ from CoW?"
- "What does the lineage graph show?"
- "How does query pruning work?"
- "What is Snapshot 0?"

Or type **help** to see all topics I can cover. 🚀`,
  timestamp: new Date(),
};

// ─── Quick Prompts ────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  'What is Apache Iceberg?',
  'MoR vs CoW?',
  'How does query pruning work?',
  'What is O(1) manifest reuse?',
  'How does time-travel work?',
  'What are snapshots?',
];

// ─── Search Logic ─────────────────────────────────────────────────────────────

function findAnswer(query: string): string {
  const q = query.toLowerCase().trim();

  let bestScore = 0;
  let bestAnswer = '';

  for (const entry of KNOWLEDGE_BASE) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (q.includes(kw)) {
        score += kw.split(' ').length * 10;
      }
      const words = kw.split(' ');
      for (const word of words) {
        if (word.length > 3 && q.includes(word)) {
          score += 3;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestAnswer = entry.answer;
    }
  }

  if (bestScore > 0) return bestAnswer;

  return `Hmm, I didn't quite catch that! 🤔

I'm specialized in Apache Iceberg and this simulator's features. Try asking about:
- **Concepts**: Snapshots, MoR, CoW, Manifest Reuse, Query Pruning, Time-Travel
- **Platform Features**: Lineage Graph, Control Panel, Query Visualizer, Scenarios

Or type **help** to see all topics I can help with!`;
}

// ─── Inline Markdown Formatter ────────────────────────────────────────────────

function inlineFormat(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={i} className="bg-cyan-500/10 text-cyan-300 px-1 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let tableHeader: string[] | null = null;
  let inCodeBlock = false;
  const codeLines: string[] = [];
  let codeLang = '';

  const flushTable = () => {
    if (!tableHeader || tableRows.length === 0) return;
    elements.push(
      <div key={`tbl-${elements.length}`} className="overflow-x-auto my-2">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr>
              {tableHeader.map((h, i) => (
                <th key={i} className="border border-cyan-400/30 px-2 py-1 bg-cyan-500/10 text-cyan-300 font-semibold text-left">
                  {h.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, ri) => (
              <tr key={ri} className="even:bg-white/5">
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-cyan-400/20 px-2 py-1 text-slate-200/90">
                    {inlineFormat(cell.trim())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableHeader = null;
    tableRows = [];
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
        codeLines.length = 0;
      } else {
        inCodeBlock = false;
        const captured = [...codeLines];
        elements.push(
          <pre key={`code-${i}`} className="bg-slate-900/80 border border-cyan-400/20 rounded-md px-3 py-2 text-xs font-mono text-cyan-200 my-2 overflow-x-auto whitespace-pre-wrap">
            {codeLang && <span className="text-cyan-400/60 text-[10px] block mb-1">{codeLang}</span>}
            {captured.join('\n')}
          </pre>
        );
        codeLang = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Table detection
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (!inTable) {
        inTable = true;
        tableHeader = cells;
      } else if (cells.every(c => /^[-:]+$/.test(c))) {
        // separator row — skip
      } else {
        tableRows.push(cells);
      }
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headings
    if (line.startsWith('### ')) {
      elements.push(<h3 key={`h3-${i}`} className="text-sm font-bold text-cyan-200 mt-2 mb-1">{inlineFormat(line.slice(4))}</h3>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={`h2-${i}`} className="text-sm font-bold text-white mt-3 mb-1">{inlineFormat(line.slice(3))}</h2>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={`li-${i}`} className="flex gap-2 text-sm leading-relaxed">
          <span className="text-cyan-400 mt-0.5 shrink-0">•</span>
          <span>{inlineFormat(line.slice(2))}</span>
        </div>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={`br-${i}`} className="h-1" />);
    } else {
      elements.push(<p key={`p-${i}`} className="text-sm leading-relaxed">{inlineFormat(line)}</p>);
    }
  }

  if (inTable) flushTable();

  return elements;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function IcebergChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, isOpen, isMinimized, scrollToBottom]);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    const delay = 400 + Math.random() * 500;
    setTimeout(() => {
      const answerText = findAnswer(trimmed);
      const botMsg: Message = {
        id: `b-${Date.now()}`,
        role: 'assistant',
        text: answerText,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMsg]);
      setIsTyping(false);
      if (!isOpen || isMinimized) {
        setUnreadCount(prev => prev + 1);
      }
    }, delay);
  }, [isOpen, isMinimized]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleReset = () => {
    setMessages([GREETING]);
    setUnreadCount(0);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setIsMinimized(false);
    setUnreadCount(0);
  };

  return (
    <>
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          title="Ask IceBot"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-accent-lg transition-all duration-300 hover:scale-110 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #0052FF 0%, #4D7CFF 100%)',
            boxShadow: '0 8px 24px rgba(0, 82, 255, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2)',
          }}
        >
          <MessageCircle className="w-6 h-6 text-white" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center animate-bounce">
              {unreadCount}
            </span>
          )}
          <span className="absolute inset-0 rounded-full bg-[#0052FF]/30 animate-ping" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-slate-200 dark:border-[#334155]"
          style={{
            width: '380px',
            height: isMinimized ? '60px' : '560px',
            background: 'linear-gradient(160deg, #0F172A 0%, #1E293B 100%)',
            boxShadow: '0 0 40px rgba(0, 82, 255, 0.15), 0 8px 32px rgba(0,0,0,0.6)',
            transition: 'height 0.2s ease',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0 cursor-pointer select-none"
            style={{
              background: 'linear-gradient(90deg, rgba(0, 82, 255, 0.15) 0%, rgba(77, 124, 255, 0.15) 100%)',
              borderBottom: isMinimized ? 'none' : '1px solid rgba(0, 82, 255, 0.2)',
            }}
            onClick={() => setIsMinimized(m => !m)}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                style={{ background: 'linear-gradient(135deg, #0052FF, #4D7CFF)' }}
              >
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-calistoga text-white">IceBot</span>
                  <Sparkles className="w-3 h-3 text-[#4D7CFF]" />
                </div>
                <div className="flex items-center gap-1 font-mono text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-slate-400">Iceberg Expert</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <button
                onClick={handleReset}
                title="Reset conversation"
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsMinimized(m => !m)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-red-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollbarWidth: 'thin' }}>
                {messages.map(msg => (
                  <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Avatar */}
                    <div className="shrink-0 mt-1">
                      {msg.role === 'assistant' ? (
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center shadow-sm"
                          style={{ background: 'linear-gradient(135deg, #0052FF, #4D7CFF)' }}
                        >
                          <Bot className="w-3 h-3 text-white" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center">
                          <User className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Bubble */}
                    <div
                      className="max-w-[85%] rounded-2xl px-3.5 py-2.5"
                      style={
                        msg.role === 'user'
                          ? {
                              background: 'linear-gradient(135deg, #0052FF, #4D7CFF)',
                              borderBottomRightRadius: '4px',
                              color: 'white',
                            }
                          : {
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(0, 82, 255, 0.2)',
                              borderBottomLeftRadius: '4px',
                              color: '#cbd5e1',
                            }
                      }
                    >
                      {msg.role === 'user' ? (
                        <p className="text-sm leading-relaxed">{msg.text}</p>
                      ) : (
                        <div className="space-y-0.5">{renderMarkdown(msg.text)}</div>
                      )}
                      <p className={`text-[10px] mt-1.5 font-mono ${msg.role === 'user' ? 'text-white/60 text-right' : 'text-slate-500'}`}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Typing indicator */}
                {isTyping && (
                  <div className="flex gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: 'linear-gradient(135deg, #0052FF, #4D7CFF)' }}
                    >
                      <Bot className="w-3 h-3 text-white" />
                    </div>
                    <div
                      className="rounded-2xl px-4 py-3 flex items-center gap-1"
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(0, 82, 255, 0.2)',
                        borderBottomLeftRadius: '4px',
                      }}
                    >
                      {[0, 1, 2].map(i => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-[#4D7CFF] animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompts — show only on fresh conversation */}
              {messages.length <= 1 && (
                <div className="px-3 pb-2">
                  <div className="flex items-center gap-1 mb-1.5">
                    <ChevronDown className="w-3 h-3 text-slate-500" />
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Quick questions</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_PROMPTS.map(p => (
                      <button
                        key={p}
                        onClick={() => sendMessage(p)}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-[#0052FF]/30 text-[#4D7CFF] hover:bg-[#0052FF]/10 transition-colors duration-150 hover:border-[#0052FF]/60 font-mono"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <form
                onSubmit={handleSubmit}
                className="flex items-center gap-2 px-3 pb-3 pt-1"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder="Ask about Iceberg concepts…"
                  disabled={isTyping}
                  className="flex-1 bg-white/5 border border-[#0052FF]/30 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-[#0052FF] focus:ring-1 focus:ring-[#0052FF] transition-colors duration-150 disabled:opacity-50 font-sans"
                  style={{ caretColor: '#0052FF' }}
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isTyping}
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 disabled:opacity-40 hover:scale-105 active:scale-95 shrink-0"
                  style={{
                    background:
                      inputValue.trim() && !isTyping
                        ? 'linear-gradient(135deg, #0052FF, #4D7CFF)'
                        : 'rgba(255,255,255,0.1)',
                  }}
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default IcebergChatbot;
