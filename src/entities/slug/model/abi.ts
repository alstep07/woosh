export const SLUG_REGISTRY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "slug", type: "string" }],
    outputs: [],
  },
  {
    name: "registerFor",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "owner", type: "address" }, { name: "slug", type: "string" }],
    outputs: [],
  },
  {
    name: "isAvailable",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "slug", type: "string" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "slugToAddress",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "string" }],
    outputs: [{ type: "address" }],
  },
  {
    name: "addressToSlug",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "string" }],
  },
] as const;
