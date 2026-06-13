"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import "@/features/payments/chat-tools"; // registers examples
import { getAllExamples } from "@/features/chat/model/registry";
import { env } from "@/shared/config/env";
import { getW3SSdk, setLoginHandler } from "@/shared/lib/w3s";
import { getCachedTokens, setCachedTokens, clearCachedTokens } from "@/shared/lib/session";
import { computeInvoiceId, newNonce } from "@/entities/invoice/lib/computeInvoiceId";
import { buildRequestLink } from "@/entities/invoice/lib/buildRequestLink";

const EXAMPLES = getAllExamples();
const CHAT_STORAGE_KEY = "woosh_chat_history";

// Compact a link for display: drop the protocol and middle-ellipsize the long tail.
function shortenLink(url: string): string {
  const s = url.replace(/^https?:\/\//, "");
  return s.length > 34 ? `${s.slice(0, 24)}…${s.slice(-8)}` : s;
}

type PendingAction =
  | { type: "send_payment"; to: string; amount: string; resolvedAddress?: string }
  | { type: "create_request"; amount: string; memo: string };

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
  pendingAction?: PendingAction;
  actionStatus?: "confirmed" | "cancelled" | "sending" | "paid" | "created" | "send_error";
  actionError?: string;
  txExplorerUrl?: string;
  requestLink?: string;
};

function buildWelcome(name?: string): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    text: name ? `Hey, ${name}! How can I help?` : "Hey! How can I help?",
  };
}

function useTypewriterPlaceholder(examples: string[]) {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setCaret((c) => !c), 530);
    return () => clearInterval(t);
  }, []);
  const stateRef = useRef({
    exIdx: 0,
    charIdx: 0,
    phase: "typing" as "typing" | "holding" | "deleting",
  });
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (examples.length === 0) return;

    function tick() {
      const s = stateRef.current;
      const current = examples[s.exIdx];

      if (s.phase === "typing") {
        s.charIdx++;
        setText(current.slice(0, s.charIdx));
        if (s.charIdx >= current.length) {
          s.phase = "holding";
          timerRef.current = setTimeout(tick, 1800);
        } else {
          timerRef.current = setTimeout(tick, 65);
        }
      } else if (s.phase === "holding") {
        s.phase = "deleting";
        timerRef.current = setTimeout(tick, 30);
      } else {
        s.charIdx--;
        setText(current.slice(0, s.charIdx));
        if (s.charIdx <= 0) {
          s.exIdx = (s.exIdx + 1) % examples.length;
          s.phase = "typing";
          timerRef.current = setTimeout(tick, 500);
        } else {
          timerRef.current = setTimeout(tick, 35);
        }
      }
    }

    timerRef.current = setTimeout(tick, 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [examples]);

  return text + (caret ? "|" : " ");
}

interface Props {
  name?: string;
  walletAddress?: string;
  userEmail?: string;
  onPaymentSuccess?: (amount: string, counterparty: string) => void;
  knownCounterparties?: string[];
}

export default function ChatPanel({ name, walletAddress, userEmail, onPaymentSuccess, knownCounterparties }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessage[];
        const withoutWelcome = parsed.filter((m) => m.id !== "welcome");
        return [buildWelcome(name), ...withoutWelcome];
      }
    } catch {}
    return [buildWelcome(name)];
  });
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const hasConversation = messages.length > 1;
  const typewriterPlaceholder = useTypewriterPlaceholder(hasConversation ? [] : EXAMPLES);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distanceFromBottom > 60);
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function clearChat() {
    const fresh = buildWelcome(name);
    setMessages([fresh]);
    try { sessionStorage.removeItem(CHAT_STORAGE_KEY); } catch {}
  }

  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Circle SDK — uses shared singleton so only one instance ever exists per tab
  const deviceIdRef = useRef<string>("");
  const payingMsgIdRef = useRef<string | null>(null);
  // The challenge executor for the in-flight confirmation (send vs create), so the
  // OTP completion handler runs the right one with the same parameters.
  const pendingRunRef = useRef<
    ((userToken: string, encryptionKey: string, sdk: W3SSdk) => Promise<"ok" | "auth_error" | "error">) | null
  >(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevLoadingRef = useRef(false);

  // Persist messages to sessionStorage — welcome is excluded and rebuilt on load
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.filter((m) => m.id !== "welcome")));
    } catch {}
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Refocus the input once a response finishes (loading -> false), not on mount,
  // so the user can keep typing without reaching for the field.
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) inputRef.current?.focus();
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  function updateMsgStatus(id: string, status: ChatMessage["actionStatus"] | undefined, actionError?: string) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const updated = { ...m, actionStatus: status };
        if (actionError) updated.actionError = actionError;
        else delete updated.actionError;
        return updated;
      })
    );
  }

  async function executePay(
    msgId: string,
    recipientAddress: string,
    amount: string,
    userToken: string,
    encryptionKey: string,
    sdk: W3SSdk
  ): Promise<"ok" | "auth_error" | "error"> {
    updateMsgStatus(msgId, "sending");
    try {
      const res = await fetch("/api/wallet/send-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken, recipientAddress, amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return "auth_error";
        throw new Error(data.error ?? "Payment failed");
      }

      sdk.setAuthentication({ userToken, encryptionKey });
      const explorerUrl = walletAddress
        ? `${env.arcExplorerUrl}/address/${walletAddress}`
        : undefined;
      sdk.execute(data.challengeId, (err) => {
        if (err) {
          updateMsgStatus(msgId, "send_error", "Payment failed. Please try again.");
          return;
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, actionStatus: "paid", ...(explorerUrl ? { txExplorerUrl: explorerUrl } : {}) }
              : m
          )
        );
        onPaymentSuccess?.(amount, recipientAddress);
      });
      return "ok";
    } catch (err) {
      updateMsgStatus(msgId, "send_error", err instanceof Error ? err.message : "Payment failed.");
      return "error";
    }
  }

  async function executeCreateRequest(
    msgId: string,
    salt: string,
    amount: string,
    memo: string,
    userToken: string,
    encryptionKey: string,
    sdk: W3SSdk
  ): Promise<"ok" | "auth_error" | "error"> {
    updateMsgStatus(msgId, "sending");
    try {
      const res = await fetch("/api/wallet/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken, salt, amount, memo }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return "auth_error";
        throw new Error(data.error ?? "Failed to create request");
      }

      sdk.setAuthentication({ userToken, encryptionKey });
      sdk.execute(data.challengeId, (err) => {
        if (err) {
          updateMsgStatus(msgId, "send_error", "Couldn't create the request. Please try again.");
          return;
        }
        // id is deterministic from (payee, salt) — build the link without waiting for the tx to index
        const addr = walletAddress as `0x${string}`;
        const id = computeInvoiceId(addr, salt);
        const link = buildRequestLink(id);
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, actionStatus: "created", requestLink: link } : m))
        );
      });
      return "ok";
    } catch (err) {
      updateMsgStatus(msgId, "send_error", err instanceof Error ? err.message : "Failed to create request.");
      return "error";
    }
  }

  async function copyRequestLink(msgId: string, link: string) {
    await navigator.clipboard.writeText(link);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  }

  async function handleConfirm(msg: ChatMessage) {
    if (!msg.pendingAction) return;
    const pa = msg.pendingAction;

    // If Circle not configured — fall back to a relevant page
    if (!env.circleAppId) {
      window.location.href = pa.type === "send_payment"
        ? `/pay/${pa.to}?amount=${pa.amount}`
        : `/dashboard/invoices`;
      return;
    }
    if (pa.type === "send_payment" && !pa.resolvedAddress) return;
    if (pa.type === "create_request" && !walletAddress) {
      updateMsgStatus(msg.id, "send_error", "Please re-open the app to authenticate.");
      return;
    }

    updateMsgStatus(msg.id, "confirmed");
    payingMsgIdRef.current = msg.id;

    // Build the executor for this action once, so the cached-token and OTP paths
    // (and a possible retry) all run the same thing with the same parameters.
    const salt = pa.type === "create_request" ? newNonce() : "";
    const run = (userToken: string, encryptionKey: string, sdk: W3SSdk) =>
      pa.type === "send_payment"
        ? executePay(msg.id, pa.resolvedAddress!, pa.amount, userToken, encryptionKey, sdk)
        : executeCreateRequest(msg.id, salt, pa.amount, pa.memo, userToken, encryptionKey, sdk);
    pendingRunRef.current = run;

    // Try cached session token first — skip OTP entirely
    const cached = getCachedTokens();
    if (cached) {
      const sdk = getW3SSdk(env.circleAppId);
      const result = await run(cached.userToken, cached.encryptionKey, sdk);
      if (result !== "auth_error") return;
      // Token expired — clear and fall through to OTP
      clearCachedTokens();
      updateMsgStatus(msg.id, "confirmed");
    }

    // OTP flow (no cached token or token expired)
    if (!userEmail) {
      updateMsgStatus(msg.id, "send_error", "Please re-open the app to authenticate.");
      return;
    }

    setLoginHandler(async (err, result) => {
      const msgId = payingMsgIdRef.current!;
      if (err) {
        updateMsgStatus(msgId, "send_error", "Verification failed. Please try again.");
        return;
      }
      const { userToken, encryptionKey } = result as { userToken: string; encryptionKey: string };
      setCachedTokens(userToken, encryptionKey);
      const sdk = getW3SSdk(env.circleAppId);
      await pendingRunRef.current?.(userToken, encryptionKey, sdk);
    });

    try {
      const sdk = getW3SSdk(env.circleAppId);

      let did = deviceIdRef.current;
      if (!did) {
        const fetched = await sdk.getDeviceId();
        if (fetched) { deviceIdRef.current = fetched; did = fetched; }
      }
      if (!did) throw new Error("Could not initialize device. Please try again.");

      const res = await fetch("/api/wallet/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: did, email: userEmail }),
      });
      const tokens = await res.json();
      if (!res.ok) throw new Error(tokens.error ?? "Failed to send code");

      sdk.updateConfigs({
        appSettings: { appId: env.circleAppId },
        loginConfigs: {
          deviceToken: tokens.deviceToken,
          deviceEncryptionKey: tokens.deviceEncryptionKey,
          otpToken: tokens.otpToken,
        },
      });
      sdk.verifyOtp();
    } catch (err) {
      console.error("[ChatPanel] handleConfirm error:", err);
      setLoginHandler(() => {}); // unregister handler on failure
      const msg2 = err instanceof Error ? err.message : (typeof err === "string" ? err : "Failed to start payment. Check console for details.");
      updateMsgStatus(msg.id, "send_error", msg2);
    }
  }

  function handleCancel(id: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, actionStatus: "cancelled" } : m))
    );
  }

  async function handleSend() {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      text: input.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const history = [...messages.filter((m) => m.id !== "welcome" && m.text.trim()), userMsg].map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.text,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, walletAddress: walletAddress ?? "", userName: name }),
        signal: controller.signal,
      });

      const data = (await res.json()) as {
        text: string;
        isError?: boolean;
        pendingAction?: PendingAction;
      };

      if (!res.ok && !data.text) {
        throw new Error(`HTTP ${res.status}`);
      }

      // If LLM returned empty text alongside pendingAction, generate a summary
      // so the history always has meaningful assistant context
      const assistantText = data.text ||
        (data.pendingAction
          ? data.pendingAction.type === "create_request"
            ? `I'll create an invoice for $${Number(data.pendingAction.amount).toFixed(2)}${data.pendingAction.memo ? ` for ${data.pendingAction.memo}` : ""}.`
            : `I'll send $${Number(data.pendingAction.amount).toFixed(2)} to ${data.pendingAction.to}.`
          : "");

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          text: assistantText,
          isError: data.isError,
          ...(data.pendingAction ? { pendingAction: data.pendingAction } : {}),
        },
      ]);
    } catch (err) {
      // Aborted by the user (stop button) — leave the chat as-is, no error bubble.
      if ((err as Error)?.name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            text: "Something went wrong. Please try again.",
          },
        ]);
      }
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  return (
    <div className="flex flex-col glass-card rounded-card overflow-hidden min-w-0 w-full relative h-full">
      {/* Glass header — absolute so messages scroll beneath it */}
      <div className="z-10 px-4 py-3 flex items-center gap-2
                      bg-[#0d1222]
                      border-b border-white/[0.07]">
        <svg className="w-4 h-4 text-blue-primary/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="text-xs font-semibold text-text-secondary/60 uppercase tracking-widest flex-1">
          Woosh Agent
        </span>
        {hasConversation && (
          <button
            onClick={clearChat}
            title="Clear chat"
            className="text-text-secondary/30 hover:text-text-secondary/60 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
      {/* Messages — height includes header zone so content scrolls beneath it */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 sm:px-4 pt-12 pb-3 sm:pb-4"
        style={{
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 24px)",
          maskImage: "linear-gradient(to bottom, transparent 0, black 24px)",
        }}
      >
        <div className="flex flex-col justify-end min-h-full space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words min-w-0 ${
                msg.role === "user"
                  ? "bg-blue-primary text-white rounded-br-sm"
                  : msg.isError
                  ? "bg-red-500/10 text-red-300/80 rounded-bl-sm"
                  : "bg-white/[0.06] text-text-primary rounded-bl-sm"
              }`}>
                {msg.text && (
                  <div className="[&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mt-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mt-1 [&_li]:mt-0.5 [&_p]:mb-1 [&_p:last-child]:mb-0 [&_code]:font-mono [&_code]:text-xs [&_code]:bg-white/10 [&_code]:px-1 [&_code]:rounded">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                )}

                {/* Pending action confirmation card */}
                {msg.pendingAction && !msg.actionStatus && (
                  <div className={`${msg.text ? "mt-2 pt-2 border-t border-white/10" : ""}`}>
                    {msg.pendingAction.type === "create_request" ? (
                      <>
                        <p className="text-xs text-text-secondary mb-1">
                          Create an invoice for ${Number(msg.pendingAction.amount).toFixed(2)}
                          {msg.pendingAction.memo && (
                            <> — <span className="text-text-primary font-medium">{msg.pendingAction.memo}</span></>
                          )}?
                        </p>
                        <p className="text-xs text-text-secondary/40 mb-2">Registered onchain · needs your PIN</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-text-secondary mb-1">
                          Send ${Number(msg.pendingAction.amount).toFixed(2)} to{" "}
                          <span className="text-text-primary font-medium">{msg.pendingAction.to}</span>
                          {msg.pendingAction.resolvedAddress && (
                            <span className="font-mono text-text-secondary/50 ml-1">
                              (…{msg.pendingAction.resolvedAddress.slice(-4)})
                            </span>
                          )}?
                        </p>
                        <p className="text-xs text-text-secondary/40 mb-2">Fee paid in USDC · Arc network</p>
                        {msg.pendingAction.resolvedAddress &&
                          knownCounterparties &&
                          !knownCounterparties.some(
                            (a) => a.toLowerCase() === (msg.pendingAction as { resolvedAddress?: string }).resolvedAddress!.toLowerCase()
                          ) && (
                            <p className="text-xs text-amber-400/70 mb-2">
                              First time paying this address.
                            </p>
                          )}
                      </>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConfirm(msg)}
                        className="text-xs px-3 py-1 bg-blue-primary text-white rounded-full hover:bg-blue-secondary transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => handleCancel(msg.id)}
                        className="text-xs px-3 py-1 text-text-secondary/50 hover:text-text-secondary transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Request created — copyable link chip */}
                {msg.pendingAction && msg.actionStatus === "created" && msg.requestLink && (
                  <div className={`${msg.text ? "mt-2 pt-2 border-t border-white/10" : ""}`}>
                    <p className="text-xs text-green-400 mb-1.5">Invoice created — share this link:</p>
                    <button
                      onClick={() => copyRequestLink(msg.id, msg.requestLink!)}
                      className="flex items-center gap-1.5 max-w-full text-xs bg-blue-primary/10 hover:bg-blue-primary/20 text-blue-primary px-3 py-1.5 rounded-input font-medium transition-colors"
                    >
                      {copiedMsgId === msg.id ? (
                        "Copied!"
                      ) : (
                        <>
                          <span className="font-mono">{shortenLink(msg.requestLink)}</span>
                          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="shrink-0">
                            <rect x="4.5" y="4.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                            <path d="M2.5 9.5H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Confirmed — waiting for OTP iframe */}
                {msg.pendingAction && msg.actionStatus === "confirmed" && (
                  <div className={`${msg.text ? "mt-2 pt-2 border-t border-white/10" : ""}`}>
                    <p className="text-xs text-text-secondary/60">Check your email for a verification code…</p>
                  </div>
                )}

                {/* Sending — waiting for PIN iframe */}
                {msg.pendingAction && msg.actionStatus === "sending" && (
                  <div className={`${msg.text ? "mt-2 pt-2 border-t border-white/10" : ""}`}>
                    <p className="text-xs text-text-secondary/60">Confirm with your PIN…</p>
                  </div>
                )}

                {/* Paid */}
                {msg.pendingAction && msg.actionStatus === "paid" && (
                  <div className={`${msg.text ? "mt-2 pt-2 border-t border-white/10" : ""}`}>
                    <p className="text-xs text-green-400 flex items-center gap-1.5">
                      <svg
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ animation: "scaleIn 0.2s ease-out" }}
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <circle cx="8" cy="8" r="7" fill="currentColor" fillOpacity="0.15" />
                        <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>
                        Confirmed on Arc.{" "}
                        {msg.txExplorerUrl && (
                          <a
                            href={msg.txExplorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-2 opacity-70 hover:opacity-100 transition-opacity"
                          >
                            View account on explorer
                          </a>
                        )}
                      </span>
                    </p>
                  </div>
                )}

                {/* Error */}
                {msg.pendingAction && msg.actionStatus === "send_error" && (
                  <div className={`${msg.text ? "mt-2 pt-2 border-t border-white/10" : ""}`}>
                    <p className="text-xs text-red-400/80">{msg.actionError ?? "Something went wrong."}</p>
                    <button
                      onClick={() => updateMsgStatus(msg.id, undefined)}
                      className="mt-1 text-xs text-blue-primary/60 hover:text-blue-primary transition-colors"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {/* Cancelled */}
                {msg.pendingAction && msg.actionStatus === "cancelled" && (
                  <div className={`${msg.text ? "mt-2 pt-2 border-t border-white/10" : ""}`}>
                    <p className="text-xs text-text-secondary/50">Cancelled.</p>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white/[0.06] rounded-2xl rounded-bl-sm px-3.5 py-3 flex gap-1.5 items-center">
                <span className="w-1.5 h-1.5 bg-text-secondary/40 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-text-secondary/40 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-text-secondary/40 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Scroll-to-bottom button — shown when not at the latest message */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          aria-label="Scroll to latest"
          className="absolute bottom-20 right-3 z-20 w-7 h-7 rounded-full bg-[rgba(8,12,26,0.80)] backdrop-blur-sm border border-white/10 flex items-center justify-center text-text-secondary/50 hover:text-text-primary transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Input */}
      <div className={`border-t border-border bg-white/[0.03] px-4 py-3 flex items-center gap-3 transition-colors ${focused ? "border-blue-primary/40" : ""}`}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSend(); } }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={focused ? "" : hasConversation ? "Write a message..." : (typewriterPlaceholder || "")}
          className="flex-1 bg-transparent text-text-primary text-base sm:text-sm outline-none placeholder:text-text-secondary/50"
        />
        <button
          onClick={isLoading ? handleStop : handleSend}
          disabled={!isLoading && !input.trim()}
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-blue-primary text-white hover:bg-blue-secondary disabled:bg-white/[0.06] disabled:text-text-secondary/30 transition-colors"
          aria-label={isLoading ? "Stop" : "Send"}
        >
          {isLoading ? (
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="5" width="14" height="14" rx="2.5" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
