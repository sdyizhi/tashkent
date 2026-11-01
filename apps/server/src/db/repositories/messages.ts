import { randomUUID } from 'node:crypto';
import type { MessageRecord } from '@tashkent/shared';
import type { DB } from '../index.js';

interface MessageRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls: string | null;
  tool_call_id: string | null;
  created_at: number;
}

function toRecord(r: MessageRow): MessageRecord {
  return {
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    content: r.content,
    toolCalls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
    toolCallId: r.tool_call_id ?? undefined,
    createdAt: r.created_at,
  };
}

export class MessageRepository {
  constructor(private readonly db: DB) {}

  append(input: {
    id?: string;
    sessionId: string;
    role: 'user' | 'assistant' | 'tool';
    content: string;
    toolCalls?: unknown;
    toolCallId?: string;
  }): MessageRecord {
    const id = input.id ?? randomUUID();
    const now = Date.now();
    this.db
      .prepare(
        'INSERT INTO messages (id, session_id, role, content, tool_calls, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        input.sessionId,
        input.role,
        input.content,
        input.toolCalls === undefined ? null : JSON.stringify(input.toolCalls),
        input.toolCallId ?? null,
        now,
      );
    return {
      id,
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      toolCalls: input.toolCalls,
      toolCallId: input.toolCallId,
      createdAt: now,
    };
  }

  listBySession(sessionId: string): MessageRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, rowid ASC')
      .all(sessionId) as MessageRow[];
    return rows.map(toRecord);
  }
}
