# Mock MCP Server for Payment Rules Testing

A mock MCP (Model Context Protocol) server that simulates payment rules testing tools. Supports both **HTTP (SSE/Streamable HTTP)** and **stdio** transports.

## Installation

```bash
npm install
npm run build
```

## Usage

### HTTP Mode (Default) - SSE & Streamable HTTP

```bash
npm start
# or
npm run dev
```

Server runs at `http://localhost:8081` with endpoints:
- **`/mcp`** - Streamable HTTP transport (recommended, Protocol 2025-03-26)
- **`/sse`** - SSE transport (legacy, Protocol 2024-11-05)
- **`/health`** - Health check endpoint

### Stdio Mode

```bash
npm run start:stdio
# or
npm run dev:stdio
```

### Custom Port

```bash
PORT=9000 npm start
```

## Available Tools

### 1. `fetch_merchant_rules`

Fetches payment routing rules for a merchant.

**Parameters:**
- `merchant_id` (optional): The merchant ID to fetch rules for
- `api_key` (optional): API key for authentication
- `session_token` (optional): Session token for authentication

### 2. `generate_test_cases`

Generates test cases from merchant rules.

**Parameters:**
- `rules_json` (optional): JSON string of rules
- `rule_group_id` (optional): Specific rule group ID to filter

### 3. `create_payment_request`

Creates a payment request configuration for testing.

**Parameters:**
- `test_case_json` (required): JSON string of the test case object
- `amount` (required): Payment amount in smallest currency unit
- `currency` (optional, default: "INR"): Currency code
- `contact` (optional): Contact phone number
- `email` (optional): Email address

### 4. `execute_test_cases`

Executes test cases against the payment system.

**Parameters:**
- `test_cases_json` (required): JSON string of array of test cases
- `dry_run` (optional, default: true): If true, validates without making API calls

## Integration with MCP Gateway

### SSE Transport (HTTP)

Add to your MCP presets in `src/config/index.ts`:

```typescript
{
  id: "mock-payment-rules",
  name: "Mock Payment Rules Server",
  description: "Mock server for testing payment rules",
  transport: {
    type: "sse",
    url: "http://localhost:8081/sse"
  },
  autoConnect: true,
  tags: ["mock", "payment", "testing"]
}
```

### Stdio Transport

```typescript
{
  id: "mock-payment-rules",
  name: "Mock Payment Rules Server",
  description: "Mock server for testing payment rules",
  transport: {
    type: "stdio",
    command: "node",
    args: ["/path/to/mock-mcp-server/dist/index.js", "--stdio"]
  },
  autoConnect: false,
  tags: ["mock", "payment", "testing"]
}
```

## API Endpoints

### Health Check
```bash
curl http://localhost:8081/health
```

### Server Info
```bash
curl http://localhost:8081/
```

## Testing with curl

### SSE Connection
```bash
# Open SSE connection
curl -N http://localhost:8081/sse
```

### Test Tool Call (via messages endpoint)
```bash
# First get session ID from SSE connection, then:
curl -X POST "http://localhost:8081/messages?sessionId=YOUR_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"fetch_merchant_rules","arguments":{}}}'
```

## Mock Data

The server includes mock data for:
- 4 rule groups (Card, UPI, Netbanking, Wallet)
- 6 pre-generated test cases
- Dynamic test case generation for any rule group ID

## License

MIT
