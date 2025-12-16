import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type ContentBlock,
  type ToolConfiguration,
  type ToolResultBlock,
  type ToolUseBlock,
  type ConversationRole,
} from "@aws-sdk/client-bedrock-runtime";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// Configuration
const DEFAULT_MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-sonnet-20240229-v1:0";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const MAX_TOKENS = parseInt(process.env.BEDROCK_MAX_TOKENS || "2048", 10);

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  message: string;
  toolCalls?: ToolCall[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ToolCall {
  toolUseId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolUseId: string;
  result: unknown;
  isError?: boolean;
}

/**
 * BedrockService - Handles LLM interactions via AWS Bedrock
 * 
 * Uses the Converse API with tool use support for intelligent
 * MCP tool calling based on natural language.
 */
export class BedrockService {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor(modelId?: string, region?: string) {
    this.modelId = modelId || DEFAULT_MODEL_ID;
    this.client = new BedrockRuntimeClient({
      region: region || AWS_REGION,
    });
    
    console.log(`[BedrockService] Initialized with model: ${this.modelId}`);
  }

  /**
   * Convert MCP tools to Bedrock tool configuration
   */
  private convertToolsToBedrockFormat(mcpTools: Tool[]): ToolConfiguration {
    const tools = mcpTools.map((tool) => ({
      toolSpec: {
        name: tool.name,
        description: tool.description || `Tool: ${tool.name}`,
        inputSchema: {
          json: tool.inputSchema || { type: "object", properties: {} },
        },
      },
    }));

    return { tools } as ToolConfiguration;
  }

  /**
   * Convert chat history to Bedrock message format
   */
  private convertToBedrockMessages(history: ChatMessage[]): Message[] {
    return history.map((msg) => ({
      role: msg.role as ConversationRole,
      content: [{ text: msg.content }],
    }));
  }

  /**
   * Chat with the LLM, optionally providing tools for function calling
   */
  async chat(
    userMessage: string,
    history: ChatMessage[] = [],
    tools?: Tool[],
    systemPrompt?: string
  ): Promise<ChatResponse> {
    console.log(`[BedrockService] Chat request: "${userMessage.slice(0, 50)}..."`);

    // Build messages
    const messages: Message[] = [
      ...this.convertToBedrockMessages(history),
      {
        role: "user",
        content: [{ text: userMessage }],
      },
    ];

    // Build system prompt
    const system = systemPrompt
      ? [{ text: systemPrompt }]
      : [
          {
            text: `You are a helpful AI assistant with access to various tools. 
When a user asks for something that can be accomplished with one of your tools, use the appropriate tool.
Be concise and friendly in your responses. If you use a tool, briefly explain what you did.
If the user's request doesn't match any available tool, respond helpfully with what you can do.`,
          },
        ];

    // Build tool config if tools provided
    const toolConfig = tools && tools.length > 0
      ? this.convertToolsToBedrockFormat(tools)
      : undefined;

    try {
      const command = new ConverseCommand({
        modelId: this.modelId,
        messages,
        system,
        toolConfig,
        inferenceConfig: {
          maxTokens: MAX_TOKENS,
          temperature: 0.7,
        },
      });

      const response = await this.client.send(command);

      // Extract text content and tool calls
      const outputContent = response.output?.message?.content || [];
      let textContent = "";
      const toolCalls: ToolCall[] = [];

      for (const block of outputContent) {
        if ("text" in block && block.text) {
          textContent += block.text;
        }
        if ("toolUse" in block && block.toolUse) {
          const toolUse = block.toolUse as ToolUseBlock;
          toolCalls.push({
            toolUseId: toolUse.toolUseId || crypto.randomUUID(),
            toolName: toolUse.name || "unknown",
            arguments: (toolUse.input as Record<string, unknown>) || {},
          });
        }
      }

      console.log(`[BedrockService] Response: ${textContent.slice(0, 50)}... | Tools: ${toolCalls.length}`);

      return {
        message: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: response.usage
          ? {
              inputTokens: response.usage.inputTokens || 0,
              outputTokens: response.usage.outputTokens || 0,
            }
          : undefined,
      };
    } catch (error) {
      console.error("[BedrockService] Error:", error);
      throw new Error(
        `Bedrock API error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Continue conversation after tool execution with results
   */
  async continueWithToolResults(
    originalMessages: ChatMessage[],
    userMessage: string,
    toolCalls: ToolCall[],
    toolResults: ToolResult[],
    tools?: Tool[],
    systemPrompt?: string
  ): Promise<ChatResponse> {
    console.log(`[BedrockService] Continuing with ${toolResults.length} tool results`);

    // Build message history including the assistant's tool calls and results
    const messages: Message[] = [
      ...this.convertToBedrockMessages(originalMessages),
      {
        role: "user",
        content: [{ text: userMessage }],
      },
      {
        role: "assistant",
        content: toolCalls.map((tc) => ({
          toolUse: {
            toolUseId: tc.toolUseId,
            name: tc.toolName,
            input: tc.arguments,
          },
        })) as ContentBlock[],
      },
      {
        role: "user",
        content: toolResults.map((tr) => ({
          toolResult: {
            toolUseId: tr.toolUseId,
            content: [{ text: formatToolResult(tr.result) }],
            status: tr.isError ? "error" : "success",
          } as ToolResultBlock,
        })) as ContentBlock[],
      },
    ];

    const system = systemPrompt
      ? [{ text: systemPrompt }]
      : [
          {
            text: `You are a helpful AI assistant. You just used some tools and received results.
Summarize the results naturally for the user. Be concise and friendly.`,
          },
        ];

    const toolConfig = tools && tools.length > 0
      ? this.convertToolsToBedrockFormat(tools)
      : undefined;

    try {
      const command = new ConverseCommand({
        modelId: this.modelId,
        messages,
        system,
        toolConfig,
        inferenceConfig: {
          maxTokens: MAX_TOKENS,
          temperature: 0.7,
        },
      });

      const response = await this.client.send(command);

      const outputContent = response.output?.message?.content || [];
      let textContent = "";
      const newToolCalls: ToolCall[] = [];

      for (const block of outputContent) {
        if ("text" in block && block.text) {
          textContent += block.text;
        }
        if ("toolUse" in block && block.toolUse) {
          const toolUse = block.toolUse as ToolUseBlock;
          newToolCalls.push({
            toolUseId: toolUse.toolUseId || crypto.randomUUID(),
            toolName: toolUse.name || "unknown",
            arguments: (toolUse.input as Record<string, unknown>) || {},
          });
        }
      }

      return {
        message: textContent,
        toolCalls: newToolCalls.length > 0 ? newToolCalls : undefined,
        usage: response.usage
          ? {
              inputTokens: response.usage.inputTokens || 0,
              outputTokens: response.usage.outputTokens || 0,
            }
          : undefined,
      };
    } catch (error) {
      console.error("[BedrockService] Error:", error);
      throw new Error(
        `Bedrock API error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Simple text completion without tools
   */
  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    const response = await this.chat(prompt, [], undefined, systemPrompt);
    return response.message;
  }
}

/**
 * Format tool result for the LLM
 */
function formatToolResult(result: unknown): string {
  if (Array.isArray(result)) {
    return result
      .map((item) => {
        if (typeof item === "object" && item !== null && "text" in item) {
          return (item as { text: string }).text;
        }
        return JSON.stringify(item);
      })
      .join("\n");
  }

  if (typeof result === "string") {
    return result;
  }

  return JSON.stringify(result, null, 2);
}

// Export singleton instance
export const bedrockService = new BedrockService();

