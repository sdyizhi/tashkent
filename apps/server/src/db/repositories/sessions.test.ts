import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../index.js';
import { SessionRepository } from './sessions.js';
import { MessageRepository } from './messages.js';

let db: ReturnType<typeof createDatabase>;
let sessions: SessionRepository;
let messages: MessageRepository;

beforeEach(() => {
  db = createDatabase(':memory:');
  sessions = new SessionRepository(db);
  messages = new MessageRepository(db);
});

describe('SessionRepository', () => {
  it('创建会话后可按 id 读回', () => {
    sessions.create({ id: 's1', agentId: 'chat', title: '你好' });
    const got = sessions.get('s1');
    expect(got?.agentId).toBe('chat');
    expect(got?.title).toBe('你好');
  });

  it('读不存在的会话返回 undefined', () => {
    expect(sessions.get('nope')).toBeUndefined();
  });

  it('列出全部会话并按 updatedAt 倒序', () => {
    sessions.create({ id: 's1', agentId: 'chat', title: 'a' });
    sessions.create({ id: 's2', agentId: 'chat', title: 'b' });
    sessions.touch('s2', Date.now() + 1000);
    const all = sessions.list();
    expect(all.length).toBe(2);
    expect(all[0]?.id).toBe('s2');
  });

  it('删除会话', () => {
    sessions.create({ id: 's1', agentId: 'chat' });
    sessions.remove('s1');
    expect(sessions.get('s1')).toBeUndefined();
  });
});

describe('MessageRepository', () => {
  it('按顺序返回会话消息', () => {
    sessions.create({ id: 's1', agentId: 'chat' });
    messages.append({ id: 'm1', sessionId: 's1', role: 'user', content: '你好' });
    messages.append({ id: 'm2', sessionId: 's1', role: 'assistant', content: '在' });
    const list = messages.listBySession('s1');
    expect(list.map((m) => m.content)).toEqual(['你好', '在']);
  });

  it('只返回指定会话的消息', () => {
    sessions.create({ id: 's1', agentId: 'chat' });
    sessions.create({ id: 's2', agentId: 'chat' });
    messages.append({ id: 'm1', sessionId: 's1', role: 'user', content: 'a' });
    messages.append({ id: 'm2', sessionId: 's2', role: 'user', content: 'b' });
    expect(messages.listBySession('s1').length).toBe(1);
  });
});
