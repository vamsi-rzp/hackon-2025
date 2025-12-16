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

export interface PresetInfo {
  id: string;
  name: string;
  description: string;
  url: string;
  autoConnect: boolean;
  tags?: string[];
  sessionId?: string;
  status: 'disconnected' | 'connected' | 'connecting' | 'error';
}

export interface ConnectPresetResponse {
  presetId: string;
  sessionId: string;
  name: string;
  toolCount: number;
  connectedAt: string;
}

export interface AggregatedTool extends Tool {
  source: {
    sessionId: string;
    serverUrl: string;
  };
}

export const api = {
  // Standalone chat - no MCP session required
  async chatStandalone(message: string, history: ChatMessage[] = []): Promise<ChatResponse> {
    const res = await fetch(`${API_BASE}/chat`, {
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

  // Aggregated chat - uses tools from ALL connected sessions
  async chatAggregated(message: string, history: ChatMessage[] = []): Promise<ChatResponse> {
    const res = await fetch(`${API_BASE}/chat/aggregated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Aggregated chat failed');
    }
    return res.json();
  },

  // Get ALL tools from ALL connected sessions
  async getAllTools(): Promise<{ tools: AggregatedTool[]; count: number; sessionCount: number }> {
    const res = await fetch(`${API_BASE}/tools`);
    if (!res.ok) throw new Error('Failed to fetch all tools');
    return res.json();
  },

  // Get available presets
  async getPresets(): Promise<{ presets: PresetInfo[]; count: number }> {
    const res = await fetch(`${API_BASE}/presets`);
    if (!res.ok) throw new Error('Failed to fetch presets');
    return res.json();
  },

  // Connect to a preset
  async connectPreset(presetId: string): Promise<ConnectPresetResponse> {
    const res = await fetch(`${API_BASE}/presets/${presetId}/connect`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to connect preset');
    return res.json();
  },

  // Get tools for a session
  async getTools(sessionId: string): Promise<{ tools: Tool[]; count: number }> {
    const res = await fetch(`${API_BASE}/session/${sessionId}/tools`);
    if (!res.ok) throw new Error('Failed to fetch tools');
    return res.json();
  },

  // Connect to custom MCP server
  async connect(serverUrl: string): Promise<ConnectResponse> {
    const res = await fetch(`${API_BASE}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverUrl }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Connection failed');
    return res.json();
  },

  // Execute tool
  async execute(sessionId: string, toolName: string, args: Record<string, unknown>): Promise<ExecuteResponse> {
    const res = await fetch(`${API_BASE}/session/${sessionId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolName, arguments: args }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Execution failed');
    return res.json();
  },

  // Chat with tools (session required)
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

  // Disconnect session
  async disconnect(sessionId: string): Promise<void> {
    await fetch(`${API_BASE}/session/${sessionId}`, { method: 'DELETE' });
  },
};
