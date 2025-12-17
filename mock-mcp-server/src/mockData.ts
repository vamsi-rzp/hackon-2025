/**
 * Mock data for the Payment Rules Testing MCP Server
 * Based on sample responses from tool_responses.json
 */

export interface RuleExpression {
  type: "logical" | "comparator" | "variable" | "string";
  value: string;
  operands?: RuleExpression[];
}

export interface Rule {
  id: string;
  name: string;
  expression: RuleExpression;
  score: number;
}

export interface RuleGroup {
  id: string;
  name: string;
  description: string;
  precondition: RuleExpression;
  rules: Rule[];
}

export interface TestCase {
  id: string;
  parameters: Record<string, string>;
  rule_group_id: string;
  rule_id: string;
  provider_id?: string;
  expected_gateway?: string;
}

export const mockData = {
  // Merchant rules based on tool_responses.json
  merchantRules: [
    {
      id: "rg_123456",
      name: "Card Payment Rules",
      description: "Rules for card-based payments",
      precondition: {
        type: "logical",
        value: "AND",
        operands: [
          {
            type: "comparator",
            value: "==",
            operands: [
              {
                type: "variable",
                value: "$payment.navigator_method",
              },
              {
                type: "string",
                value: "card",
              },
            ],
          },
        ],
      },
      rules: [
        {
          id: "rule_001",
          name: "Debit Card Rule",
          expression: {
            type: "logical",
            value: "AND",
            operands: [
              {
                type: "comparator",
                value: "==",
                operands: [
                  {
                    type: "variable",
                    value: "$payment.navigator_card_type",
                  },
                  {
                    type: "string",
                    value: "debit",
                  },
                ],
              },
              {
                type: "comparator",
                value: "==",
                operands: [
                  {
                    type: "variable",
                    value: "$provider.id",
                  },
                  {
                    type: "string",
                    value: "provider_debit_001",
                  },
                ],
              },
            ],
          },
          score: 100,
        },
        {
          id: "rule_002",
          name: "Credit Card Rule",
          expression: {
            type: "logical",
            value: "AND",
            operands: [
              {
                type: "comparator",
                value: "==",
                operands: [
                  {
                    type: "variable",
                    value: "$payment.navigator_card_type",
                  },
                  {
                    type: "string",
                    value: "credit",
                  },
                ],
              },
              {
                type: "comparator",
                value: "==",
                operands: [
                  {
                    type: "variable",
                    value: "$provider.id",
                  },
                  {
                    type: "string",
                    value: "provider_credit_001",
                  },
                ],
              },
            ],
          },
          score: 95,
        },
      ],
    },
    {
      id: "rg_789012",
      name: "UPI Payment Rules",
      description: "Rules for UPI-based payments",
      precondition: {
        type: "comparator",
        value: "==",
        operands: [
          {
            type: "variable",
            value: "$payment.navigator_method",
          },
          {
            type: "string",
            value: "upi_intent",
          },
        ],
      },
      rules: [
        {
          id: "rule_003",
          name: "UPI Intent Rule",
          expression: {
            type: "comparator",
            value: "==",
            operands: [
              {
                type: "variable",
                value: "$provider.id",
              },
              {
                type: "string",
                value: "provider_upi_001",
              },
            ],
          },
          score: 90,
        },
      ],
    },
    {
      id: "rg_345678",
      name: "Netbanking Payment Rules",
      description: "Rules for netbanking payments",
      precondition: {
        type: "comparator",
        value: "==",
        operands: [
          {
            type: "variable",
            value: "$payment.navigator_method",
          },
          {
            type: "string",
            value: "netbanking",
          },
        ],
      },
      rules: [
        {
          id: "rule_004",
          name: "Netbanking Default Rule",
          expression: {
            type: "comparator",
            value: "==",
            operands: [
              {
                type: "variable",
                value: "$provider.id",
              },
              {
                type: "string",
                value: "provider_nb_001",
              },
            ],
          },
          score: 85,
        },
      ],
    },
    {
      id: "rg_901234",
      name: "Wallet Payment Rules",
      description: "Rules for wallet-based payments",
      precondition: {
        type: "comparator",
        value: "==",
        operands: [
          {
            type: "variable",
            value: "$payment.navigator_method",
          },
          {
            type: "string",
            value: "wallet",
          },
        ],
      },
      rules: [
        {
          id: "rule_005",
          name: "Wallet Default Rule",
          expression: {
            type: "comparator",
            value: "==",
            operands: [
              {
                type: "variable",
                value: "$provider.id",
              },
              {
                type: "string",
                value: "provider_wallet_001",
              },
            ],
          },
          score: 80,
        },
      ],
    },
  ] as RuleGroup[],

  // Sample test cases based on tool_responses.json
  testCases: [
    {
      id: "rg_123456_0",
      parameters: {
        "$payment.navigator_method": "card",
        "$payment.navigator_card_type": "debit",
        "$payment.optimizer_currency": "INR",
        "$payment.navigator_amount": "1000",
      },
      rule_group_id: "rg_123456",
      rule_id: "rule_001",
      provider_id: "provider_debit_001",
      expected_gateway: "provider_debit_001",
    },
    {
      id: "rg_123456_1",
      parameters: {
        "$payment.navigator_method": "card",
        "$payment.navigator_card_type": "credit",
        "$payment.optimizer_currency": "INR",
        "$payment.navigator_amount": "1000",
      },
      rule_group_id: "rg_123456",
      rule_id: "rule_002",
      provider_id: "provider_credit_001",
      expected_gateway: "provider_credit_001",
    },
    {
      id: "rg_123456_2",
      parameters: {
        "$payment.navigator_method": "card",
        "$payment.navigator_card_type": "debit",
        "$payment.optimizer_currency": "USD",
        "$payment.navigator_amount": "5000",
      },
      rule_group_id: "rg_123456",
      rule_id: "rule_001",
      provider_id: "provider_debit_001",
      expected_gateway: "provider_debit_001",
    },
    {
      id: "rg_789012_0",
      parameters: {
        "$payment.navigator_method": "upi_intent",
        "$payment.optimizer_currency": "INR",
        "$payment.navigator_amount": "2000",
      },
      rule_group_id: "rg_789012",
      rule_id: "rule_003",
      provider_id: "provider_upi_001",
      expected_gateway: "provider_upi_001",
    },
    {
      id: "rg_345678_0",
      parameters: {
        "$payment.navigator_method": "netbanking",
        "$payment.navigator_bank": "HDFC",
        "$payment.optimizer_currency": "INR",
        "$payment.navigator_amount": "10000",
      },
      rule_group_id: "rg_345678",
      rule_id: "rule_004",
      provider_id: "provider_nb_001",
      expected_gateway: "provider_nb_001",
    },
    {
      id: "rg_901234_0",
      parameters: {
        "$payment.navigator_method": "wallet",
        "$payment.navigator_wallet": "paytm",
        "$payment.optimizer_currency": "INR",
        "$payment.navigator_amount": "500",
      },
      rule_group_id: "rg_901234",
      rule_id: "rule_005",
      provider_id: "provider_wallet_001",
      expected_gateway: "provider_wallet_001",
    },
  ] as TestCase[],
};

