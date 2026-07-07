import type { AdminAction } from '../../shared/game.js';

export type ParsedPlayerCommand =
  | {
      kind: 'player';
      command: 'examine' | 'ask' | 'accuse';
      query: string;
      raw: string;
    }
  | {
      kind: 'admin';
      command: AdminAction | 'status';
      raw: string;
    };

const playerCommands = new Set(['examine', 'ask', 'accuse']);
const adminCommands = new Set(['start', 'stop', 'pause', 'resume', 'skip', 'reload', 'status']);

export function parseChatCommand(message: string): ParsedPlayerCommand | null {
  const trimmed = message.trim();

  if (!trimmed.startsWith('!')) {
    return null;
  }

  const [command, ...rest] = trimmed.slice(1).split(/\s+/);
  const normalizedCommand = command.toLowerCase();
  const query = rest.join(' ').trim();

  if (playerCommands.has(normalizedCommand)) {
    if (!query) {
      return null;
    }

    return {
      kind: 'player',
      command: normalizedCommand as 'examine' | 'ask' | 'accuse',
      query,
      raw: trimmed,
    };
  }

  if (normalizedCommand === 'case') {
    const action = (rest[0] ?? '').toLowerCase();

    if (!adminCommands.has(action)) {
      return null;
    }

    return {
      kind: 'admin',
      command: action as AdminAction | 'status',
      raw: trimmed,
    };
  }

  return null;
}
