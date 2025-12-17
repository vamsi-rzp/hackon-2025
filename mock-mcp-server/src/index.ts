#!/usr/bin/env node
/**
 * Mock MCP Server for Payment Rules Testing
 * 
 * Supports both HTTP (SSE/Streamable HTTP) and stdio transports.
 * 
 * Usage:
 *   HTTP mode (default): npm start        → runs on http://localhost:8081
 *   Stdio mode:          npm start:stdio  → runs over stdin/stdout
 * 
 * This server simulates the following tools:
 * - fetch_merchant_rules: Fetch payment routing rules for a merchant
 * - generate_test_cases: Generate test cases from rules
 * - create_payment_request: Create a payment request for testing
 * - execute_test_cases: Execute test cases (with dry_run support)
 */

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { mockData, type TestCase } from "./mockData.js";

const PORT = parseInt(process.env.PORT ?? "8081", 10);
const USE_STDIO = process.argv.includes("--stdio");

// Store active transports by their session ID
const transports = new Map<string, StreamableHTTPServerTransport | SSEServerTransport>();

// ============================================================================
// CREATE MCP SERVER WITH TOOLS
// ============================================================================
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "mock-payment-rules-server",
    version: "1.0.0",
  });

  // Tool: fetch_merchant_rules
  server.tool(
    "fetch_merchant_rules",
    "Fetch payment routing rules for a merchant. Returns configured rule groups including card payment rules, UPI rules, and other payment method configurations.",
    {
      merchant_id: z.string().optional().describe("The merchant ID to fetch rules for (optional, uses default if not provided)"),
      api_key: z.string().optional().describe("API key for authentication (optional for mock)"),
      session_token: z.string().optional().describe("Session token for authentication (optional for mock)"),
    },
    async (args) => {
      await delay(100);
      const merchantId = args.merchant_id || "ELi8nocD30pFkb";
      console.log(`[Tool: fetch_merchant_rules] Merchant: ${merchantId}`);
      
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              merchant_id: merchantId,
              rules: mockData.merchantRules,
              count: mockData.merchantRules.length,
              fetched_at: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    }
  );

  // Tool: generate_test_cases
  server.tool(
    "generate_test_cases",
    "Generate test cases from merchant rules. Analyzes the rule expressions and creates test cases that cover different scenarios including positive and negative cases.",
    {
      rules_json: z.string().optional().describe("JSON string of rules (optional, will use previously fetched rules if not provided)"),
      rule_group_id: z.string().optional().describe("Specific rule group ID to generate test cases for (optional, generates for all if not provided)"),
    },
    async (args) => {
      await delay(150);
      const ruleGroupId = args.rule_group_id;
      console.log(`[Tool: generate_test_cases] Rule group: ${ruleGroupId || "all"}`);

      let testCases = mockData.testCases;

      if (ruleGroupId) {
        testCases = testCases.filter((tc) => tc.rule_group_id === ruleGroupId);
        if (testCases.length === 0) {
          testCases = generateMockTestCases(ruleGroupId);
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              test_cases: testCases,
              count: testCases.length,
              rule_group_filter: ruleGroupId || "all",
              generated_at: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    }
  );

  // Tool: create_payment_request
  server.tool(
    "create_payment_request",
    "Create a payment request configuration for testing. Generates the form data, URL, and headers needed to make a test payment request.",
    {
      test_case_json: z.string().optional().describe("JSON string of the test case object with id, parameters, rule_group_id, rule_id, and provider_id"),
      test_case: z.any().optional().describe("Test case object (alternative to JSON string)"),
      amount: z.number().optional().default(1000).describe("Payment amount in smallest currency unit"),
      currency: z.string().optional().default("INR").describe("Currency code (default: INR)"),
      contact: z.string().optional().describe("Contact phone number"),
      email: z.string().optional().describe("Email address"),
    },
    async (args) => {
      await delay(100);
      console.log(`[Tool: create_payment_request] Amount: ${args.amount} ${args.currency}`);

      let testCase: TestCase;
      try {
        if (args.test_case_json && typeof args.test_case_json === 'string') {
          testCase = JSON.parse(args.test_case_json) as TestCase;
        } else if (args.test_case && typeof args.test_case === 'object') {
          testCase = args.test_case as TestCase;
        } else if (args.test_case && typeof args.test_case === 'string') {
          testCase = JSON.parse(args.test_case) as TestCase;
        } else {
          // Fallback: use first mock test case
          console.log(`[Tool: create_payment_request] No test case provided, using mock data`);
          testCase = mockData.testCases[0];
        }
      } catch {
        // Fallback: use first mock test case
        console.log(`[Tool: create_payment_request] Parse error, using mock data`);
        testCase = mockData.testCases[0];
      }

      const { amount, currency, contact, email } = args;
      const method = testCase.parameters["$payment.navigator_method"] || "card";
      const cardType = testCase.parameters["$payment.navigator_card_type"];

      const formParams: Record<string, string> = {
        amount: amount.toString(),
        currency: currency || "INR",
        method: method,
        contact: contact || "+919493829160",
        email: email || "qa.testing@razorpay.com",
      };

      if (cardType) {
        formParams["card[type]"] = cardType;
      }

      if (testCase.provider_id) {
        formParams["force_terminal_id"] = `term_${generateId(14)}`;
      }

      formParams["key_id"] = "rzp_live_RKvnPwoEy6X3Rw";

      const formData = Object.entries(formParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&");

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              form_data: formData,
              url: "https://api.razorpay.com/v1/standard_checkout/payments/create/ajax",
              method: "POST",
              headers: {
                "Content-type": "application/x-www-form-urlencoded",
              },
              parameters: formParams,
              test_case_id: testCase.id,
              created_at: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    }
  );

  // Tool: execute_test_cases
  server.tool(
    "execute_test_cases",
    "Execute test cases against the payment system. Supports dry_run mode to validate test cases without making actual API calls.",
    {
      test_cases_json: z.string().optional().describe("JSON string of array of test cases to execute"),
      test_cases: z.any().optional().describe("Array of test cases (alternative to JSON string)"),
      dry_run: z.boolean().optional().default(true).describe("If true, validates test cases without making actual API calls"),
    },
    async (args) => {
      let testCases: TestCase[];
      
      // Try to get test cases from various input formats
      try {
        if (args.test_cases_json && typeof args.test_cases_json === 'string') {
          testCases = JSON.parse(args.test_cases_json) as TestCase[];
        } else if (args.test_cases && Array.isArray(args.test_cases)) {
          testCases = args.test_cases as TestCase[];
        } else if (args.test_cases && typeof args.test_cases === 'string') {
          testCases = JSON.parse(args.test_cases) as TestCase[];
        } else {
          // Fallback: use mock test cases if none provided
          console.log(`[Tool: execute_test_cases] No valid test cases provided, using mock data`);
          testCases = mockData.testCases;
        }
      } catch (parseError) {
        // If parsing fails, use mock test cases instead of erroring
        console.log(`[Tool: execute_test_cases] Parse error, using mock data:`, parseError);
        testCases = mockData.testCases;
      }

      const dryRun = args.dry_run ?? true;
      console.log(`[Tool: execute_test_cases] Cases: ${testCases.length}, Dry run: ${dryRun}`);

      await delay(dryRun ? 100 : 500);

      const results = testCases.map((testCase) => {
        const success = Math.random() > 0.1;
        
        if (dryRun) {
          return {
            test_case: testCase,
            success: true,
            response: "DRY_RUN: Test case would be executed",
            validation: {
              parameters_valid: true,
              rule_group_exists: true,
              provider_configured: !!testCase.provider_id,
            },
          };
        }

        const paymentId = `pay_${generateId(10)}`;
        return {
          test_case: testCase,
          success,
          status_code: success ? 200 : 400,
          response: success
            ? JSON.stringify({
                id: paymentId,
                status: "created",
                method: testCase.parameters["$payment.navigator_method"] || "card",
                amount: parseInt(testCase.parameters["$payment.navigator_amount"] || "1000"),
                currency: testCase.parameters["$payment.optimizer_currency"] || "INR",
              })
            : JSON.stringify({
                error: {
                  code: "BAD_REQUEST_ERROR",
                  description: "Mock error for testing",
                },
              }),
          actual_gateway: success ? testCase.provider_id : undefined,
          execution_time_ms: Math.floor(Math.random() * 200) + 50,
        };
      });

      const passed = results.filter((r) => r.success).length;
      const failed = results.length - passed;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              report: {
                total_cases: testCases.length,
                passed,
                failed,
                results,
                generated_at: new Date().toISOString(),
              },
              summary: {
                total: testCases.length,
                passed,
                failed,
                pass_rate: `${((passed / testCases.length) * 100).toFixed(2)}%`,
              },
              dry_run: dryRun,
            }, null, 2),
          },
        ],
      };
    }
  );

  return server;
}

// ============================================================================
// Helper Functions
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateId(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join("");
}

function generateMockTestCases(ruleGroupId: string): TestCase[] {
  const methods = ["card", "upi_intent", "netbanking", "wallet"];
  const currencies = ["INR", "USD"];
  const cardTypes = ["debit", "credit"];

  return Array.from({ length: 3 }, (_, i) => ({
    id: `${ruleGroupId}_${i}`,
    parameters: {
      "$payment.navigator_method": methods[i % methods.length],
      "$payment.navigator_card_type": cardTypes[i % cardTypes.length],
      "$payment.optimizer_currency": currencies[i % currencies.length],
      "$payment.navigator_amount": ((i + 1) * 1000).toString(),
    },
    rule_group_id: ruleGroupId,
    rule_id: `rule_${generateId(6)}`,
    provider_id: `provider_${methods[i % methods.length]}_00${i + 1}`,
    expected_gateway: `provider_${methods[i % methods.length]}_00${i + 1}`,
  }));
}

// ============================================================================
// HTTP SERVER WITH SSE & STREAMABLE HTTP
// ============================================================================

function startHttpServer() {
  const app = express();
  app.use(express.json());

  // CORS middleware
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // ========================================
  // STREAMABLE HTTP TRANSPORT (Protocol 2025-03-26)
  // ========================================
  app.all("/mcp", async (req: Request, res: Response) => {
    console.log(`[MCP] ${req.method} request`);
    
    try {
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

  // ========================================
  // SSE TRANSPORT (Legacy - Protocol 2024-11-05)
  // ========================================
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

  // ========================================
  // INFO & HEALTH ENDPOINTS
  // ========================================
  app.get("/health", (_req, res) => res.json({ 
    status: "healthy", 
    sessions: transports.size,
    transports: {
      streamableHttp: "/mcp",
      sse: "/sse (legacy)",
    }
  }));

  app.get("/", (_req, res) => res.json({
    name: "Mock Payment Rules MCP Server",
    version: "1.0.0",
    description: "Mock server for testing payment rules",
    endpoints: {
      streamableHttp: "/mcp (recommended)",
      sse: "/sse (legacy)",
      health: "/health",
    },
    tools: ["fetch_merchant_rules", "generate_test_cases", "create_payment_request", "execute_test_cases"],
  }));

  // ========================================
  // START SERVER
  // ========================================
  const server = app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║         Mock Payment Rules MCP Server v1.0.0                   ║
╠════════════════════════════════════════════════════════════════╣
║  Streamable HTTP: http://localhost:${PORT}/mcp (recommended)       ║
║  SSE (legacy):    http://localhost:${PORT}/sse                     ║
╠════════════════════════════════════════════════════════════════╣
║  Tools:                                                        ║
║    • fetch_merchant_rules   - Fetch payment routing rules      ║
║    • generate_test_cases    - Generate test cases from rules   ║
║    • create_payment_request - Create payment request config    ║
║    • execute_test_cases     - Execute tests (dry_run support)  ║
╚════════════════════════════════════════════════════════════════╝`);
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
}

// ============================================================================
// STDIO SERVER
// ============================================================================

async function startStdioServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[Mock MCP Server] Payment Rules Testing Server started (stdio mode)");
  console.error("[Mock MCP Server] Available tools: fetch_merchant_rules, generate_test_cases, create_payment_request, execute_test_cases");
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

if (USE_STDIO) {
  startStdioServer().catch((error) => {
    console.error("[Mock MCP Server] Fatal error:", error);
    process.exit(1);
  });
} else {
  startHttpServer();
}
