import { randomUUID } from 'node:crypto';
import type { SessionSummary } from '@tashkent/shared';
import type { DB } from '../index.js';

interface SessionRow {
  id: string;
  agent_id: string;
  title: string | null;
  created_at: number;
  updated_at: number;
  metadata: string | null;
}

function toSummary(r: SessionRow): SessionSummary {
  return {
    id: r.id,
    agentId: r.agent_id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class SessionRepository {
  constructor(private readonly db: DB) {}

  create(input: { id?: string; agentId: string; title?: string | null; metadata?: unknown }): SessionSummary {
    const id = input.id ?? randomUUID();
    const now = Date.now();
    this.db
      .prepare(
        'INSERT INTO sessions (id, agent_id, title, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        input.agentId,
        input.title ?? null,
        now,
        now,
        input.metadata === undefined ? null : JSON.stringify(input.metadata),
      );
    return { id, agentId: input.agentId, title: input.title ?? null, createdAt: now, updatedAt: now };
  }

  get(id: string): SessionSummary | undefined {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | SessionRow
      | undefined;
    return row ? toSummary(row) : undefined;
  }

  list(): SessionSummary[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY updated_at DESC')
      .all() as SessionRow[];
    return rows.map(toSummary);
  }

  touch(id: string, at: number = Date.now()): void {
    this.db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(at, id);
  }

  setTitle(id: string, title: string): void {
    this.db
      .prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, Date.now(), id);
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(id);
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }
}
