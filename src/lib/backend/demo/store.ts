import type {
  Contact,
  DemoUser,
  Label,
  Mailbox,
  Message,
  Settings,
  Signature,
  Template,
  UserSession,
} from '../types.ts';

export const STATE_KEY = 'ffmail.demo.v1';
export const SESSION_KEY = 'ffmail.demo.session';
export const STATE_VERSION = 1;

export interface DemoUserRecord extends DemoUser {
  id: string;
  passwordHash: string;
}

export interface StoredAttachmentData {
  contentType: string;
  base64: string;
}

export interface DemoState {
  version: number;
  users: DemoUserRecord[];
  mailboxes: Mailbox[];
  messages: Message[];
  labels: Label[];
  contacts: Contact[];
  settingsByUser: Record<string, Settings>;
  signaturesByUser: Record<string, Signature[]>;
  templatesByUser: Record<string, Template[]>;
  customAttachments: Record<string, StoredAttachmentData>;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  density: 'comfortable',
  readingPane: 'right',
  conversationView: true,
  loadRemoteImages: 'ask',
  undoSendSeconds: 5,
  language: 'de',
};

export function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length(): number {
      return map.size;
    },
    clear(): void {
      map.clear();
    },
    getItem(key: string): string | null {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    key(index: number): string | null {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    setItem(key: string, value: string): void {
      map.set(key, String(value));
    },
  };
}

export function resolveStorage(storage?: Storage): Storage {
  if (storage) return storage;
  if (typeof globalThis.localStorage !== 'undefined') {
    return globalThis.localStorage;
  }
  return createMemoryStorage();
}

export function generateId(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < view.length; i += 1) {
    hex += view[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function loadState(storage: Storage): DemoState | null {
  const raw = storage.getItem(STATE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.version !== STATE_VERSION ||
      !Array.isArray(parsed.users) ||
      !Array.isArray(parsed.mailboxes) ||
      !Array.isArray(parsed.messages) ||
      !Array.isArray(parsed.labels)
    ) {
      return null;
    }
    return {
      version: STATE_VERSION,
      users: parsed.users,
      mailboxes: parsed.mailboxes,
      messages: parsed.messages,
      labels: parsed.labels,
      contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
      settingsByUser:
        parsed.settingsByUser && typeof parsed.settingsByUser === 'object'
          ? parsed.settingsByUser
          : {},
      signaturesByUser:
        parsed.signaturesByUser && typeof parsed.signaturesByUser === 'object'
          ? parsed.signaturesByUser
          : {},
      templatesByUser:
        parsed.templatesByUser && typeof parsed.templatesByUser === 'object'
          ? parsed.templatesByUser
          : {},
      customAttachments:
        parsed.customAttachments && typeof parsed.customAttachments === 'object'
          ? parsed.customAttachments
          : {},
    };
  } catch {
    return null;
  }
}

export function saveState(storage: Storage, state: DemoState): void {
  storage.setItem(STATE_KEY, JSON.stringify(state));
}

export function loadSession(storage: Storage): UserSession | null {
  const raw = storage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UserSession>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.email !== 'string' ||
      (parsed.role !== 'admin' && parsed.role !== 'member') ||
      parsed.mode !== 'demo'
    ) {
      return null;
    }
    return {
      userId: parsed.userId,
      email: parsed.email,
      role: parsed.role,
      mode: 'demo',
    };
  } catch {
    return null;
  }
}

export function saveSession(storage: Storage, session: UserSession | null): void {
  if (!session) {
    storage.removeItem(SESSION_KEY);
    return;
  }
  storage.setItem(SESSION_KEY, JSON.stringify(session));
}
