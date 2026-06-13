export const INVOICE_REGISTRY_ABI = [
  {
    name: "paid",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "invoiceId",
    type: "function",
    stateMutability: "pure",
    inputs: [
      { name: "payee", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    name: "pay",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "payee", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "InvoicePaid",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "payee", type: "address", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "nonce", type: "uint256", indexed: false },
    ],
  },
] as const;
