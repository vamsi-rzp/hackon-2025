import type { Tool } from './types';

interface ToolMatch {
  tool: Tool;
  args: Record<string, unknown>;
  confidence: number;
}

// Patterns for matching user intent to tools
const toolPatterns: Record<string, { patterns: RegExp[]; argExtractor: (match: RegExpMatchArray, input: string) => Record<string, unknown> }> = {
  echo: {
    patterns: [
      /(?:say|echo|repeat|tell me)\s+["']?(.+?)["']?$/i,
      /^["'](.+)["']$/,
    ],
    argExtractor: (match) => ({ message: match[1] }),
  },
  calculator: {
    patterns: [
      /(?:what(?:'s| is)|calculate|compute)?\s*(\d+(?:\.\d+)?)\s*([\+\-\*\/x×÷]|plus|minus|times|divided by|multiplied by)\s*(\d+(?:\.\d+)?)/i,
      /(\d+(?:\.\d+)?)\s*([\+\-\*\/x×÷])\s*(\d+(?:\.\d+)?)/,
    ],
    argExtractor: (match) => {
      const opMap: Record<string, string> = {
        '+': 'add', 'plus': 'add',
        '-': 'subtract', 'minus': 'subtract',
        '*': 'multiply', 'x': 'multiply', '×': 'multiply', 'times': 'multiply', 'multiplied by': 'multiply',
        '/': 'divide', '÷': 'divide', 'divided by': 'divide',
      };
      return {
        a: parseFloat(match[1]),
        operation: opMap[match[2].toLowerCase()] || 'add',
        b: parseFloat(match[3]),
      };
    },
  },
  get_weather: {
    patterns: [
      /(?:what(?:'s| is) the )?weather (?:in|for|at) ([a-zA-Z\s]+)/i,
      /(?:how(?:'s| is) the )?weather (?:in|for|at) ([a-zA-Z\s]+)/i,
      /([a-zA-Z\s]+) weather/i,
    ],
    argExtractor: (match) => ({ city: match[1].trim() }),
  },
  random_number: {
    patterns: [
      /(?:give me a |generate a )?random (?:number|num)(?:\s+between\s+(\d+)\s+and\s+(\d+))?/i,
      /pick a number(?:\s+between\s+(\d+)\s+and\s+(\d+))?/i,
      /roll(?: a)? dice/i,
    ],
    argExtractor: (match) => ({
      min: match[1] ? parseInt(match[1]) : 1,
      max: match[2] ? parseInt(match[2]) : match[0].toLowerCase().includes('dice') ? 6 : 100,
    }),
  },
  get_time: {
    patterns: [
      /what(?:'s| is) the (?:current )?time(?:\s+in\s+([a-zA-Z_\/]+))?/i,
      /(?:current )?time(?:\s+in\s+([a-zA-Z_\/]+))?/i,
      /what time is it(?:\s+in\s+([a-zA-Z_\/]+))?/i,
    ],
    argExtractor: (match) => ({ timezone: match[1] || 'UTC' }),
  },
  text_transform: {
    patterns: [
      /(?:convert|change|make|transform)\s+["']?(.+?)["']?\s+to\s+(uppercase|lowercase)/i,
      /(?:reverse)\s+["']?(.+?)["']?/i,
      /(?:count|how many)\s+(?:characters|chars|letters|words)\s+(?:in|of)\s+["']?(.+?)["']?/i,
    ],
    argExtractor: (match, input) => {
      if (input.toLowerCase().includes('reverse')) {
        return { text: match[1], operation: 'reverse' };
      }
      if (input.toLowerCase().includes('count') || input.toLowerCase().includes('how many')) {
        return { text: match[1], operation: input.includes('word') ? 'wordcount' : 'length' };
      }
      return { text: match[1], operation: match[2]?.toLowerCase() || 'uppercase' };
    },
  },
  generate_uuid: {
    patterns: [
      /(?:generate|create|give me)\s+(?:a\s+)?(?:(\d+)\s+)?uuid/i,
      /(?:new\s+)?uuid/i,
    ],
    argExtractor: (match) => ({ count: match[1] ? parseInt(match[1]) : 1 }),
  },
  greet: {
    patterns: [
      /(?:greet|say (?:hi|hello) to)\s+([a-zA-Z]+)(?:\s+(?:in a |)(formal|casual|enthusiastic)(?:\s+(?:way|style|manner))?)?/i,
      /(?:formal|casual|enthusiastic)\s+greeting\s+(?:for|to)\s+([a-zA-Z]+)/i,
    ],
    argExtractor: (match, input) => {
      const styles = ['formal', 'casual', 'enthusiastic'];
      const style = styles.find(s => input.toLowerCase().includes(s)) || 'casual';
      return { name: match[1], style };
    },
  },
};

export function matchTool(input: string, availableTools: Tool[]): ToolMatch | null {
  const availableToolNames = new Set(availableTools.map(t => t.name));
  
  for (const [toolName, { patterns, argExtractor }] of Object.entries(toolPatterns)) {
    if (!availableToolNames.has(toolName)) continue;
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        const tool = availableTools.find(t => t.name === toolName)!;
        return {
          tool,
          args: argExtractor(match, input),
          confidence: 0.9,
        };
      }
    }
  }
  
  return null;
}

export function generateBotResponse(toolName: string, result: unknown): string {
  const text = extractText(result);
  
  const responses: Record<string, (text: string) => string> = {
    echo: (t) => `📢 ${t}`,
    calculator: (t) => `🧮 ${t}`,
    get_weather: (t) => `🌤️ Here's the weather info:\n\n${t}`,
    random_number: (t) => `🎲 ${t}`,
    get_time: (t) => `⏰ ${t}`,
    text_transform: (t) => `✨ Result: ${t}`,
    generate_uuid: (t) => `🔑 Here's your UUID:\n\`${t}\``,
    greet: (t) => t,
  };
  
  return responses[toolName]?.(text) || text;
}

function extractText(result: unknown): string {
  if (Array.isArray(result)) {
    return result.map(item => {
      if (typeof item === 'object' && item !== null && 'text' in item) {
        return (item as { text: string }).text;
      }
      return JSON.stringify(item);
    }).join('\n');
  }
  if (typeof result === 'string') return result;
  return JSON.stringify(result, null, 2);
}

export function getSuggestions(tools: Tool[]): string[] {
  const suggestions: string[] = [];
  
  if (tools.find(t => t.name === 'get_weather')) {
    suggestions.push("What's the weather in Tokyo?");
  }
  if (tools.find(t => t.name === 'calculator')) {
    suggestions.push("Calculate 42 * 17");
  }
  if (tools.find(t => t.name === 'greet')) {
    suggestions.push("Greet John in an enthusiastic way");
  }
  if (tools.find(t => t.name === 'random_number')) {
    suggestions.push("Roll a dice");
  }
  if (tools.find(t => t.name === 'get_time')) {
    suggestions.push("What time is it in America/New_York?");
  }
  
  return suggestions;
}

