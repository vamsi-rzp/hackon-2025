export interface Tool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, {
      type?: string;
      description?: string;
      enum?: string[];
      default?: unknown;
    }>;
    required?: string[];
  };
}

export interface ToolResultItem {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  executionTime: number;
}

export interface Message {
  id: string;
  role: 'user' | 'bot' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  executionTime?: number;
  isLoading?: boolean;
  /** Raw tool results for frontend rendering */
  toolResults?: ToolResultItem[];
}

export interface Session {
  sessionId: string;
  serverUrl: string;
  tools: Tool[];
  connectedAt: Date;
}

