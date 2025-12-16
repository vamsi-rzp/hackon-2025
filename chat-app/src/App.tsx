import { useState, useCallback } from 'react';
import type { Tool, ChatMessage, ConnectResponse } from './types';
import { mcpApi } from './api';
import { ConnectionPanel } from './components/ConnectionPanel';
import { ChatContainer } from './components/ChatContainer';
import { ToolsSidebar } from './components/ToolsSidebar';
import { Header } from './components/Header';
import './App.css';

function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string>('');
  const [tools, setTools] = useState<Tool[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    }]);
  }, []);

  const handleConnect = useCallback(async (url: string) => {
    setIsConnecting(true);
    addMessage({
      type: 'system',
      content: `Connecting to ${url}...`,
    });

    try {
      const response: ConnectResponse = await mcpApi.connect(url);
      setSessionId(response.sessionId);
      setServerUrl(url);
      setTools(response.tools);
      
      addMessage({
        type: 'system',
        content: `✓ Connected successfully! Session: ${response.sessionId.slice(0, 8)}...`,
      });
      addMessage({
        type: 'system',
        content: `Discovered ${response.tools.length} tool(s): ${response.tools.map(t => t.name).join(', ')}`,
      });
    } catch (error) {
      addMessage({
        type: 'error',
        content: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsConnecting(false);
    }
  }, [addMessage]);

  const handleDisconnect = useCallback(async () => {
    if (!sessionId) return;

    try {
      await mcpApi.disconnect(sessionId);
      addMessage({
        type: 'system',
        content: '✓ Disconnected from server',
      });
    } catch (error) {
      addMessage({
        type: 'error',
        content: `Disconnect error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setSessionId(null);
      setServerUrl('');
      setTools([]);
      setSelectedTool(null);
    }
  }, [sessionId, addMessage]);

  const handleExecuteTool = useCallback(async (toolName: string, args: Record<string, unknown>) => {
    if (!sessionId) return;

    setIsExecuting(true);
    addMessage({
      type: 'user',
      content: `Executing ${toolName}(${JSON.stringify(args)})`,
      toolName,
    });

    try {
      const response = await mcpApi.executeTool(sessionId, toolName, args);
      addMessage({
        type: 'tool-result',
        content: formatResult(response.result),
        toolName,
        executionTime: response.executionTime,
        rawResult: response.result,
      });
    } catch (error) {
      addMessage({
        type: 'error',
        content: `Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        toolName,
      });
    } finally {
      setIsExecuting(false);
    }
  }, [sessionId, addMessage]);

  return (
    <div className="app">
      <Header 
        isConnected={!!sessionId} 
        serverUrl={serverUrl}
        toolCount={tools.length}
      />
      
      <main className="app-main">
        {!sessionId ? (
          <ConnectionPanel 
            onConnect={handleConnect}
            isConnecting={isConnecting}
          />
        ) : (
          <div className="chat-layout">
            <ToolsSidebar 
              tools={tools}
              selectedTool={selectedTool}
              onSelectTool={setSelectedTool}
              onDisconnect={handleDisconnect}
            />
            <ChatContainer
              messages={messages}
              selectedTool={selectedTool}
              isExecuting={isExecuting}
              onExecuteTool={handleExecuteTool}
              onClearSelection={() => setSelectedTool(null)}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function formatResult(result: unknown): string {
  if (Array.isArray(result)) {
    return result.map(item => {
      if (typeof item === 'object' && item !== null && 'text' in item) {
        return (item as { text: string }).text;
      }
      return JSON.stringify(item, null, 2);
    }).join('\n');
  }
  
  if (typeof result === 'string') {
    return result;
  }
  
  return JSON.stringify(result, null, 2);
}

export default App;

