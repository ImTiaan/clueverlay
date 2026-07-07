import { describe, expect, it } from 'vitest';
import { parseChatCommand } from './commandParser';

describe('parseChatCommand', () => {
  it('parses player commands with multi-word arguments', () => {
    expect(parseChatCommand('!ask James Ashford')).toEqual({
      kind: 'player',
      command: 'ask',
      query: 'James Ashford',
      raw: '!ask James Ashford',
    });

    expect(parseChatCommand('!examine crystal vase')).toEqual({
      kind: 'player',
      command: 'examine',
      query: 'crystal vase',
      raw: '!examine crystal vase',
    });
  });

  it('parses admin case commands', () => {
    expect(parseChatCommand('!case pause')).toEqual({
      kind: 'admin',
      command: 'pause',
      raw: '!case pause',
    });

    expect(parseChatCommand('!case status')).toEqual({
      kind: 'admin',
      command: 'status',
      raw: '!case status',
    });
  });

  it('rejects unsupported or incomplete commands', () => {
    expect(parseChatCommand('hello detectives')).toBeNull();
    expect(parseChatCommand('!ask')).toBeNull();
    expect(parseChatCommand('!case')).toBeNull();
    expect(parseChatCommand('!case dance')).toBeNull();
  });
});
