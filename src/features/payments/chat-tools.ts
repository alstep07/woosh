// Registers payment tool examples for the chat typewriter placeholder.
// In V2: extend this file with full tool definitions (definition, buildSummary, execute).
import { registerToolExamples } from "@/features/chat/model/registry";

registerToolExamples("send_payment", [
  "send 5 usdc to alex",
  "pay 10 to bob",
]);

registerToolExamples("get_balance", [
  "what's my balance?",
]);

registerToolExamples("get_transaction_history", [
  "did alex pay me?",
  "how much did I spend today?",
  "show recent payments",
]);

registerToolExamples("create_payment_request", [
  "invoice 10 for a domain name",
  "request 25 for design work",
]);

registerToolExamples("create_strategy", [
  "buy 10 usdc of cirBTC every week",
  "pay alex 50 usdc monthly",
  "auto-buy EURC with 5 usdc daily",
  "keep 50% usdc, 30% bitcoin, 20% euro",
  "invest everything above 100 usdc weekly",
]);

registerToolExamples("get_strategies", [
  "what strategies do I have?",
  "is my DCA still running?",
]);

registerToolExamples("swap", [
  "swap 5 usdc for cirBTC",
  "buy EURC with 10 usdc",
  "sell my EURC back to usdc",
  "exchange 2 usdc for bitcoin",
]);
