// Mirrors WooshSavingsVault.sol. Balance model: token address(0) = native USDC,
// tracked in 18-dec wei (msg.value units); any other token is its own ERC-20 units
// (EURC 6-dec, cirBTC 8-dec). getSweepRule returns the owner's auto-sweep rule, one
// tuple keyed by the component names below.
const SWEEP_RULE_COMPONENTS = [
  { name: "threshold", type: "uint256" },
  { name: "capPerRun", type: "uint256" },
  { name: "intervalSeconds", type: "uint64" },
  { name: "nextRunAt", type: "uint64" },
  { name: "enabled", type: "bool" },
] as const;

export const SAVINGS_VAULT_ABI = [
  {
    name: "balances",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getBalances",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "tokens", type: "address[]" },
    ],
    outputs: [{ type: "uint256[]" }],
  },
  {
    name: "getSweepRule",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "tuple", components: SWEEP_RULE_COMPONENTS }],
  },
  {
    name: "deposit",
    type: "function",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "Deposited",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "newBalance", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "newBalance", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Credited",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "newBalance", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SweepRuleSet",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "threshold", type: "uint256", indexed: false },
      { name: "capPerRun", type: "uint256", indexed: false },
      { name: "intervalSeconds", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SweepRuleDisabled",
    inputs: [{ name: "owner", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "Swept",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "newBalance", type: "uint256", indexed: false },
      { name: "nextRunAt", type: "uint64", indexed: false },
    ],
  },
] as const;
