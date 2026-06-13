export const INVOICE_REGISTRY_ABI = [
  {
    name: "create",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "salt", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "memo", type: "string" },
    ],
    outputs: [{ name: "id", type: "bytes32" }],
  },
  {
    name: "pay",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "invoiceId",
    type: "function",
    stateMutability: "pure",
    inputs: [
      { name: "creator", type: "address" },
      { name: "salt", type: "uint256" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    name: "getInvoice",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      { name: "payee", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "paid", type: "bool" },
      { name: "payer", type: "address" },
      { name: "memo", type: "string" },
      { name: "createdAt", type: "uint64" },
    ],
  },
  {
    name: "getInvoiceIds",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "creator", type: "address" }],
    outputs: [{ type: "bytes32[]" }],
  },
  {
    type: "event",
    name: "InvoiceCreated",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "payee", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "memo", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "InvoicePaid",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "payee", type: "address", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
