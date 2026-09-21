import { defineSchemaPlan, type SchemaMigration } from './schema.js';

const SESSION_OWNERSHIP_MIGRATION: SchemaMigration = {
  generation: 2,
  module: 'session-ownership',
  description: 'Create explicit PersonaBot root Session ownership',
  migrate(database) {
    database.exec(`
      CREATE TABLE session_ownership (
        session_id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        root_role TEXT NOT NULL CHECK (root_role IN ('orchestrator', 'assignment')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX session_ownership_bot_role
        ON session_ownership (bot_slug, root_role, created_at, session_id);
    `);
  },
};

const MESSAGING_TRACER_MIGRATION: SchemaMigration = {
  generation: 3,
  module: 'messaging',
  description: 'Create the minimal durable Source Event and Bot Inbox admission path',
  migrate(database) {
    database.exec(`
      CREATE TABLE source_events (
        source_event_id TEXT PRIMARY KEY,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('human-message', 'assignment-report')),
        bot_slug TEXT NOT NULL,
        channel_id TEXT,
        message_id TEXT,
        assignment_session_id TEXT,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        handled_at TEXT,
        UNIQUE (channel_id, message_id)
      );
      CREATE INDEX source_events_bot_created
        ON source_events (bot_slug, created_at, source_event_id);
    `);
  },
};

const ASSIGNMENT_DIRECTORY_MIGRATION: SchemaMigration = {
  generation: 4,
  module: 'assignments',
  description: 'Create the durable Assignment Directory and latest report projection',
  migrate(database) {
    database.exec(`
      CREATE TABLE assignments (
        session_id TEXT PRIMARY KEY REFERENCES session_ownership(session_id),
        source_event_id TEXT NOT NULL REFERENCES source_events(source_event_id),
        bot_slug TEXT NOT NULL,
        purpose TEXT NOT NULL,
        activity TEXT NOT NULL CHECK (activity IN ('working', 'idle', 'error')),
        latest_report_state TEXT,
        latest_report_summary TEXT,
        latest_report_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX assignments_bot_updated
        ON assignments (bot_slug, updated_at DESC, session_id);
    `);
  },
};

const SOURCE_EVENT_ATTEMPT_MIGRATION: SchemaMigration = {
  generation: 5,
  module: 'bot-runtime',
  description: 'Track replay-safe Source Event attempt state',
  migrate(database) {
    database.exec(`
      ALTER TABLE source_events
        ADD COLUMN attempt_state TEXT NOT NULL DEFAULT 'pending'
        CHECK (attempt_state IN ('pending', 'running', 'retryable', 'needs-repair', 'handled'));
      UPDATE source_events SET attempt_state = 'handled' WHERE handled_at IS NOT NULL;
    `);
  },
};

const SESSION_OWNERSHIP_LINEAGE_MIGRATION: SchemaMigration = {
  generation: 6,
  module: 'session-ownership',
  description: 'Record ownership provenance, lineage, and the explicit cwd reference',
  migrate(database) {
    database.exec(`
      ALTER TABLE session_ownership
        ADD COLUMN provenance TEXT NOT NULL DEFAULT 'legacy'
        CHECK (provenance IN ('created', 'fork', 'subagent', 'repair', 'legacy'));
      ALTER TABLE session_ownership ADD COLUMN parent_session_id TEXT;
      ALTER TABLE session_ownership ADD COLUMN cwd_reference TEXT;
    `);
  },
};

export const BOT_HARNESS_SCHEMA_PLAN = defineSchemaPlan([
  SESSION_OWNERSHIP_MIGRATION,
  MESSAGING_TRACER_MIGRATION,
  ASSIGNMENT_DIRECTORY_MIGRATION,
  SOURCE_EVENT_ATTEMPT_MIGRATION,
  SESSION_OWNERSHIP_LINEAGE_MIGRATION,
]);
