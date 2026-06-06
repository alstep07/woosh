"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import "@/features/payments/chat-tools"; // registers examples
import { getAllExamples } from "@/features/chat/model/registry";

const EXAMPLES = getAllExamples();

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
  pendingAction?: PendingAction;
  actionStatus?: "confirmed" | "cancelled";
};

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "Hey! How can I help?",
};

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
}

export default function ChatPanel({ name, walletAddress }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([{
    ...WELCOME,
    text: name
      ? `Hey, ${name}! How can I help?`
      : WELCOME.text,
  }]);
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const placeholder = useTypewriterPlaceholder(EXAMPLES);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

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
      const history = [...messages.filter((m) => m.id !== "welcome"), userMsg].map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.text,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, walletAddress: walletAddress ?? "" }),
      });

      const data = (await res.json()) as {
        text: string;
        pendingAction?: PendingAction;
      };

      // Surface API-level errors as assistant messages (not as thrown errors)
      if (!res.ok && !data.text) {
        throw new Error(`HTTP ${res.status}`);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          text: data.text,
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

  function handleConfirm(msg: ChatMessage) {
    const { to, amount } = msg.pendingAction!;
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, actionStatus: "confirmed" } : m))
    );
    router.push(`/pay/${to}?amount=${amount}`);
  }

  function handleCancel(id: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, actionStatus: "cancelled" } : m))
    );
  }

  return (
    <div className="flex flex-col glass-card rounded-card overflow-hidden mb-4">
      {/* Header */}
      <div className="px-4 pt-3.5 pb-2 flex items-center gap-2">
        <svg className="w-4 h-4 text-blue-primary/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="text-xs font-semibold text-text-secondary/40 uppercase tracking-widest">
          Woosh Agent
        </span>
      </div>

      {/* Messages */}
      <div className="overflow-y-auto h-56 px-4 py-4">
        <div className="flex flex-col justify-end min-h-full space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-primary text-white rounded-br-sm"
                  : "bg-white/[0.06] text-text-primary rounded-bl-sm"
              }`}>
                {msg.text && <p>{msg.text}</p>}

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
                        Confirm →
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

                {msg.pendingAction && msg.actionStatus === "confirmed" && (
                  <div className={`${msg.text ? "mt-2 pt-2 border-t border-white/10" : ""}`}>
                    <p className="text-xs text-green-400">↗ Opening payment page…</p>
                  </div>
                )}

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
      <div className={`border-t border-border bg-white/[0.03] px-4 sm:px-6 py-3.5 flex items-center gap-3 transition-colors ${focused ? "border-blue-primary/40" : ""}`}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={focused ? "" : (placeholder || "")}
          disabled={isLoading}
          className="flex-1 bg-transparent text-text-primary text-sm outline-none placeholder:text-text-secondary/50 disabled:opacity-50"
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
