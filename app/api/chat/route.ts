import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { arcPublicClient } from "@/shared/lib/arc";
import { resolveSlug } from "@/entities/slug/lib/resolveSlug";
import { getMyInvoices } from "@/entities/invoice/lib/readInvoice";
import { getMyStrategies } from "@/entities/strategy/lib/readStrategy";
import { strategySummary, statusBadge } from "@/entities/strategy/lib/format";
import { getVaultHoldings } from "@/entities/savings/lib/readVault";
import { EURC, CIRBTC, tokenByAddress } from "@/shared/lib/tokens";
import { env } from "@/shared/config/env";
import { erc20Abi, formatUnits } from "viem";

const INTERVAL_SECONDS: Record<string, number> = {
  daily: 86_400,
  weekly: 604_800,
  monthly: 2_592_000,
};

// Normalize a user-facing token name to a canonical symbol. Users say "bitcoin",
// "BTC" or "euro"; the model sometimes passes those through despite the enum.
function normalizeTokenSymbol(symbol: string): "EURC" | "cirBTC" | null {
  const s = symbol.trim().toLowerCase();
  if (s === "eurc" || s === "eur" || s === "euro" || s === "euros") return "EURC";
  if (s === "cirbtc" || s === "btc" || s === "bitcoin" || s === "wbtc" || s === "xbt") return "cirBTC";
  return null;
}

function resolveTokenOut(symbol: string): `0x${string}` | null {
  const sym = normalizeTokenSymbol(symbol);
  if (sym === "EURC") return EURC.address;
  if (sym === "cirBTC") return CIRBTC.address ?? null;
  return null;
}

const MODEL = process.env.ANTHROPIC_MODEL ?? "anthropic/claude-sonnet-5";

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
      description: "Get the user's current token balances: USDC, plus EURC and cirBTC if they hold any. Use for any 'how much do I have' question, including 'how much bitcoin do I own' (cirBTC is Bitcoin on Arc).",
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
      name: "get_invoices",
      description: "Get the invoices (payment requests) the user has created, with amount, what each is for, paid/unpaid status and creation date. Use to answer questions like 'do I have unpaid invoices?', 'what did I invoice this month?', or 'how much is owed to me?'.",
      parameters: { type: "object", properties: {}, required: [] },
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
  {
    type: "function",
    function: {
      name: "swap",
      description:
        "Swap (convert/exchange) between USDC and another token, right now as a one-off (NOT a recurring DCA). Use for 'swap 10 USDC to EURC', 'buy bitcoin for 5 USDC', 'convert 5 USDC into cirBTC', 'sell my cirBTC for USDC', 'change euros back to USDC'. IMPORTANT: 'bitcoin' or 'BTC' means cirBTC (Bitcoin on Arc); 'euro' or 'EUR' means EURC. Buying bitcoin IS supported, call this tool with token cirBTC. action 'buy' = spend USDC to get the token; 'sell' = sell the token to get USDC. The amount is always the token you are paying WITH (USDC for buy, the token for sell). You MUST have action, token and amount; if any is missing, ask.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["buy", "sell"],
            description: "'buy' = USDC -> token; 'sell' = token -> USDC",
          },
          token: {
            type: "string",
            enum: ["EURC", "cirBTC"],
            description: "the non-USDC token being bought or sold",
          },
          amount: {
            type: "string",
            description: "amount of the token you pay WITH (USDC for buy, the token for sell), e.g. '10'",
          },
        },
        required: ["action", "token", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_strategies",
      description: "Get the user's automated strategies (recurring payments and DCA auto-buys) with what each does, status, balance left, and next run. Use for 'what strategies do I have?', 'is my DCA running?', 'how much is left in my auto-buy?'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_savings",
      description: "Get the user's savings vault balances (USDC, EURC, cirBTC held in the vault, separate from their spendable wallet balance) and their auto-sweep rule if one is set. Use for 'how much do I have saved?', 'what's in my vault?', 'is auto-save on?'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "create_strategy",
      description:
        "Set up an automated strategy: a recurring USDC payment, a DCA auto-buy of another token with USDC, or target allocation automation (legacy portfolio: keep a target percent allocation across USDC/EURC/cirBTC, e.g. '50% USDC, 30% bitcoin, 20% euro'). This is NOT the savings vault, do not use it when the user just wants to save or deposit money, guide them to /dashboard/savings for that instead. Runs onchain on its schedule after a one-time setup the user confirms with their PIN. You MUST have all required fields before calling; if any is missing, ask first, do not guess. For 'funding' (total to deposit): if the user gives a number of runs, you may compute funding = amountPerPeriod x runs; otherwise ask how much to deposit. Portfolios in 'sweep' mode need NO funding (they allocate the wallet balance above sweepThreshold each run).",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["payment", "swap", "portfolio"],
            description: "'payment' = recurring payment to someone, 'swap' = DCA auto-buy of one token, 'portfolio' = target allocation automation (legacy, keep a percent allocation across tokens); do not use 'portfolio' when the user just wants to save money, that is the savings vault, not this tool",
          },
          recipient: {
            type: "string",
            description: "payment only: the username or 0x address to pay each period",
          },
          token: {
            type: "string",
            enum: ["EURC", "cirBTC"],
            description: "swap only: which token to buy with USDC. 'bitcoin'/'BTC' means cirBTC, 'euro'/'EUR' means EURC.",
          },
          allocation: {
            type: "object",
            description: "portfolio only: target percent per token, integers summing to 100, e.g. {\"USDC\": 50, \"cirBTC\": 30, \"EURC\": 20}. bitcoin/BTC means cirBTC, euro/EUR means EURC.",
            properties: {
              USDC: { type: "integer" },
              EURC: { type: "integer" },
              cirBTC: { type: "integer" },
            },
          },
          mode: {
            type: "string",
            enum: ["deposit", "sweep"],
            description: "portfolio only: 'deposit' allocates a fixed amount per run from a deposited budget; 'sweep' allocates whatever the wallet holds above sweepThreshold (no deposit needed)",
          },
          sweepThreshold: {
            type: "string",
            description: "portfolio sweep only: USDC amount to always keep in the wallet, e.g. '100'",
          },
          amountPerPeriod: {
            type: "string",
            description: "USDC spent/sent each run (for portfolio sweep: the max per run), e.g. '10'",
          },
          interval: {
            type: "string",
            enum: ["daily", "weekly", "monthly"],
            description: "how often it runs",
          },
          periods: {
            type: "integer",
            description: "number of runs; omit for open-ended (until funds run out)",
          },
          funding: {
            type: "string",
            description: "total USDC to deposit now; must be >= amountPerPeriod. NOT needed for portfolio sweep mode.",
          },
        },
        required: ["kind", "amountPerPeriod", "interval"],
      },
    },
  },
];

async function getBalance(address: string): Promise<string> {
  try {
    const raw = await arcPublicClient.getBalance({ address: address as `0x${string}` });
    const lines = [`${parseFloat(formatUnits(raw, 18)).toFixed(2)} USDC`];
    for (const t of [EURC, CIRBTC]) {
      if (!t.address) continue;
      try {
        const bal = await arcPublicClient.readContract({
          address: t.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address as `0x${string}`],
        });
        if (bal > 0n) lines.push(`${formatUnits(bal, t.decimals)} ${t.symbol}`);
      } catch {}
    }
    return lines.join(", ");
  } catch {
    return "unavailable";
  }
}

async function getTransactionHistory(address: string, limit = 5): Promise<string> {
  try {
    const base = env.arcExplorerUrl;
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

async function getInvoicesSummary(address: string): Promise<string> {
  try {
    const list = (await getMyInvoices(address as `0x${string}`)).slice(0, 40);
    if (list.length === 0) return "No invoices created yet.";
    return list
      .map((inv) => {
        const date = inv.createdAt ? new Date(inv.createdAt * 1000).toISOString().slice(0, 10) : "unknown date";
        return `${inv.paid ? "PAID" : "UNPAID"} $${parseFloat(inv.amount).toFixed(2)}${inv.memo ? ` for "${inv.memo}"` : ""}, created ${date}`;
      })
      .join("\n");
  } catch {
    return "Could not load invoices.";
  }
}

async function getStrategiesSummary(address: string): Promise<string> {
  try {
    const list = (await getMyStrategies(address as `0x${string}`)).slice(0, 40);
    if (list.length === 0) return "No strategies set up yet.";
    const legSymbol = (token: `0x${string}` | null) =>
      token === null ? "USDC" : tokenByAddress(token)?.symbol ?? "token";
    return list
      .map((s) => {
        const symbol = s.kind === "swap" ? tokenByAddress(s.tokenOut)?.symbol : undefined;
        const isSweep = s.kind === "portfolio" && s.portfolio?.mode === "sweep";
        const budget = isSweep
          ? `keeps ${s.portfolio?.sweepThreshold ?? "0"} USDC in the wallet`
          : `${s.balance} USDC left`;
        return `${statusBadge(s.status).text.toUpperCase()}: ${strategySummary(s, symbol, legSymbol)}, ${budget}${
          s.periodsTotal > 0 ? ` (${s.periodsDone}/${s.periodsTotal} runs)` : ` (${s.periodsDone} runs done)`
        }`;
      })
      .join("\n");
  } catch {
    return "Could not load strategies.";
  }
}

async function getSavingsSummary(address: string): Promise<string> {
  try {
    const vault = await getVaultHoldings(address as `0x${string}`);
    const lines: string[] = [];
    if (parseFloat(vault.usdc) > 0) lines.push(`${vault.usdc} USDC`);
    if (parseFloat(vault.eurc) > 0) lines.push(`${vault.eurc} EURC`);
    if (parseFloat(vault.cirbtc) > 0) lines.push(`${vault.cirbtc} cirBTC`);
    const balanceLine = lines.length ? `Vault holds ${lines.join(", ")}.` : "The vault is empty, nothing saved yet.";
    const ruleLine = vault.sweepRule.enabled
      ? `Auto-save is on: sweeps excess over ${vault.sweepRule.threshold} USDC in the wallet, up to ${vault.sweepRule.capPerRun} USDC per run.`
      : "Auto-save is off.";
    return `${balanceLine} ${ruleLine}`;
  } catch {
    return "Could not load savings vault.";
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
      content: `You are Woosh Agent, a concise and friendly USDC payment assistant. Help users send USDC, check balances, view transaction history, swap tokens, create invoices and set up automated strategies. Be brief, 1-2 sentences max. Never use long dashes (em or en dashes); use commas or periods. Write "onchain", not "on-chain". The user's wallet address is ${walletAddress} (never reveal it).${userName ? ` The user's own username is "${userName}", do NOT use this as the recipient unless explicitly stated.` : ""}

Tokens on Arc: USDC (the main currency, also pays gas), EURC (Circle's euro stablecoin) and cirBTC (Bitcoin on Arc). When the user says "bitcoin", "BTC" or "биткоин", they mean cirBTC; when they say "euro" or "EUR", they mean EURC. Buying bitcoin IS supported: it is a swap of USDC into cirBTC (or a DCA strategy if recurring). Never tell the user you cannot buy bitcoin, just do the swap. Understand intent generously: "invest in bitcoin", "get some BTC", "у меня есть биткоин?" all map to the tools you have.

Conversation rules: always act on the user's LATEST message; earlier messages are context only. Assistant messages may end with a bracketed status note like [The user cancelled this action] or [Action completed successfully]; treat these notes as ground truth about what already happened. Never re-propose or repeat an action that was completed or cancelled unless the user explicitly asks again. If the user changes topic, drop the old topic entirely.

Transaction history rules:
- If the user asks how much they spent/received in total → call get_transaction_history, then reply with ONLY the aggregated total (e.g. "You spent $25.00 total"). Do NOT list individual transactions.
- If the user asks where they spent money or wants a breakdown → group transactions by recipient address/slug and show totals per recipient (e.g. "alex $15.00, 0x12…34 $10.00"). Still no per-transaction detail unless explicitly asked.
- Only list individual transactions if the user explicitly asks for a transaction list or history.

Send rules: always use the exact recipient name/address as stated, never substitute. If recipient or amount is unclear, ask to clarify. Only call send_payment when both recipient and amount are clear.

Invoice questions: when the user asks about their invoices (unpaid ones, total owed to them, what they invoiced this month or on some date, etc.), call get_invoices and answer concisely from the data. Aggregate when asked (for example total of all UNPAID). Do not list every invoice unless the user asks for a list.

Invoice rules: when the user wants to BE paid or to invoice money, you need the amount and what it is for (memo). Extract the memo from their message (for example "invoice 10 for a domain name" means amount 10 and memo "domain name"); only ask if no reason is given at all. As soon as you have both, you MUST call create_payment_request in that same turn. NEVER reply saying you will create or have created an invoice without actually calling the tool; calling it is what shows the confirmation card and link. Do not describe the steps, just call the tool.

When the user asks if someone paid them (e.g. "did alex pay me?"): first call resolve_slug to get their address, then call get_transaction_history, then check if that address appears in received transactions. Confirm clearly: "Yes, alex sent you $X on [date]" or "No, I don't see any payments from alex."

"Savings" means ONLY the savings vault at /dashboard/savings (see below); it is separate from the spendable wallet balance. When the user wants to save, put money aside, or deposit into savings ("положи 50 в сбережения", "put 50 into savings", "keep 30% of my money in bitcoin" meaning save it), guide them to /dashboard/savings to deposit, do NOT call create_strategy for this. There is no chat action to deposit or withdraw from the vault yet.

Strategies (automation): users can set up recurring USDC payments (pay someone a fixed amount on a schedule), DCA auto-buys (buy EURC or cirBTC with USDC on a schedule), or target allocation automation (kind "portfolio" in tool calls; keep a target percent allocation across USDC, EURC and cirBTC). This is a legacy feature, existing setups keep running but do NOT describe it to the user as "savings" and do not steer new users toward it when they say they want to save money, point them to the savings vault instead; only use it if the user explicitly asks for scheduled rebalancing or percent-allocation automation. How it works, explain plainly if asked: the strategy's budget is deposited into an onchain vault during a one-time setup the user confirms with their PIN, then it runs on schedule. The user can pause or cancel anytime and gets the remaining balance back. Cadence options are daily, weekly, monthly.

Target allocation automation, two funding modes. "deposit" allocates a fixed USDC amount per run from a deposited budget (needs funding). "sweep" allocates whatever the wallet holds ABOVE a threshold the user sets, straight from their wallet, no deposit; it needs a one-time extra approval (a second PIN at setup) and a max-per-run cap (amountPerPeriod). For sweep, ask for: the allocation percents, the threshold to keep, the max per run, and the cadence. The USDC share just stays as USDC.

Strategy questions: when the user asks about their strategies (is my DCA running, how much is left, what automations do I have), call get_strategies and answer concisely from the data.

Savings vault: when the user asks how much they have saved or what is in the vault, call get_savings and answer concisely from the data.

Swaps (one-off): users can swap (convert) between USDC and EURC or cirBTC right now, in either direction, separate from a recurring DCA. To do one you need the action (buy = USDC to token, sell = token to USDC), which token (EURC or cirBTC), and the amount (always the token they pay WITH: USDC when buying, the token when selling). As soon as you have all three, you MUST call the swap tool in that same turn, do not just say you will; calling it shows the confirmation card. It takes one PIN and the result lands in their wallet. If someone asks to do this repeatedly on a schedule, that is a DCA strategy (create_strategy), not a one-off swap.

Strategy setup: to create one you need the kind (recurring payment, auto-buy, or target allocation), amount per run, how often (daily/weekly/monthly), the recipient (for payments) or which token to buy (for auto-buy) or the allocation (for target allocation), and the total to deposit (funding, not needed for sweep mode). If the user gives a number of runs but not a total, compute funding = amount per run x runs. If you cannot determine the total, ask for it. As soon as you have everything, you MUST call create_strategy in that same turn, do not just say you will. To pause or cancel a recurring payment, guide the user to /pay (Recurring mode); for an auto-buy, guide them to /dashboard/swap (Recurring mode); for target allocation, guide them to /dashboard/savings.`,
    },
    // Cap context to the most recent messages so long chats can't drown the model
    // in stale history (the client also caps, this is defense in depth).
    ...messages.slice(-24),
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

      // Act on tool_calls whenever they are present. Some OpenRouter providers
      // return finish_reason "stop" alongside tool_calls; requiring
      // finish_reason === "tool_calls" silently dropped those, so the agent said
      // "I'll do it" without ever showing the confirmation card.
      if (!msg.tool_calls?.length) {
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
          let resolvedAddress: `0x${string}` | null;
          try {
            resolvedAddress = await resolveSlug(to);
          } catch {
            toolResults.push({
              role: "tool",
              tool_call_id: call.id,
              content: `Couldn't verify "${to}" right now due to a network issue. Ask the user to try again in a moment.`,
            });
            continue;
          }

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

        if (call.function.name === "create_strategy") {
          const kind =
            args.kind === "swap" ? "swap" : args.kind === "portfolio" ? "portfolio" : "payment";
          const amountPerPeriod = String(args.amountPerPeriod ?? "");
          const funding = String(args.funding ?? "");
          const intervalKey = String(args.interval ?? "").toLowerCase();
          const intervalSeconds = INTERVAL_SECONDS[intervalKey];
          const periodsTotal = Number.isInteger(args.periods) ? Number(args.periods) : 0;
          const mode = args.mode === "sweep" ? "sweep" : "deposit";
          const isSweep = kind === "portfolio" && mode === "sweep";

          const fail = (content: string) => {
            toolResults.push({ role: "tool", tool_call_id: call.id, content });
          };

          if (!/^\d+(\.\d+)?$/.test(amountPerPeriod) || parseFloat(amountPerPeriod) <= 0) {
            fail(
              isSweep
                ? "amountPerPeriod missing, ask for the max USDC to allocate per run (a safety cap)."
                : "amountPerPeriod missing or invalid, ask how much per run."
            );
            continue;
          }
          if (!intervalSeconds) {
            fail("interval missing or invalid, ask if it should run daily, weekly or monthly.");
            continue;
          }
          if (!isSweep && (!/^\d+(\.\d+)?$/.test(funding) || parseFloat(funding) < parseFloat(amountPerPeriod))) {
            fail("funding missing or less than one run. Ask for the total to deposit, or compute it from runs x amount.");
            continue;
          }

          if (kind === "portfolio") {
            const raw = (args.allocation ?? {}) as Record<string, unknown>;
            const legs: { symbol: string; bps: number }[] = [];
            let sum = 0;
            for (const [k, v] of Object.entries(raw)) {
              const sym = k === "USDC" ? "USDC" : normalizeTokenSymbol(k);
              const p = Number(v);
              if (!sym || !Number.isInteger(p) || p < 0) continue;
              if (p === 0) continue;
              if (sym === "cirBTC" && !CIRBTC.address) {
                fail("cirBTC is not available right now, offer USDC/EURC only.");
                sum = -1;
                break;
              }
              legs.push({ symbol: sym, bps: p * 100 });
              sum += p;
            }
            if (sum === -1) continue;
            if (sum !== 100) {
              fail(`Allocation percents sum to ${sum}, they must sum to exactly 100. Ask the user to adjust.`);
              continue;
            }
            if (!legs.some((l) => l.symbol !== "USDC")) {
              fail("The allocation is 100% USDC, which needs no strategy. Ask what share should go to EURC or cirBTC.");
              continue;
            }
            const sweepThreshold = String(args.sweepThreshold ?? "0");
            if (isSweep && !/^\d+(\.\d+)?$/.test(sweepThreshold)) {
              fail("sweepThreshold invalid, ask how much USDC to always keep in the wallet.");
              continue;
            }
            return NextResponse.json({
              text: msg.content ?? "",
              pendingAction: {
                type: "create_strategy",
                kind,
                allocation: legs,
                mode,
                sweepThreshold: isSweep ? sweepThreshold : "0",
                amountPerPeriod,
                interval: intervalKey,
                intervalSeconds,
                periodsTotal,
                funding: isSweep ? undefined : funding,
              },
            });
          }

          if (kind === "payment") {
            const to = String(args.recipient ?? "").trim();
            if (!to) { fail("recipient missing, ask who to pay."); continue; }
            let resolvedAddress: string | null;
            try {
              resolvedAddress = /^0x[a-fA-F0-9]{40}$/.test(to) ? to : await resolveSlug(to);
            } catch {
              fail(`Couldn't verify "${to}" right now due to a network issue. Ask the user to try again in a moment.`);
              continue;
            }
            if (!resolvedAddress) { fail(`Recipient "${to}" not found, ask the user to double-check.`); continue; }
            return NextResponse.json({
              text: msg.content ?? "",
              pendingAction: {
                type: "create_strategy",
                kind,
                recipient: to,
                resolvedAddress,
                amountPerPeriod,
                interval: intervalKey,
                intervalSeconds,
                periodsTotal,
                funding,
              },
            });
          }

          const tokenSymbol = String(args.token ?? "");
          const tokenOut = resolveTokenOut(tokenSymbol);
          if (!tokenOut) {
            fail(`Token "${tokenSymbol}" is not available for auto-buy. Only EURC${CIRBTC.address ? " and cirBTC" : ""} can be bought right now.`);
            continue;
          }
          return NextResponse.json({
            text: msg.content ?? "",
            pendingAction: {
              type: "create_strategy",
              kind,
              tokenSymbol: normalizeTokenSymbol(tokenSymbol) ?? "cirBTC",
              tokenOut,
              amountPerPeriod,
              interval: intervalKey,
              intervalSeconds,
              periodsTotal,
              funding,
            },
          });
        }

        if (call.function.name === "swap") {
          const action = String(args.action ?? "").toLowerCase();
          const tokenSymbol = String(args.token ?? "");
          const amount = String(args.amount ?? "");
          const sym = normalizeTokenSymbol(tokenSymbol);
          const fail = (content: string) => toolResults.push({ role: "tool", tool_call_id: call.id, content });

          if (action !== "buy" && action !== "sell") { fail("action missing, ask whether to buy the token with USDC or sell it for USDC."); continue; }
          if (!sym || (sym === "cirBTC" && !CIRBTC.address)) { fail(`Token "${tokenSymbol}" is not available. Only EURC${CIRBTC.address ? " and cirBTC" : ""} can be swapped.`); continue; }
          if (!/^\d+(\.\d+)?$/.test(amount) || parseFloat(amount) <= 0) { fail("amount missing or invalid, ask how much to swap."); continue; }

          const tokenIn = action === "buy" ? "USDC" : sym;
          const tokenOut = action === "buy" ? sym : "USDC";
          return NextResponse.json({
            text: msg.content ?? "",
            pendingAction: { type: "swap", tokenIn, tokenOut, amount },
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
          try {
            const resolved = await resolveSlug(slug);
            result = resolved
              ? `"${slug}" resolves to address ${resolved}`
              : `Username "${slug}" not found`;
          } catch {
            result = `Couldn't verify "${slug}" right now due to a network issue, ask the user to try again in a moment.`;
          }
        } else if (call.function.name === "get_invoices") {
          result = await getInvoicesSummary(walletAddress);
        } else if (call.function.name === "get_strategies") {
          result = await getStrategiesSummary(walletAddress);
        } else if (call.function.name === "get_savings") {
          result = await getSavingsSummary(walletAddress);
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
