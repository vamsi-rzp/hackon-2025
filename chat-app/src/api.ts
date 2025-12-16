import type {
  ConnectResponse,
  ToolsListResponse,
  ExecuteToolResponse,
  ErrorResponse,
  SessionInfo,
} from './types';

const API_BASE = '/api';

class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  
  if (!response.ok) {
    const error = data as ErrorResponse;
    throw new ApiError(
      error.error || 'An error occurred',
      error.code || 'UNKNOWN_ERROR',
      response.status,
      error.details
    );
  }
  
  return data as T;
}

export const mcpApi = {
  /**
   * Connect to an MCP server
   */
  async connect(serverUrl: string): Promise<ConnectResponse> {
    const response = await fetch(`${API_BASE}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverUrl }),
    });
    return handleResponse<ConnectResponse>(response);
  },

  /**
   * Get all active sessions
   */
  async getSessions(): Promise<{ sessions: SessionInfo[]; count: number }> {
    const response = await fetch(`${API_BASE}/sessions`);
    return handleResponse<{ sessions: SessionInfo[]; count: number }>(response);
  },

  /**
   * Get session info
   */
  async getSession(sessionId: string): Promise<SessionInfo> {
    const response = await fetch(`${API_BASE}/session/${sessionId}`);
    return handleResponse<SessionInfo>(response);
  },

  /**
   * Get tools for a session
   */
  async getTools(sessionId: string): Promise<ToolsListResponse> {
    const response = await fetch(`${API_BASE}/session/${sessionId}/tools`);
    return handleResponse<ToolsListResponse>(response);
  },

  /**
   * Execute a tool
   */
  async executeTool(
    sessionId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ExecuteToolResponse> {
    const response = await fetch(`${API_BASE}/session/${sessionId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolName, arguments: args }),
    });
    return handleResponse<ExecuteToolResponse>(response);
  },

  /**
   * Disconnect a session
   */
  async disconnect(sessionId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/session/${sessionId}`, {
      method: 'DELETE',
    });
    return handleResponse<{ success: boolean; message: string }>(response);
  },

  /**
   * Health check
   */
  async health(): Promise<{ status: string; timestamp: string; activeSessions: number }> {
    const response = await fetch(`${API_BASE}/health`);
    return handleResponse<{ status: string; timestamp: string; activeSessions: number }>(response);
  },
};

export { ApiError };

