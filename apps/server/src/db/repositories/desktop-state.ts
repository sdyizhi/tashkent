import type { DB } from '../index.js';

export class DesktopStateRepository {
  constructor(private readonly db: DB) {}

  get<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM desktop_state WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare(
        'INSERT INTO desktop_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, JSON.stringify(value));
  }
}
