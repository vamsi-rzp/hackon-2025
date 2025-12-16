import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express, { type Request, type Response } from "express";
import { z } from "zod";

const PORT = parseInt(process.env.PORT ?? "8080", 10);

// Create Express app
const app = express();
app.use(express.json());

// Store active transports by their session ID
const transports = new Map<string, StreamableHTTPServerTransport | SSEServerTransport>();

// ============================================
// CREATE SERVER WITH TOOLS
// ============================================
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "sample-mcp-server",
    version: "1.0.0",
  });

  // 1. Echo Tool
  server.tool(
    "echo",
    "Echoes back the provided message. Useful for testing connectivity.",
    { message: z.string().describe("The message to echo back") },
    async ({ message }) => {
      console.log(`[Tool: echo] Message: ${message}`);
      return {
        content: [{ type: "text", text: `Echo: ${message}` }],
      };
    }
  );

  // 2. Calculator Tool
  server.tool(
    "calculator",
    "Performs basic arithmetic operations (add, subtract, multiply, divide)",
    {
      operation: z.enum(["add", "subtract", "multiply", "divide"]).describe("The operation to perform"),
      a: z.number().describe("First operand"),
      b: z.number().describe("Second operand"),
    },
    async ({ operation, a, b }) => {
      console.log(`[Tool: calculator] ${a} ${operation} ${b}`);
      let result: number;
      switch (operation) {
        case "add": result = a + b; break;
        case "subtract": result = a - b; break;
        case "multiply": result = a * b; break;
        case "divide":
          if (b === 0) return { content: [{ type: "text", text: "Error: Division by zero" }], isError: true };
          result = a / b;
          break;
      }
      return { content: [{ type: "text", text: `${a} ${operation} ${b} = ${result}` }] };
    }
  );

  // 3. Weather Tool
  server.tool(
    "get_weather",
    "Gets the current weather for a city (simulated data)",
    {
      city: z.string().describe("The city name to get weather for"),
      units: z.enum(["celsius", "fahrenheit"]).optional().default("celsius").describe("Temperature units"),
    },
    async ({ city, units }) => {
      console.log(`[Tool: get_weather] City: ${city}, Units: ${units}`);
      const weatherData: Record<string, { temp: number; condition: string; humidity: number }> = {
        "new york": { temp: 18, condition: "Partly Cloudy", humidity: 65 },
        "london": { temp: 12, condition: "Rainy", humidity: 80 },
        "tokyo": { temp: 22, condition: "Sunny", humidity: 55 },
        "paris": { temp: 15, condition: "Cloudy", humidity: 70 },
        "mumbai": { temp: 32, condition: "Hot & Humid", humidity: 85 },
        "singapore": { temp: 30, condition: "Thunderstorms", humidity: 90 },
        "sydney": { temp: 25, condition: "Sunny", humidity: 45 },
      };
      const weather = weatherData[city.toLowerCase()] ?? {
        temp: Math.floor(Math.random() * 30) + 5,
        condition: ["Sunny", "Cloudy", "Rainy", "Windy"][Math.floor(Math.random() * 4)],
        humidity: Math.floor(Math.random() * 60) + 30,
      };
      let temp = weather.temp;
      let unitSymbol = "°C";
      if (units === "fahrenheit") {
        temp = Math.round((temp * 9) / 5 + 32);
        unitSymbol = "°F";
      }
      return {
        content: [{
          type: "text",
          text: `Weather in ${city}:\n🌡️ Temperature: ${temp}${unitSymbol}\n☁️ Condition: ${weather.condition}\n💧 Humidity: ${weather.humidity}%`,
        }],
      };
    }
  );

  // 4. Random Number
  server.tool(
    "random_number",
    "Generates a random number between min and max",
    {
      min: z.number().optional().default(1).describe("Minimum value"),
      max: z.number().optional().default(100).describe("Maximum value"),
    },
    async ({ min, max }) => {
      const result = Math.floor(Math.random() * (max - min + 1)) + min;
      console.log(`[Tool: random_number] ${min}-${max}: ${result}`);
      return { content: [{ type: "text", text: `🎲 Random number between ${min} and ${max}: ${result}` }] };
    }
  );

  // 5. Get Time
  server.tool(
    "get_time",
    "Gets the current date and time",
    {
      timezone: z.string().optional().default("UTC").describe("Timezone (e.g., America/New_York)"),
    },
    async ({ timezone }) => {
      console.log(`[Tool: get_time] Timezone: ${timezone}`);
      const now = new Date();
      let result: string;
      try {
        result = now.toLocaleString("en-US", { timeZone: timezone, dateStyle: "full", timeStyle: "long" });
      } catch {
        result = `Invalid timezone. UTC: ${now.toISOString()}`;
      }
      return { content: [{ type: "text", text: `🕐 ${result}` }] };
    }
  );

  // 6. Text Transform
  server.tool(
    "text_transform",
    "Transforms text with various operations",
    {
      text: z.string().describe("The text to transform"),
      operation: z.enum(["uppercase", "lowercase", "reverse", "length", "wordcount"]).describe("The transformation"),
    },
    async ({ text, operation }) => {
      console.log(`[Tool: text_transform] ${operation}`);
      let result: string;
      switch (operation) {
        case "uppercase": result = text.toUpperCase(); break;
        case "lowercase": result = text.toLowerCase(); break;
        case "reverse": result = text.split("").reverse().join(""); break;
        case "length": result = `Length: ${text.length} characters`; break;
        case "wordcount": result = `Word count: ${text.trim().split(/\s+/).filter(Boolean).length} words`; break;
      }
      return { content: [{ type: "text", text: result }] };
    }
  );

  // 7. Generate UUID
  server.tool(
    "generate_uuid",
    "Generates one or more UUIDs",
    {
      count: z.number().min(1).max(10).optional().default(1).describe("Number of UUIDs (1-10)"),
    },
    async ({ count }) => {
      const uuids = Array.from({ length: count }, () => crypto.randomUUID());
      console.log(`[Tool: generate_uuid] Generated ${count} UUID(s)`);
      return { content: [{ type: "text", text: uuids.join("\n") }] };
    }
  );

  // 8. Greeting Tool
  server.tool(
    "greet",
    "Generates a personalized greeting message",
    {
      name: z.string().describe("Name to greet"),
      style: z.enum(["formal", "casual", "enthusiastic"]).optional().default("casual").describe("Greeting style"),
    },
    async ({ name, style }) => {
      console.log(`[Tool: greet] ${name} (${style})`);
      let greeting: string;
      switch (style) {
        case "formal": greeting = `Good day, ${name}. It is a pleasure to make your acquaintance.`; break;
        case "enthusiastic": greeting = `🎉 HEY ${name.toUpperCase()}! SO AWESOME TO SEE YOU! 🚀`; break;
        default: greeting = `Hey ${name}! What's up? 👋`;
      }
      return { content: [{ type: "text", text: greeting }] };
    }
  );

  return server;
}

// ============================================
// STREAMABLE HTTP TRANSPORT (NEW - Protocol 2025-03-26)
// Single endpoint for all MCP operations
// ============================================
app.all("/mcp", async (req: Request, res: Response) => {
  console.log(`[MCP] ${req.method} request`);
  
  try {
    // Check for existing session
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      const existing = transports.get(sessionId);
      if (existing instanceof StreamableHTTPServerTransport) {
        transport = existing;
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Session uses different transport protocol" },
          id: null,
        });
        return;
      }
    } else if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
      // New session - create transport
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          console.log(`[MCP] Session initialized: ${sid.slice(0, 8)}...`);
          transports.set(sid, transport);
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          console.log(`[MCP] Session closed: ${sid.slice(0, 8)}...`);
          transports.delete(sid);
        }
      };

      // Connect server to transport
      const server = createMcpServer();
      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid request: No valid session ID" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[MCP] Error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// ============================================
// SSE TRANSPORT (LEGACY - Protocol 2024-11-05)
// Deprecated but maintained for backward compatibility
// ============================================
app.get("/sse", async (_req: Request, res: Response) => {
  console.log("[SSE] New connection (legacy transport)");
  
  const server = createMcpServer();
  const transport = new SSEServerTransport("/messages", res);
  
  // @ts-expect-error - accessing private _sessionId
  const sessionId: string = transport._sessionId;
  
  transports.set(sessionId, transport);
  console.log(`[SSE] Session ${sessionId.slice(0, 8)}... established`);
  
  res.on("close", () => {
    console.log(`[SSE] Session ${sessionId.slice(0, 8)}... disconnected`);
    transports.delete(sessionId);
  });

  await server.connect(transport);
});

app.post("/messages", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  
  if (!sessionId) {
    res.status(400).json({ error: "No sessionId" });
    return;
  }
  
  const transport = transports.get(sessionId);
  if (!transport || !(transport instanceof SSEServerTransport)) {
    res.status(404).json({ error: "Session not found or wrong transport type" });
    return;
  }

  await transport.handlePostMessage(req, res, req.body);
});

// ============================================
// INFO & HEALTH ENDPOINTS
// ============================================
app.get("/health", (_req, res) => res.json({ 
  status: "healthy", 
  sessions: transports.size,
  transports: {
    streamableHttp: "/mcp",
    sse: "/sse (legacy)",
  }
}));

app.get("/", (_req, res) => res.json({
  name: "Sample MCP Server",
  version: "1.0.0",
  endpoints: {
    streamableHttp: "/mcp (recommended)",
    sse: "/sse (legacy)",
  },
  tools: ["echo", "calculator", "get_weather", "random_number", "get_time", "text_transform", "generate_uuid", "greet"],
}));

// ============================================
// SERVER LIFECYCLE
// ============================================
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║              Sample MCP Server v1.0.0                      ║
╠════════════════════════════════════════════════════════════╣
║  Streamable HTTP: http://localhost:${PORT}/mcp (recommended)   ║
║  SSE (legacy):    http://localhost:${PORT}/sse                 ║
╠════════════════════════════════════════════════════════════╣
║  Tools: echo, calculator, get_weather, random_number,      ║
║         get_time, text_transform, generate_uuid, greet     ║
╚════════════════════════════════════════════════════════════╝`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[Shutdown] Closing all transports...");
  for (const [sessionId, transport] of transports) {
    try {
      await transport.close();
      console.log(`[Shutdown] Closed session ${sessionId.slice(0, 8)}...`);
    } catch (e) {
      console.error(`[Shutdown] Error closing ${sessionId}:`, e);
    }
  }
  transports.clear();
  server.close();
  process.exit(0);
});
