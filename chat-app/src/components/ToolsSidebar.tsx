import { Wrench, LogOut, ChevronRight, Info } from 'lucide-react';
import type { Tool } from '../types';
import './ToolsSidebar.css';

interface ToolsSidebarProps {
  tools: Tool[];
  selectedTool: Tool | null;
  onSelectTool: (tool: Tool) => void;
  onDisconnect: () => void;
}

export function ToolsSidebar({ tools, selectedTool, onSelectTool, onDisconnect }: ToolsSidebarProps) {
  return (
    <aside className="tools-sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">
          <Wrench size={18} />
          <span>Available Tools</span>
        </div>
        <span className="tools-count">{tools.length}</span>
      </div>

      <div className="tools-list">
        {tools.map((tool) => (
          <button
            key={tool.name}
            className={`tool-item ${selectedTool?.name === tool.name ? 'selected' : ''}`}
            onClick={() => onSelectTool(tool)}
          >
            <div className="tool-item-header">
              <span className="tool-name">{tool.name}</span>
              <ChevronRight size={16} className="tool-arrow" />
            </div>
            {tool.description && (
              <p className="tool-description">{tool.description}</p>
            )}
            {tool.inputSchema?.properties && (
              <div className="tool-params">
                <Info size={12} />
                <span>
                  {Object.keys(tool.inputSchema.properties).length} parameter(s)
                </span>
              </div>
            )}
          </button>
        ))}

        {tools.length === 0 && (
          <div className="no-tools">
            <p>No tools available</p>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <button onClick={onDisconnect} className="disconnect-button">
          <LogOut size={18} />
          <span>Disconnect</span>
        </button>
      </div>
    </aside>
  );
}

