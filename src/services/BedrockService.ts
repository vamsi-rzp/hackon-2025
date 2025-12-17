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
import { config, type PromptConfig } from "../config/index.js";

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
 * Options for customizing LLM behavior
 */
export interface ChatOptions {
  /** Custom system prompt (overrides default) */
  systemPrompt?: string;
  /** Custom prompt for processing tool results */
  toolResultPrompt?: string;
  /** Temperature for response generation (0-1) */
  temperature?: number;
  /** Maximum tokens in response */
  maxTokens?: number;
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
    this.modelId = modelId || config.bedrock.modelId;
    this.client = new BedrockRuntimeClient({
      region: region || config.bedrock.region,
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
    options: ChatOptions = {}
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

    // Use custom prompt or default from config
    const systemPrompt = options.systemPrompt ?? config.prompts.systemPrompt;
    const system = [{ text: systemPrompt }];

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
          maxTokens: options.maxTokens ?? config.bedrock.maxTokens,
          temperature: options.temperature ?? 0.7,
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
    options: ChatOptions = {}
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

    // Use custom tool result prompt or default from config
    const toolResultPrompt = options.toolResultPrompt ?? config.prompts.toolResultPrompt;
    const system = [{ text: toolResultPrompt }];

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
          maxTokens: options.maxTokens ?? config.bedrock.maxTokens,
          temperature: options.temperature ?? 0.7,
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
  async complete(prompt: string, options: ChatOptions = {}): Promise<string> {
    // Use standalone prompt if no custom prompt provided
    const finalOptions = {
      ...options,
      systemPrompt: options.systemPrompt ?? config.prompts.standalonePrompt,
    };
    const response = await this.chat(prompt, [], undefined, finalOptions);
    return response.message;
  }

  /**
   * Get the current prompt configuration
   */
  getPromptConfig(): typeof config.prompts {
    return config.prompts;
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

