import { useRef, useEffect, useState } from 'react';
import { Send, X, Clock, CheckCircle, AlertCircle, Terminal, Loader2 } from 'lucide-react';
import type { Tool, ChatMessage } from '../types';
import './ChatContainer.css';

interface ChatContainerProps {
  messages: ChatMessage[];
  selectedTool: Tool | null;
  isExecuting: boolean;
  onExecuteTool: (toolName: string, args: Record<string, unknown>) => void;
  onClearSelection: () => void;
}

export function ChatContainer({
  messages,
  selectedTool,
  isExecuting,
  onExecuteTool,
  onClearSelection,
}: ChatContainerProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [args, setArgs] = useState<Record<string, string>>({});

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (selectedTool) {
      setArgs({});
    }
  }, [selectedTool]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTool || isExecuting) return;

    const parsedArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      try {
        parsedArgs[key] = JSON.parse(value);
      } catch {
        parsedArgs[key] = value;
      }
    }

    onExecuteTool(selectedTool.name, parsedArgs);
  };

  const getInputType = (schema: unknown): string => {
    if (typeof schema === 'object' && schema !== null && 'type' in schema) {
      const type = (schema as { type: string }).type;
      if (type === 'number' || type === 'integer') return 'number';
      if (type === 'boolean') return 'checkbox';
    }
    return 'text';
  };

  const properties = selectedTool?.inputSchema?.properties ?? {};
  const required = selectedTool?.inputSchema?.required ?? [];

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <Terminal size={48} />
            <h3>Ready for Commands</h3>
            <p>Select a tool from the sidebar to begin executing commands</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`chat-message ${message.type} animate-slide-in`}
            >
              <div className="message-header">
                <span className="message-type">
                  {message.type === 'user' && '→'}
                  {message.type === 'system' && '◆'}
                  {message.type === 'tool-result' && <CheckCircle size={14} />}
                  {message.type === 'error' && <AlertCircle size={14} />}
                  <span>
                    {message.type === 'user' && 'Command'}
                    {message.type === 'system' && 'System'}
                    {message.type === 'tool-result' && 'Result'}
                    {message.type === 'error' && 'Error'}
                  </span>
                </span>
                <span className="message-time">
                  <Clock size={12} />
                  {formatTime(message.timestamp)}
                  {message.executionTime !== undefined && (
                    <span className="execution-time">({message.executionTime}ms)</span>
                  )}
                </span>
              </div>
              <div className="message-content">
                <pre>{message.content}</pre>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {selectedTool && (
        <div className="tool-executor">
          <div className="executor-header">
            <div className="executor-title">
              <Terminal size={18} />
              <span>{selectedTool.name}</span>
            </div>
            <button onClick={onClearSelection} className="close-button">
              <X size={18} />
            </button>
          </div>

          {selectedTool.description && (
            <p className="executor-description">{selectedTool.description}</p>
          )}

          <form onSubmit={handleSubmit} className="executor-form">
            {Object.keys(properties).length > 0 ? (
              <div className="executor-params">
                {Object.entries(properties).map(([key, schema]) => (
                  <div key={key} className="param-field">
                    <label htmlFor={key}>
                      {key}
                      {required.includes(key) && <span className="required">*</span>}
                    </label>
                    {getInputType(schema) === 'checkbox' ? (
                      <input
                        type="checkbox"
                        id={key}
                        checked={args[key] === 'true'}
                        onChange={(e) =>
                          setArgs((prev) => ({
                            ...prev,
                            [key]: e.target.checked.toString(),
                          }))
                        }
                        disabled={isExecuting}
                      />
                    ) : (
                      <input
                        type={getInputType(schema)}
                        id={key}
                        value={args[key] ?? ''}
                        onChange={(e) =>
                          setArgs((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        placeholder={getPlaceholder(schema)}
                        disabled={isExecuting}
                        required={required.includes(key)}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-params">This tool has no parameters</p>
            )}

            <button type="submit" className="execute-button" disabled={isExecuting}>
              {isExecuting ? (
                <>
                  <Loader2 size={18} className="spin" />
                  <span>Executing...</span>
                </>
              ) : (
                <>
                  <Send size={18} />
                  <span>Execute</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getPlaceholder(schema: unknown): string {
  if (typeof schema === 'object' && schema !== null) {
    const s = schema as Record<string, unknown>;
    if (s.description) return String(s.description);
    if (s.type) return `Enter ${s.type}...`;
  }
  return 'Enter value...';
}

