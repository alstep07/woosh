"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import "@/features/payments/chat-tools"; // registers examples
import { getAllExamples } from "@/features/chat/model/registry";
import { env } from "@/shared/config/env";

const EXAMPLES = getAllExamples();
const CHAT_STORAGE_KEY = "woosh_chat_history";

type PendingAction = {
  type: "send_payment";
  to: string;
  amount: string;
  resolvedAddress?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
  pendingAction?: PendingAction;
  actionStatus?: "confirmed" | "cancelled" | "sending" | "paid" | "send_error";
  actionError?: string;
  txExplorerUrl?: string;
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
}

export default function ChatPanel({ name, walletAddress, userEmail }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) return JSON.parse(saved) as ChatMessage[];
    } catch {}
    return [buildWelcome(name)];
  });
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const hasConversation = messages.length > 1;
  const typewriterPlaceholder = useTypewriterPlaceholder(hasConversation ? [] : EXAMPLES);
  const bottomRef = useRef<HTMLDivElement>(null);

  function clearChat() {
    const fresh = buildWelcome(name);
    setMessages([fresh]);
    try { sessionStorage.removeItem(CHAT_STORAGE_KEY); } catch {}
  }

  // Circle SDK — created lazily on first payment attempt to avoid
  // conflicting with the signup page's SDK instance
  const sdkRef = useRef<W3SSdk | null>(null);
  const deviceIdRef = useRef<string>("");
  const payingMsgIdRef = useRef<string | null>(null);
  const onLoginCompleteRef = useRef<((err: unknown, result: unknown) => void) | null>(null);

  // Persist messages to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  async function getOrCreateSdk(): Promise<W3SSdk | null> {
    if (!env.circleAppId) return null;
    if (sdkRef.current) return sdkRef.current;
    const onLoginComplete = (err: unknown, result: unknown) => {
      onLoginCompleteRef.current?.(err, result);
    };
    const sdk = new W3SSdk({ appSettings: { appId: env.circleAppId } }, onLoginComplete);
    sdkRef.current = sdk;
    return sdk;
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

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
      });
      return "ok";
    } catch (err) {
      updateMsgStatus(msgId, "send_error", err instanceof Error ? err.message : "Payment failed.");
      return "error";
    }
  }

  async function handleConfirm(msg: ChatMessage) {
    if (!msg.pendingAction) return;
    const { resolvedAddress, amount } = msg.pendingAction;
    if (!resolvedAddress) return;

    // If Circle not configured — fall back to payment page
    if (!env.circleAppId) {
      window.location.href = `/pay/${msg.pendingAction.to}?amount=${amount}`;
      return;
    }

    updateMsgStatus(msg.id, "confirmed");
    payingMsgIdRef.current = msg.id;

    // Try cached session token first — skip OTP entirely
    let cachedToken: string | null = null;
    let cachedKey: string | null = null;
    try {
      cachedToken = sessionStorage.getItem("woosh_session_token");
      cachedKey = sessionStorage.getItem("woosh_session_enc_key");
    } catch {}

    if (cachedToken && cachedKey) {
      const sdk = await getOrCreateSdk();
      if (sdk) {
        const result = await executePay(msg.id, resolvedAddress, amount, cachedToken, cachedKey, sdk);
        if (result !== "auth_error") return;
        // Token expired — clear and fall through to OTP
        try {
          sessionStorage.removeItem("woosh_session_token");
          sessionStorage.removeItem("woosh_session_enc_key");
        } catch {}
        updateMsgStatus(msg.id, "confirmed");
      }
    }

    // OTP flow (no cached token or token expired)
    if (!userEmail) {
      updateMsgStatus(msg.id, "send_error", "Please re-open the app to authenticate.");
      return;
    }

    onLoginCompleteRef.current = async (err, result) => {
      const msgId = payingMsgIdRef.current!;
      if (err) {
        updateMsgStatus(msgId, "send_error", "Verification failed. Please try again.");
        return;
      }
      const { userToken, encryptionKey } = result as { userToken: string; encryptionKey: string };
      try {
        sessionStorage.setItem("woosh_session_token", userToken);
        sessionStorage.setItem("woosh_session_enc_key", encryptionKey);
      } catch {}
      const sdk = sdkRef.current!;
      await executePay(msgId, resolvedAddress, amount, userToken, encryptionKey, sdk);
    };

    try {
      const sdk = await getOrCreateSdk();
      if (!sdk) throw new Error("Circle SDK not available.");

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

    try {
      const history = [...messages.filter((m) => m.id !== "welcome" && m.text.trim()), userMsg].map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.text,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, walletAddress: walletAddress ?? "", userName: name }),
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
          ? `I'll send $${Number(data.pendingAction.amount).toFixed(2)} to ${data.pendingAction.to}.`
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
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          text: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col glass-card rounded-card overflow-hidden mb-4 min-w-0 w-full">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-blue-primary/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="text-xs font-semibold text-text-secondary/40 uppercase tracking-widest flex-1">
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

      {/* Messages */}
      <div className="overflow-y-auto h-52 sm:h-56 px-3 sm:px-4 py-3 sm:py-4">
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
                    <p className="text-xs text-text-secondary mb-2">
                      Send ${Number(msg.pendingAction.amount).toFixed(2)} to{" "}
                      <span className="text-text-primary font-medium">{msg.pendingAction.to}</span>
                      {msg.pendingAction.resolvedAddress && (
                        <span className="font-mono text-text-secondary/50 ml-1">
                          (…{msg.pendingAction.resolvedAddress.slice(-4)})
                        </span>
                      )}?
                    </p>
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
                    <p className="text-xs text-green-400">
                      Payment sent.{" "}
                      {msg.txExplorerUrl && (
                        <a
                          href={msg.txExplorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 opacity-70 hover:opacity-100 transition-opacity"
                        >
                          View on explorer
                        </a>
                      )}
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

      {/* Input */}
      <div className={`border-t border-border bg-white/[0.03] px-4 py-3 flex items-center gap-3 transition-colors ${focused ? "border-blue-primary/40" : ""}`}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={focused ? "" : hasConversation ? "Write a message..." : (typewriterPlaceholder || "")}
          disabled={isLoading}
          className="flex-1 bg-transparent text-text-primary text-base sm:text-sm outline-none placeholder:text-text-secondary/50 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="text-blue-primary hover:text-blue-secondary disabled:text-text-secondary/20 transition-colors shrink-0"
          aria-label="Send"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
