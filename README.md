# Universal MCP Gateway Service

A RESTful intermediary service that acts as a generic MCP (Model Context Protocol) Client, allowing API consumers to connect to any remote MCP Server via SSE (Server-Sent Events), discover its tools, and execute them through a simple REST API.

## Features

- **Universal Connectivity**: Connect to any MCP server that supports SSE transport
- **Session Management**: Maintain multiple concurrent connections with unique session IDs
- **Tool Discovery**: Automatically discover and cache available tools upon connection
- **Tool Execution**: Execute remote tools with full argument passing support
- **LLM Integration**: AWS Bedrock integration for intelligent tool calling via natural language
- **Graceful Shutdown**: Clean disconnection of all sessions on server shutdown
- **Comprehensive Logging**: Detailed logging for debugging and monitoring

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     API Consumers                               │
│                   (Applications, CLI, etc.)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST API
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Universal MCP Gateway Service                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Express.js Server                       │   │
│  │  ┌────────────────────┐  ┌────────────────────────────┐ │   │
│  │  │   Route Handlers   │──│    Session Controller      │ │   │
│  │  └────────────────────┘  └────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                 McpClientManager                          │   │
│  │  ┌────────────────┐  ┌─────────────────────────────────┐ │   │
│  │  │ Session Store  │  │   MCP SDK + SSE Transport       │ │   │
│  │  │  (In-Memory)   │  │   (EventSource Polyfill)        │ │   │
│  │  └────────────────┘  └─────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │ SSE (Server-Sent Events)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Remote MCP Servers                            │
│              (Running on AWS or elsewhere)                      │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Runtime**: Node.js (Latest LTS - v20+)
- **Language**: TypeScript (Strict mode)
- **Framework**: Express.js
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **SSE Client**: `eventsource` (npm package for Node.js SSE support)
- **LLM**: AWS Bedrock (Claude 3 Sonnet via Converse API)

## Prerequisites

- Node.js 20.x or later
- npm or yarn

## Installation

```bash
# Clone or navigate to the project directory
cd universal-mcp-gateway

# Install dependencies
npm install

# Build the TypeScript code
npm run build

# Start the server
npm start
```

## Development

```bash
# Run in development mode with hot-reload
npm run dev
```

## Configuration

The service can be configured via environment variables:

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `NODE_ENV` | `development` | Environment mode |

### AWS Bedrock Configuration (for LLM Chat)

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_REGION` | `us-east-1` | AWS region for Bedrock |
| `AWS_ACCESS_KEY_ID` | - | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | - | AWS secret key |
| `BEDROCK_MODEL_ID` | `anthropic.claude-3-sonnet-20240229-v1:0` | Bedrock model ID |
| `BEDROCK_MAX_TOKENS` | `2048` | Max tokens for LLM responses |

Example:
```bash
# Basic server
PORT=8080 npm start

# With AWS Bedrock
AWS_REGION=us-east-1 \
AWS_ACCESS_KEY_ID=your-key \
AWS_SECRET_ACCESS_KEY=your-secret \
npm start
```

## API Endpoints

### Health Check
```
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "activeSessions": 2
}
```

### Connect to MCP Server
```
POST /api/connect
Content-Type: application/json

{
  "serverUrl": "http://your-mcp-server.com/sse"
}
```

Response:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "tools": [
    {
      "name": "weather_lookup",
      "description": "Look up weather for a city",
      "inputSchema": {
        "type": "object",
        "properties": {
          "city": { "type": "string" }
        },
        "required": ["city"]
      }
    }
  ],
  "serverUrl": "http://your-mcp-server.com/sse",
  "connectedAt": "2024-01-15T10:30:00.000Z"
}
```

### List Active Sessions
```
GET /api/sessions
```

Response:
```json
{
  "sessions": [
    {
      "sessionId": "550e8400-e29b-41d4-a716-446655440000",
      "serverUrl": "http://your-mcp-server.com/sse",
      "toolCount": 5,
      "status": "connected",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

### Get Session Info
```
GET /api/session/:sessionId
```

Response:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "serverUrl": "http://your-mcp-server.com/sse",
  "toolCount": 5,
  "status": "connected",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

### Get Available Tools
```
GET /api/session/:sessionId/tools
```

Response:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "tools": [
    {
      "name": "weather_lookup",
      "description": "Look up weather for a city",
      "inputSchema": { ... }
    }
  ],
  "count": 1
}
```

### Refresh Tools List
```
POST /api/session/:sessionId/tools/refresh
```

### Execute a Tool
```
POST /api/session/:sessionId/execute
Content-Type: application/json

{
  "toolName": "weather_lookup",
  "arguments": {
    "city": "Paris"
  }
}
```

Response:
```json
{
  "success": true,
  "result": [
    {
      "type": "text",
      "text": "The weather in Paris is 15°C and sunny."
    }
  ],
  "toolName": "weather_lookup",
  "executionTime": 245
}
```

### Disconnect Session
```
DELETE /api/session/:sessionId
```

Response:
```json
{
  "success": true,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Session disconnected successfully"
}
```

## Example Usage with cURL

### 1. Connect to an MCP Server

```bash
curl -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{"serverUrl": "http://your-mcp-server.com/sse"}'
```

### 2. List Tools for a Session

```bash
curl http://localhost:3000/api/session/<sessionId>/tools
```

### 3. Execute a Tool

```bash
curl -X POST http://localhost:3000/api/session/<sessionId>/execute \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "weather_lookup",
    "arguments": {"city": "London"}
  }'
```

### 4. Disconnect a Session

```bash
curl -X DELETE http://localhost:3000/api/session/<sessionId>
```

## Error Handling

The service returns consistent error responses:

```json
{
  "error": "Description of the error",
  "code": "ERROR_CODE",
  "details": { ... }  // Optional additional details
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Missing or invalid request parameters |
| `INVALID_URL` | 400 | Invalid server URL provided |
| `SESSION_NOT_FOUND` | 404 | Session ID not found |
| `SESSION_NOT_CONNECTED` | 400 | Session exists but is not connected |
| `TOOL_NOT_FOUND` | 404 | Tool not available on the server |
| `CONNECTION_FAILED` | 503 | Failed to connect to MCP server |
| `TRANSPORT_ERROR` | 500 | SSE transport error |
| `TOOL_DISCOVERY_FAILED` | 500 | Failed to list tools from server |
| `TOOL_EXECUTION_FAILED` | 500 | Tool execution failed |
| `TOOL_EXECUTION_ERROR` | 400 | Tool returned an error result |

## Project Structure

```
.
├── src/
│   ├── controllers/
│   │   └── sessionController.ts    # API request handlers
│   ├── routes/
│   │   └── index.ts                # Route definitions
│   ├── services/
│   │   └── McpClientManager.ts     # MCP client management
│   ├── types/
│   │   └── index.ts                # TypeScript type definitions
│   └── index.ts                    # Application entry point
├── package.json
├── tsconfig.json
└── README.md
```

## Logging

The service provides detailed logging for debugging:

```
[McpClientManager] Connecting to http://server.com/sse (Session: abc-123)
[McpClientManager] Connected successfully (Session: abc-123)
[McpClientManager] Discovered 5 tools: tool1, tool2, tool3, tool4, tool5
[McpClientManager] Calling tool 'weather_lookup' (Session: abc-123)
[McpClientManager] Tool 'weather_lookup' executed in 245ms
[McpClientManager] Disconnecting session abc-123
```

## Security Considerations

This is an MVP implementation without authentication. For production use, consider adding:

- API key authentication
- Rate limiting
- Request validation
- HTTPS/TLS termination
- Session timeouts
- Multi-tenancy support

## License

MIT

