import { TableState } from './types';
import {
  initTableState,
  appendRecords,
  deleteRecordsMoR,
  compactTable
} from './icebergEngine';

export interface ScenarioDefinition {
  id: string;
  name: string;
  tagline: string;
  description: string;
  tableIdentifier: string;
  partitionStrategy: string;
  defaultQueries: string[];
  buildInitialState: () => TableState;
}

export const PRESET_SCENARIOS: ScenarioDefinition[] = [
  // ─── Default: Clean Empty Table ──────────────────────────────────────────────
  {
    id: 'clean',
    name: 'Fresh Table (Empty Start)',
    tagline: 'Start from Snapshot 0 — no data pre-loaded',
    description: 'A brand-new Iceberg table with only Snapshot 0 committed. Add rows via the Append panel to begin building your own snapshot history.',
    tableIdentifier: 'demo.events_log',
    partitionStrategy: 'identity(category)',
    defaultQueries: [
      "SELECT * FROM demo.events_log WHERE category = 'web'",
      "SELECT * FROM demo.events_log WHERE user_id = 1",
      "SELECT * FROM demo.events_log WHERE amount >= 100"
    ],
    buildInitialState: () =>
      initTableState(
        'demo.events_log',
        [
          { id: 1, name: 'id',         type: 'long',      required: true  },
          { id: 2, name: 'category',   type: 'string',    required: true  },
          { id: 3, name: 'user_id',    type: 'long',      required: false },
          { id: 4, name: 'amount',     type: 'double',    required: false },
          { id: 5, name: 'created_at', type: 'timestamp', required: true  }
        ],
        [
          { 'source-id': 2, 'field-id': 1000, name: 'category', transform: 'identity' }
        ],
        's3://demo-lakehouse/events/events_log'
      )
  },
  {
    id: 'ecommerce',
    name: 'E-Commerce Enterprise Orders',
    tagline: 'Partitioned by Dept with MoR Deletes & Manifest Reuse',
    description: 'Simulates a multi-department enterprise dataset with multiple commits demonstrating O(1) manifest reuse, Merge-on-Read tombstones, and query pruning.',
    tableIdentifier: 'ecommerce.orders_analytics',
    partitionStrategy: 'identity(dept)',
    defaultQueries: [
      "SELECT * FROM ecommerce.orders_analytics WHERE dept = 'Engineering' AND amount >= 500",
      "SELECT * FROM ecommerce.orders_analytics WHERE dept = 'Marketing'",
      "SELECT * FROM ecommerce.orders_analytics WHERE id = 104",
      "SELECT * FROM ecommerce.orders_analytics WHERE amount < 200"
    ],
    buildInitialState: () => {
      // Step 1: Initialize table
      let state = initTableState(
        'ecommerce.orders_analytics',
        [
          { id: 1, name: 'id', type: 'long', required: true },
          { id: 2, name: 'dept', type: 'string', required: true },
          { id: 3, name: 'customer_tier', type: 'string', required: false },
          { id: 4, name: 'amount', type: 'double', required: true },
          { id: 5, name: 'created_at', type: 'timestamp', required: true }
        ],
        [
          { 'source-id': 2, 'field-id': 1000, name: 'dept', transform: 'identity' }
        ],
        's3://lakehouse-warehouse/ecommerce/orders_analytics'
      );

      // Snapshot 1: Batch 1 (Engineering & Marketing)
      state = appendRecords(
        state,
        [
          { id: 101, dept: 'Engineering', customer_tier: 'Enterprise', amount: 1450.00, created_at: '2026-09-01T10:00:00Z' },
          { id: 102, dept: 'Engineering', customer_tier: 'Pro', amount: 450.50, created_at: '2026-09-01T10:15:00Z' },
          { id: 103, dept: 'Engineering', customer_tier: 'Enterprise', amount: 2890.00, created_at: '2026-09-01T11:00:00Z' },
          { id: 201, dept: 'Marketing', customer_tier: 'Growth', amount: 320.00, created_at: '2026-09-01T12:00:00Z' },
          { id: 202, dept: 'Marketing', customer_tier: 'Enterprise', amount: 1120.00, created_at: '2026-09-01T12:30:00Z' }
        ],
        'Initial ingest: Engineering & Marketing orders (S1)'
      );

      // Snapshot 2: Batch 2 (Sales & Support - Manifest Reuse from S1!)
      state = appendRecords(
        state,
        [
          { id: 301, dept: 'Sales', customer_tier: 'Enterprise', amount: 5200.00, created_at: '2026-09-02T08:00:00Z' },
          { id: 302, dept: 'Sales', customer_tier: 'Pro', amount: 890.00, created_at: '2026-09-02T08:45:00Z' },
          { id: 401, dept: 'Support', customer_tier: 'Standard', amount: 150.00, created_at: '2026-09-02T09:15:00Z' },
          { id: 104, dept: 'Engineering', customer_tier: 'Enterprise', amount: 3400.00, created_at: '2026-09-02T09:40:00Z' }
        ],
        'Incremental ingest: Sales & Support + new Eng order (S2 with O(1) manifest reuse)'
      );

      // Snapshot 3: Merge-on-Read Delete on id = 102
      state = deleteRecordsMoR(
        state,
        'id = 102',
        'MoR Delete: Cancelled Order #102'
      );

      return state;
    }
  },
  {
    id: 'fintech',
    name: 'FinTech High-Frequency Transactions',
    tagline: 'Partitioned by Country with Strict ACID Auditing',
    description: 'Simulates financial ledger transactions partitioned by geographic regions with real-time anomaly filtering.',
    tableIdentifier: 'fintech.ledger_transactions',
    partitionStrategy: 'identity(country)',
    defaultQueries: [
      "SELECT * FROM fintech.ledger_transactions WHERE country = 'US' AND amount >= 1000",
      "SELECT * FROM fintech.ledger_transactions WHERE country = 'EU'",
      "SELECT * FROM fintech.ledger_transactions WHERE tx_id = 905"
    ],
    buildInitialState: () => {
      let state = initTableState(
        'fintech.ledger_transactions',
        [
          { id: 1, name: 'tx_id', type: 'long', required: true },
          { id: 2, name: 'country', type: 'string', required: true },
          { id: 3, name: 'currency', type: 'string', required: true },
          { id: 4, name: 'amount', type: 'double', required: true },
          { id: 5, name: 'created_at', type: 'timestamp', required: true }
        ],
        [
          { 'source-id': 2, 'field-id': 1000, name: 'country', transform: 'identity' }
        ],
        's3://fintech-lakehouse/ledger/transactions'
      );

      state = appendRecords(
        state,
        [
          { tx_id: 901, country: 'US', currency: 'USD', amount: 12500.00, created_at: '2026-09-01T00:01:00Z' },
          { tx_id: 902, country: 'US', currency: 'USD', amount: 340.50, created_at: '2026-09-01T00:05:00Z' },
          { tx_id: 903, country: 'EU', currency: 'EUR', amount: 4500.00, created_at: '2026-09-01T01:10:00Z' },
          { tx_id: 904, country: 'APAC', currency: 'SGD', amount: 8900.00, created_at: '2026-09-01T02:00:00Z' }
        ],
        'Q1 Initial Settlement Stream (S1)'
      );

      state = appendRecords(
        state,
        [
          { tx_id: 905, country: 'US', currency: 'USD', amount: 48000.00, created_at: '2026-09-02T04:00:00Z' },
          { tx_id: 906, country: 'LATAM', currency: 'BRL', amount: 1200.00, created_at: '2026-09-02T04:30:00Z' }
        ],
        'Q2 Settlement Batch (S2 - Reused Manifests)'
      );

      return state;
    }
  },
  {
    id: 'iot',
    name: 'IoT Telemetry & Industrial Sensors',
    tagline: 'Partitioned by Device Region with Compaction',
    description: 'Simulates IoT sensor stream with rapid micro-batches, showcasing Lakehouse compaction routines.',
    tableIdentifier: 'iot.sensor_telemetry',
    partitionStrategy: 'identity(facility)',
    defaultQueries: [
      "SELECT * FROM iot.sensor_telemetry WHERE facility = 'North-Plant' AND reading_val >= 90",
      "SELECT * FROM iot.sensor_telemetry WHERE facility = 'West-Facility'"
    ],
    buildInitialState: () => {
      let state = initTableState(
        'iot.sensor_telemetry',
        [
          { id: 1, name: 'sensor_id', type: 'long', required: true },
          { id: 2, name: 'facility', type: 'string', required: true },
          { id: 3, name: 'metric_name', type: 'string', required: true },
          { id: 4, name: 'reading_val', type: 'double', required: true },
          { id: 5, name: 'created_at', type: 'timestamp', required: true }
        ],
        [
          { 'source-id': 2, 'field-id': 1000, name: 'facility', transform: 'identity' }
        ],
        's3://iot-lakehouse/industrial/telemetry'
      );

      state = appendRecords(
        state,
        [
          { sensor_id: 501, facility: 'North-Plant', metric_name: 'temperature', reading_val: 78.4, created_at: '2026-09-01T08:00:00Z' },
          { sensor_id: 502, facility: 'North-Plant', metric_name: 'vibration', reading_val: 12.1, created_at: '2026-09-01T08:00:00Z' }
        ],
        'Batch 1: Sensor Readings (S1)'
      );

      state = appendRecords(
        state,
        [
          { sensor_id: 503, facility: 'West-Facility', metric_name: 'temperature', reading_val: 94.8, created_at: '2026-09-01T09:00:00Z' },
          { sensor_id: 504, facility: 'North-Plant', metric_name: 'pressure', reading_val: 104.2, created_at: '2026-09-01T09:30:00Z' }
        ],
        'Batch 2: High Temperature Anomaly (S2)'
      );

      state = compactTable(state, 'Scheduled Maintenance: Compact small files');

      return state;
    }
  }
];
