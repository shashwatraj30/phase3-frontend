"use client";

import { useState, useRef, useEffect } from "react";

const BACKEND_URL = "https://web-production-ce73f.up.railway.app";

type Message = {
  role: "user" | "ai";
  content: string;
};

type Chat = {
  id: string;
  title: string;
  docs: string[];
  messages: Message[];
};

const initialChats: Chat[] = [
  { id: "1", title: "New chat", docs: [], messages: [] },
];

export default function Home() {
  const [dark, setDark] = useState(false);
  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState("1");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find((c) => c.id === activeChatId)!;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat.messages]);

  function newChat() {
    const id = Date.now().toString();
    const chat: Chat = { id, title: "New chat", docs: [], messages: [] };
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(id);
  }

  function updateChat(id: string, patch: Partial<Chat>) {
    setChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));

    const docNames = Array.from(files).map((f) => f.name);

    updateChat(activeChatId, {
      docs: [...activeChat.docs, ...docNames],
      title: activeChat.title === "New chat" ? docNames[0].replace(".pdf", "") : activeChat.title,
      messages: [
        ...activeChat.messages,
        { role: "ai", content: `Analyzing ${docNames.length} paper(s)... this may take a minute.` },
      ],
    });

    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/analyze`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      const report = data.report;

      const summary = `**Analysis complete.**\n\n**Gaps found:** ${report.gaps.length} papers analyzed.\n\n**Key synthesis:**\n${report.synthesis.slice(0, 400)}...\n\nYou can now ask me anything about these papers.`;

      updateChat(activeChatId, {
        messages: [
          ...activeChat.messages,
          { role: "ai", content: `Analyzing ${docNames.length} paper(s)... this may take a minute.` },
          { role: "ai", content: summary },
        ],
      });
    } catch {
      updateChat(activeChatId, {
        messages: [
          ...activeChat.messages,
          { role: "ai", content: "Something went wrong during analysis. Please try again." },
        ],
      });
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", content: input };
    updateChat(activeChatId, {
      messages: [...activeChat.messages, userMsg],
    });
    setInput("");
    setLoading(true);

    setTimeout(() => {
      updateChat(activeChatId, {
        messages: [
          ...activeChat.messages,
          userMsg,
          { role: "ai", content: "Chat endpoint coming in the next build. For now, upload PDFs to analyze them." },
        ],
      });
      setLoading(false);
    }, 500);
  }

  const nodes = activeChat.docs.map((doc, i) => ({
    id: i,
    label: doc.replace(".pdf", "").slice(0, 12),
    x: 60 + (i % 2) * 100,
    y: 80 + Math.floor(i / 2) * 100,
  }));

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-primary)", overflow: "hidden" }}>
      
      {/* Sidebar */}
      <div style={{ width: 220, borderRight: "0.5px solid var(--border)", background: "var(--bg-secondary)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "14px 14px 10px", borderBottom: "0.5px solid var(--border)" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Research Copilot</div>
          <button onClick={newChat} style={{ marginTop: 8, width: "100%", padding: "7px 10px", background: "var(--accent)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            + New chat
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {chats.map((c) => (
            <div key={c.id} onClick={() => setActiveChatId(c.id)} style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 2, background: c.id === activeChatId ? "var(--accent-light)" : "transparent" }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{c.title}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{c.docs.length} paper{c.docs.length !== 1 ? "s" : ""}</div>
            </div>
          ))}
        </div>

        {activeChat.docs.length > 0 && (
          <div style={{ borderTop: "0.5px solid var(--border)", padding: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 500 }}>Documents</div>
            {activeChat.docs.map((doc, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 6px", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "var(--accent)" }}>📄</span>
                <span style={{ fontSize: 11, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main chat */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "0.5px solid var(--border)", background: "var(--bg-secondary)" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>{activeChat.title}</div>
          <button onClick={() => setDark(!dark)} style={{ padding: "5px 12px", border: "0.5px solid var(--border)", borderRadius: 8, background: "transparent", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>
            {dark ? "☀ Light" : "☾ Dark"}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {activeChat.messages.length === 0 && (
            <div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📚</div>
              <div style={{ fontWeight: 500, marginBottom: 6, color: "var(--text-secondary)" }}>Upload research papers to begin</div>
              <div>Drop PDFs below and the agent will analyze gaps, connections, and synthesize findings.</div>
            </div>
          )}
          {activeChat.messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "75%", padding: "9px 13px", borderRadius: 12, fontSize: 13, lineHeight: 1.6, background: m.role === "user" ? "var(--accent)" : "var(--bg-card)", color: m.role === "user" ? "#fff" : "var(--text-primary)", border: m.role === "ai" ? "0.5px solid var(--border)" : "none", borderBottomRightRadius: m.role === "user" ? 4 : 12, borderBottomLeftRadius: m.role === "ai" ? 4 : 12, whiteSpace: "pre-wrap" }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ padding: "9px 13px", borderRadius: 12, fontSize: 13, background: "var(--bg-card)", border: "0.5px solid var(--border)", color: "var(--text-muted)" }}>Thinking...</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ padding: "10px 16px", borderTop: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 8, background: "var(--bg-secondary)" }}>
          <input ref={fileRef} type="file" accept=".pdf" multiple style={{ display: "none" }} onChange={handleUpload} />
          <button onClick={() => fileRef.current?.click()} disabled={loading} style={{ padding: "7px 12px", border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
            📎 Upload PDF
          </button>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder="Ask about your papers..." style={{ flex: 1, padding: "8px 12px", border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text-primary)", fontSize: 13, outline: "none" }} />
          <button onClick={handleSend} disabled={loading} style={{ padding: "7px 14px", background: "var(--accent)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", flexShrink: 0 }}>
            Send
          </button>
        </div>
      </div>

      {/* Graph panel */}
      <div style={{ width: 240, borderLeft: "0.5px solid var(--border)", background: "var(--bg-secondary)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--border)" }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>Paper connections</div>
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          <svg width="100%" height="100%" viewBox="0 0 240 340">
            {nodes.length > 1 && nodes.map((n, i) =>
              nodes.slice(i + 1).map((m, j) => (
                <line key={`${i}-${j}`} x1={n.x} y1={n.y} x2={m.x} y2={m.y} stroke="var(--accent)" strokeWidth="2" strokeOpacity="0.5" />
              ))
            )}
            {nodes.map((n) => (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r="24" fill="var(--accent-light)" stroke="var(--accent)" strokeWidth="1.5" />
                <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="8" fill="var(--text-secondary)">{n.label}</text>
              </g>
            ))}
            {nodes.length === 0 && (
              <text x="120" y="170" textAnchor="middle" fontSize="11" fill="var(--text-muted)">Upload papers to see connections</text>
            )}
          </svg>
        </div>
        <div style={{ padding: "8px 14px", borderTop: "0.5px solid var(--border)", fontSize: 11, color: "var(--text-muted)" }}>
          Edge thickness = connection strength
        </div>
      </div>

    </div>
  );
}