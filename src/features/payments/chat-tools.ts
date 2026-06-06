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
