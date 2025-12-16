import type { Tool } from './types';

const API_BASE = '/api';

export interface ConnectResponse {
  sessionId: string;
  tools: Tool[];
  serverUrl: string;
  connectedAt: string;
}

export interface ExecuteResponse {
  success: boolean;
  result: unknown;
  toolName: string;
  executionTime: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply: string;
  toolsUsed?: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result: unknown;
    executionTime: number;
  }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export const api = {
  async connect(serverUrl: string): Promise<ConnectResponse> {
    const res = await fetch(`${API_BASE}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverUrl }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Connection failed');
    return res.json();
  },

  async execute(sessionId: string, toolName: string, args: Record<string, unknown>): Promise<ExecuteResponse> {
    const res = await fetch(`${API_BASE}/session/${sessionId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolName, arguments: args }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Execution failed');
    return res.json();
  },

  async chat(sessionId: string, message: string, history: ChatMessage[] = []): Promise<ChatResponse> {
    const res = await fetch(`${API_BASE}/session/${sessionId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Chat failed');
    }
    return res.json();
  },

  async disconnect(sessionId: string): Promise<void> {
    await fetch(`${API_BASE}/session/${sessionId}`, { method: 'DELETE' });
  },
};

