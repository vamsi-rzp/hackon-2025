export interface Tool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface ConnectResponse {
  sessionId: string;
  tools: Tool[];
  serverUrl: string;
  connectedAt: string;
}

export interface SessionInfo {
  sessionId: string;
  serverUrl: string;
  toolCount: number;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  createdAt: string;
}

export interface ToolsListResponse {
  sessionId: string;
  tools: Tool[];
  count: number;
}

export interface ExecuteToolResponse {
  success: boolean;
  result: unknown;
  toolName: string;
  executionTime: number;
}

export interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'system' | 'tool-result' | 'error';
  content: string;
  timestamp: Date;
  toolName?: string;
  executionTime?: number;
  rawResult?: unknown;
}

