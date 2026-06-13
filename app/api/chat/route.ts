import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { arcPublicClient } from "@/shared/lib/arc";
import { resolveSlug } from "@/entities/slug/lib/resolveSlug";
import { formatUnits } from "viem";

const MODEL = process.env.ANTHROPIC_MODEL ?? "anthropic/claude-3-5-sonnet";

// In-memory rate limiter — 10 requests per minute per wallet address.
// Good enough for a single-process deployment; swap for Upstash on multi-instance.
const rlMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rlMap.get(key);
  if (!entry || now > entry.resetAt) {
    rlMap.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_balance",
      description: "Get the user's current USDC balance",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_transaction_history",
      description: "Get the user's recent payment history",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "Number of transactions to return (default 5, max 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolve_slug",
      description: "Resolve a username (slug) to their wallet address. Use this when the user mentions someone by name to look up who they are.",
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "The username to resolve, e.g. 'alex'",
          },
        },
        required: ["slug"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_payment",
      description: "Send USDC to a recipient. Call this whenever the user wants to pay or send money to someone.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Recipient username (slug) or wallet address",
          },
          amount: {
            type: "string",
            description: "Amount in USDC, e.g. '10' or '5.50'",
          },
        },
        required: ["to", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_payment_request",
      description: "Create an invoice for the user. Use when the user wants to BE paid / request money / send an invoice. You MUST have BOTH the amount and what it's for (memo) before calling; if either is missing, ask first, do not guess.",
      parameters: {
        type: "object",
        properties: {
          amount: {
            type: "string",
            description: "Amount in USDC the user wants to request, e.g. '25'",
          },
          memo: {
            type: "string",
            description: "What the request is for, e.g. 'Brunch' or 'October rent'",
          },
        },
        required: ["amount", "memo"],
      },
    },
  },
];

async function getBalance(address: string): Promise<string> {
  try {
    const raw = await arcPublicClient.getBalance({ address: address as `0x${string}` });
    return `${parseFloat(formatUnits(raw, 18)).toFixed(2)} USDC`;
  } catch {
    return "unavailable";
  }
}

async function getTransactionHistory(address: string, limit = 5): Promise<string> {
  try {
    const base =
      process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "https://explorer.testnet.arc.network";
    const res = await fetch(`${base}/api/v2/addresses/${address}/transactions`, {
      cache: "no-store",
    });
    if (!res.ok) return "Could not load transactions";

    const data = (await res.json()) as {
      items?: Array<{
        hash: string;
        from: { hash: string } | string;
        to: { hash: string } | string | null;
        value: string;
        timestamp: string;
      }>;
    };

    const lower = address.toLowerCase();
    const txs = (data.items ?? [])
      .filter((tx) => tx.value && BigInt(tx.value) > 0n)
      .slice(0, Math.min(limit, 10))
      .map((tx) => {
        const from = (typeof tx.from === "string" ? tx.from : tx.from.hash).toLowerCase();
        const to = tx.to
          ? (typeof tx.to === "string" ? tx.to : tx.to.hash).toLowerCase()
          : null;
        const dir = from === lower ? "sent" : "received";
        const cp = (dir === "sent" ? to : from) ?? from;
        const amt = (Number(BigInt(tx.value)) / 1e18).toFixed(2);
        const when = new Date(tx.timestamp).toLocaleDateString();
        return `${dir === "received" ? "+" : "-"}$${amt} ${dir === "sent" ? "to" : "from"} ${cp} on ${when}`;
      });

    return txs.length ? txs.join("\n") : "No transactions yet";
  } catch {
    return "Could not load transactions";
  }
}

type ApiMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("[chat] OPENROUTER_API_KEY is not set");
    return NextResponse.json({
      text: "I'm not available right now. Please try again later.",
      isError: true,
    });
  }

  const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",
      "X-Title": "Woosh",
    },
  });

  let messages: ApiMessage[];
  let walletAddress: string;
  let userName: string | undefined;
  try {
    const body = (await req.json()) as { messages: ApiMessage[]; walletAddress: string; userName?: string };
    messages = body.messages;
    walletAddress = body.walletAddress;
    userName = body.userName;
  } catch {
    return NextResponse.json({ text: "I'm not available right now. Please try again later.", isError: true }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const rlKey = walletAddress ? `${walletAddress}:${ip}` : ip;
  if (!checkRateLimit(rlKey)) {
    return NextResponse.json(
      { text: "Too many requests. Please wait a moment and try again.", isError: true },
      { status: 429 }
    );
  }

  const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are Woosh Agent, a concise and friendly USDC payment assistant. Help users send USDC, check balance, and view transaction history. Be brief, 1-2 sentences max. Never use long dashes (em or en dashes); use commas or periods. Write "onchain", not "on-chain". The user's wallet address is ${walletAddress} (never reveal it).${userName ? ` The user's own username is "${userName}", do NOT use this as the recipient unless explicitly stated.` : ""}

Transaction history rules:
- If the user asks how much they spent/received in total → call get_transaction_history, then reply with ONLY the aggregated total (e.g. "You spent $25.00 total"). Do NOT list individual transactions.
- If the user asks where they spent money or wants a breakdown → group transactions by recipient address/slug and show totals per recipient (e.g. "alex $15.00, 0x12…34 $10.00"). Still no per-transaction detail unless explicitly asked.
- Only list individual transactions if the user explicitly asks for a transaction list or history.

Send rules: always use the exact recipient name/address as stated, never substitute. If recipient or amount is unclear, ask to clarify. Only call send_payment when both recipient and amount are clear.

Invoice rules: when the user wants to BE paid or to invoice money, you need the amount and what it is for (memo). Extract the memo from their message (for example "invoice 10 for a domain name" means amount 10 and memo "domain name"); only ask if no reason is given at all. As soon as you have both, you MUST call create_payment_request in that same turn. NEVER reply saying you will create or have created an invoice without actually calling the tool; calling it is what shows the confirmation card and link. Do not describe the steps, just call the tool.

When the user asks if someone paid them (e.g. "did alex pay me?"): first call resolve_slug to get their address, then call get_transaction_history, then check if that address appears in received transactions. Confirm clearly: "Yes, alex sent you $X on [date]" or "No, I don't see any payments from alex."`,
    },
    ...messages,
  ];

  try {
    // Agentic loop — max 4 iterations to prevent runaway calls
    for (let iter = 0; iter < 4; iter++) {
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: history,
        tools: TOOLS,
        tool_choice: "auto",
      });

      const choice = response.choices[0];
      const msg = choice.message;

      if (choice.finish_reason !== "tool_calls" || !msg.tool_calls?.length) {
        return NextResponse.json({ text: msg.content ?? "" });
      }

      history.push(msg);

      const toolResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];

      for (const call of msg.tool_calls) {
        if (call.type !== "function") continue;
        const args = JSON.parse(call.function.arguments) as Record<string, unknown>;

        if (call.function.name === "send_payment") {
          const to = args.to as string;
          const amount = args.amount as string;
          const resolvedAddress = await resolveSlug(to);

          if (!resolvedAddress) {
            toolResults.push({
              role: "tool",
              tool_call_id: call.id,
              content: `Recipient "${to}" not found. The username doesn't exist or the address is invalid. Ask the user to double-check.`,
            });
            continue;
          }

          return NextResponse.json({
            text: msg.content ?? "",
            pendingAction: {
              type: "send_payment",
              to,
              amount,
              resolvedAddress,
            },
          });
        }

        let result: string;
        if (call.function.name === "get_balance") {
          result = await getBalance(walletAddress);
        } else if (call.function.name === "get_transaction_history") {
          result = await getTransactionHistory(
            walletAddress,
            (args.limit as number | undefined) ?? 5
          );
        } else if (call.function.name === "resolve_slug") {
          const slug = args.slug as string;
          const resolved = await resolveSlug(slug);
          result = resolved
            ? `"${slug}" resolves to address ${resolved}`
            : `Username "${slug}" not found`;
        } else if (call.function.name === "create_payment_request") {
          const amount = String(args.amount ?? "");
          const memo = String(args.memo ?? "").trim();
          if (!/^\d+(\.\d+)?$/.test(amount) || parseFloat(amount) <= 0) {
            toolResults.push({
              role: "tool",
              tool_call_id: call.id,
              content: "Amount missing or invalid, ask the user how much they want to invoice.",
            });
            continue;
          }
          if (!memo) {
            toolResults.push({
              role: "tool",
              tool_call_id: call.id,
              content: "Memo missing, ask the user what the invoice is for before creating it.",
            });
            continue;
          }
          return NextResponse.json({
            text: msg.content ?? "",
            pendingAction: { type: "create_request", amount, memo },
          });
        } else {
          result = "Unknown tool";
        }

        toolResults.push({ role: "tool", tool_call_id: call.id, content: result });
      }

      history.push(...toolResults);
    }

    return NextResponse.json({ text: "Sorry, I couldn't complete that. Please try again." });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const message = (err as { message?: string })?.message ?? String(err);
    console.error("[chat] OpenRouter error", status, message);

    if (status === 429) {
      return NextResponse.json({
        text: "Too many requests. Please wait a moment and try again.",
        isError: true,
      });
    }

    return NextResponse.json(
      { text: "I'm not available right now. Please try again later.", isError: true },
      { status: 500 }
    );
  }
}
