"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const BACKEND_URL = "https://web-production-ce73f.up.railway.app";

type Message = {
  role: "user" | "ai";
  content: string;
};

type EdgeScore = {
  paper_a: number;
  paper_b: number;
  strength: number;
  reason?: string;
};

type Chat = {
  id: string;
  title: string;
  docs: string[];
  messages: Message[];
  edgeScores: EdgeScore[];
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dark, setDark] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "chat" | "doc"; chatId: string; docName?: string } | null>(null);
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [leftWidth, setLeftWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(240);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeChat = chats.find((c) => c.id === activeChatId) || null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        window.location.href = "/login";
      } else {
        setUser(session.user);
        loadChats(session.user.id);
      }
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        window.location.href = "/login";
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages]);

  useEffect(() => {
    setStagedFiles([]);
    if (fileRef.current) fileRef.current.value = "";
  }, [activeChatId]);

  async function loadChats(userId: string) {
    const { data: chatRows } = await supabase
      .from("chats")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!chatRows || chatRows.length === 0) {
      const newChat = await createChatInDb(userId, "New chat");
      if (newChat) {
        setChats([{ id: newChat.id, title: "New chat", docs: [], messages: [], edgeScores: [] }]);
        setActiveChatId(newChat.id);
      }
      return;
    }

    const fullChats: Chat[] = await Promise.all(
      chatRows.map(async (chat) => {
        const { data: messages } = await supabase
          .from("messages")
          .select("*")
          .eq("chat_id", chat.id)
          .order("created_at", { ascending: true });

        const { data: docs } = await supabase
          .from("research_documents")
          .select("*")
          .eq("chat_id", chat.id);

        const { data: edges } = await supabase
          .from("edge_scores")
          .select("*")
          .eq("chat_id", chat.id);

        return {
          id: chat.id,
          title: chat.title,
          docs: docs?.map((d) => d.name) || [],
          messages: messages?.map((m) => ({ role: m.role as "user" | "ai", content: m.content })) || [],
          edgeScores: edges?.map((e) => ({ paper_a: e.paper_a, paper_b: e.paper_b, strength: e.strength, reason: e.reason })) || [],
        };
      })
    );

    setChats(fullChats);
    setActiveChatId(fullChats[0].id);
  }

  async function createChatInDb(userId: string, title: string) {
    const { data, error } = await supabase
      .from("chats")
      .insert({ user_id: userId, title })
      .select()
      .single();
    if (error) return null;
    return data;
  }

  async function newChat() {
    if (!user) return;
    const dbChat = await createChatInDb(user.id, "New chat");
    if (!dbChat) return;
    const chat: Chat = { id: dbChat.id, title: "New chat", docs: [], messages: [], edgeScores: [] };
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(dbChat.id);
  }

  function updateChat(id: string, patch: Partial<Chat>) {
    setChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }

  async function deleteDoc(chatId: string, docName: string) {
    await supabase.from("research_documents").delete().eq("chat_id", chatId).eq("name", docName);
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId ? { ...c, docs: c.docs.filter((d) => d !== docName) } : c
      )
    );
  }

  async function deleteChat(chatId: string) {
    await supabase.from("chats").delete().eq("id", chatId);
    setChats((prev) => {
      const remaining = prev.filter((c) => c.id !== chatId);
      if (remaining.length === 0) {
        newChat();
        return [];
      }
      return remaining;
    });
    setActiveChatId((prev) => {
      if (prev === chatId) {
        const remaining = chats.filter((c) => c.id !== chatId);
        return remaining[0]?.id || null;
      }
      return prev;
    });
  }

  function stopProcessing() {
    abortRef.current?.abort();
    setLoading(false);
    if (!activeChat) return;
    updateChat(activeChatId!, {
      messages: [...activeChat.messages, { role: "ai", content: "Processing stopped." }],
    });
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);
    setStagedFiles((prev) => {
      const existingNames = prev.map((f) => f.name);
      return [...prev, ...newFiles.filter((f) => !existingNames.includes(f.name))];
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeStagedFile(name: string) {
    setStagedFiles((prev) => prev.filter((f) => f.name !== name));
  }

  async function handleAnalyze() {
    if (stagedFiles.length === 0 || loading || !activeChat) return;

    const formData = new FormData();
    stagedFiles.forEach((f) => formData.append("files", f));
    const docNames = stagedFiles.map((f) => f.name);
    const chatId = activeChatId!;
    const newTitle = activeChat.title === "New chat" ? docNames[0].replace(".pdf", "") : activeChat.title;

    await supabase.from("chats").update({ title: newTitle }).eq("id", chatId);
    await supabase.from("research_documents").insert(docNames.map((name) => ({ chat_id: chatId, name })));

    const analyzingMsg: Message = { role: "ai", content: `Analyzing ${docNames.length} paper(s)... this may take a minute.` };
    await supabase.from("messages").insert({ chat_id: chatId, role: "ai", content: analyzingMsg.content });

    updateChat(chatId, {
      docs: [...activeChat.docs, ...docNames],
      title: newTitle,
      messages: [...activeChat.messages, analyzingMsg],
    });

    setStagedFiles([]);
    setAnalyzing(true);

    try {
      abortRef.current = new AbortController();
      const res = await fetch(`${BACKEND_URL}/analyze`, {
        method: "POST",
        body: formData,
        signal: abortRef.current.signal,
      });

      const data = await res.json();
      const report = data.report;

      const summary = `Analysis complete.\n\nGaps found: ${report.gaps.length} papers analyzed.\n\nKey synthesis:\n${report.synthesis.slice(0, 400)}...\n\nYou can now ask me anything about these papers.`;

      await supabase.from("messages").insert({ chat_id: chatId, role: "ai", content: summary });

      if (report.edge_scores?.length > 0) {
        await supabase.from("edge_scores").insert(
          report.edge_scores.map((e: EdgeScore) => ({
            chat_id: chatId,
            paper_a: e.paper_a,
            paper_b: e.paper_b,
            strength: e.strength,
            reason: e.reason || null,
          }))
        );
      }

      updateChat(chatId, {
        messages: [...activeChat.messages, analyzingMsg, { role: "ai", content: summary }],
        edgeScores: report.edge_scores || [],
      });
    } catch {
      const errMsg = "Something went wrong during analysis. Please try again.";
      await supabase.from("messages").insert({ chat_id: chatId, role: "ai", content: errMsg });
      updateChat(chatId, {
        messages: [...activeChat.messages, { role: "ai", content: errMsg }],
      });
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || loading || !activeChat) return;

    const userMsg: Message = { role: "user", content: input };
    const chatId = activeChatId!;

    await supabase.from("messages").insert({ chat_id: chatId, role: "user", content: input });
    updateChat(chatId, { messages: [...activeChat.messages, userMsg] });
    setInput("");
    setLoading(true);

    try {
      const context = activeChat.messages
        .filter((m) => m.role === "ai")
        .slice(-5)
        .map((m) => m.content)
        .join("\n\n");

      const res = await fetch(`/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: input, context }),
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      updateChat(chatId, {
        messages: [...activeChat.messages, userMsg, { role: "ai", content: "" }],
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setChats((prev) =>
          prev.map((c) => {
            if (c.id !== chatId) return c;
            const msgs = [...c.messages];
            msgs[msgs.length - 1] = { role: "ai", content: fullText };
            return { ...c, messages: msgs };
          })
        );
      }

      await supabase.from("messages").insert({ chat_id: chatId, role: "ai", content: fullText });

    } catch {
      const errMsg = "Something went wrong. Please try again.";
      await supabase.from("messages").insert({ chat_id: chatId, role: "ai", content: errMsg });
      updateChat(chatId, {
        messages: [...activeChat.messages, userMsg, { role: "ai", content: errMsg }],
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function startLeftResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;
    function onMove(e: MouseEvent) {
      const newWidth = Math.min(320, Math.max(160, startWidth + e.clientX - startX));
      setLeftWidth(newWidth);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startRightResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightWidth;
    function onMove(e: MouseEvent) {
      const newWidth = Math.min(400, Math.max(160, startWidth - e.clientX + startX));
      setRightWidth(newWidth);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const nodes = (activeChat?.docs || []).map((doc, i) => {
    const total = activeChat!.docs.length;
    const angle = (2 * Math.PI * i) / total - Math.PI / 2;
    const cx = 120;
    const cy = 160;
    const r = total <= 2 ? 60 : total <= 4 ? 80 : 100;
    return {
      id: i,
      label: doc.replace(".pdf", "").slice(0, 10),
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  });

  const edgeScores: EdgeScore[] = activeChat?.edgeScores || [];

  if (authLoading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", color: "var(--text-muted)", fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  if (!user) return null;

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-primary)", overflow: "hidden" }}>

      {/* Sidebar */}
      <div style={{ width: leftWidth, borderRight: "0.5px solid var(--border)", background: "var(--bg-secondary)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "14px 14px 10px", borderBottom: "0.5px solid var(--border)" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Research Copilot</div>
          <button onClick={newChat} style={{ marginTop: 8, width: "100%", padding: "7px 10px", background: "var(--accent)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            + New chat
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {chats.map((c) => (
            <div
              key={c.id}
              style={{ position: "relative", borderRadius: 8, marginBottom: 2, background: c.id === activeChatId ? "var(--accent-light)" : "transparent" }}
              onMouseLeave={() => setMenuOpenId(null)}
            >
              {renamingId === c.id ? (
                <div style={{ display: "flex", alignItems: "center", padding: "6px 8px", gap: 6 }}>
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        await supabase.from("chats").update({ title: renameValue }).eq("id", c.id);
                        updateChat(c.id, { title: renameValue });
                        setRenamingId(null);
                      }
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    style={{ flex: 1, fontSize: 12, padding: "4px 8px", border: "0.5px solid var(--accent)", borderRadius: 6, background: "var(--bg-card)", color: "var(--text-primary)", outline: "none" }}
                  />
                  <span
                    onClick={async () => {
                      await supabase.from("chats").update({ title: renameValue }).eq("id", c.id);
                      updateChat(c.id, { title: renameValue });
                      setRenamingId(null);
                    }}
                    style={{ fontSize: 11, color: "var(--accent)", cursor: "pointer", flexShrink: 0 }}
                  >✓</span>
                  <span onClick={() => setRenamingId(null)} style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer", flexShrink: 0 }}>✕</span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div onClick={() => setActiveChatId(c.id)} style={{ flex: 1, padding: "8px 10px", cursor: "pointer" }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{c.title}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{c.docs.length} paper{c.docs.length !== 1 ? "s" : ""}</div>
                  </div>
                  <span
                    onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === c.id ? null : c.id); }}
                    style={{ fontSize: 14, color: "var(--text-muted)", cursor: "pointer", padding: "0 10px", flexShrink: 0, userSelect: "none" }}
                  >⋯</span>
                </div>
              )}

              {menuOpenId === c.id && (
                <div style={{
                  position: "absolute", right: 8, top: 32, zIndex: 100,
                  background: "var(--bg-card)", border: "0.5px solid var(--border)",
                  borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: 120, overflow: "hidden"
                }}>
                  <div
                    onClick={() => { setRenamingId(c.id); setRenameValue(c.title); setMenuOpenId(null); }}
                    style={{ padding: "9px 14px", fontSize: 12, color: "var(--text-primary)", cursor: "pointer", borderBottom: "0.5px solid var(--border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-light)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    ✏️ Rename
                  </div>
                  <div
                    onClick={() => { setDeleteConfirm({ type: "chat", chatId: c.id }); setMenuOpenId(null); }}
                    style={{ padding: "9px 14px", fontSize: 12, color: "#cc0000", cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#fff0f0")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    🗑️ Delete
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {activeChat && activeChat.docs.length > 0 && (
          <div style={{ borderTop: "0.5px solid var(--border)", padding: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 500 }}>Documents</div>
            {activeChat.docs.map((doc, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 6px", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "var(--accent)" }}>📄</span>
                <span style={{ flex: 1, fontSize: 11, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc}</span>
                <span
                  onClick={() => setDeleteConfirm({ type: "doc", chatId: activeChatId!, docName: doc })}
                  style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer", flexShrink: 0 }}
                >✕</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: "0.5px solid var(--border)", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{user.email}</div>
          <span onClick={handleLogout} style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer", flexShrink: 0 }}>Sign out</span>
        </div>
      </div>

      {/* Left resize handle */}
      <div
        onMouseDown={startLeftResize}
        style={{ width: 4, cursor: "col-resize", background: "transparent", flexShrink: 0, transition: "background 0.15s" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      />

      {/* Main chat */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "0.5px solid var(--border)", background: "var(--bg-secondary)" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>{activeChat?.title || "Research Copilot"}</div>
          <button onClick={() => setDark(!dark)} style={{ padding: "5px 12px", border: "0.5px solid var(--border)", borderRadius: 8, background: "transparent", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>
            {dark ? "☀ Light" : "☾ Dark"}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {activeChat && activeChat.messages.length === 0 && stagedFiles.length === 0 && (
            <div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📚</div>
              <div style={{ fontWeight: 500, marginBottom: 6, color: "var(--text-secondary)" }}>Upload research papers to begin</div>
              <div>Select PDFs below, then click Analyze to run the pipeline.</div>
            </div>
          )}
          {(activeChat?.messages || []).map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "75%", padding: "9px 13px", borderRadius: 12, fontSize: 13, lineHeight: 1.6, background: m.role === "user" ? "var(--accent)" : "var(--bg-card)", color: m.role === "user" ? "#fff" : "var(--text-primary)", border: m.role === "ai" ? "0.5px solid var(--border)" : "none", borderBottomRightRadius: m.role === "user" ? 4 : 12, borderBottomLeftRadius: m.role === "ai" ? 4 : 12, whiteSpace: "pre-wrap" }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && !analyzing && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ padding: "9px 13px", borderRadius: 12, fontSize: 13, background: "var(--bg-card)", border: "0.5px solid var(--border)", color: "var(--text-muted)" }}>Thinking...</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {stagedFiles.length > 0 && (
          <div style={{ padding: "8px 16px", borderTop: "0.5px solid var(--border)", background: "var(--bg-card)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>Ready to analyze:</span>
            {stagedFiles.map((f) => (
              <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "var(--accent-light)", border: "0.5px solid var(--accent)", borderRadius: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-primary)" }}>{f.name}</span>
                <span onClick={() => removeStagedFile(f.name)} style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer", marginLeft: 2 }}>✕</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: "10px 16px", borderTop: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 8, background: "var(--bg-secondary)" }}>
          <input ref={fileRef} type="file" accept=".pdf" multiple style={{ display: "none" }} onChange={handleFileSelect} />
          <button onClick={() => fileRef.current?.click()} disabled={loading} style={{ padding: "7px 12px", border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
            📎 Upload PDF
          </button>
          {stagedFiles.length > 0 && (
            <button onClick={handleAnalyze} disabled={loading} style={{ padding: "7px 14px", background: "var(--accent)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
              Analyze {stagedFiles.length} paper{stagedFiles.length !== 1 ? "s" : ""}
            </button>
          )}
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => !analyzing && e.key === "Enter" && handleSend()} placeholder={analyzing ? "Analyzing papers..." : "Ask about your papers..."} style={{ flex: 1, padding: "8px 12px", border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text-primary)", fontSize: 13, outline: "none", opacity: analyzing ? 0.5 : 1 }} />
          {loading && !analyzing ? (
            <button onClick={stopProcessing} style={{ padding: "7px 14px", background: "#cc0000", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", flexShrink: 0 }}>Stop</button>
          ) : (
            <button onClick={handleSend} disabled={analyzing} style={{ padding: "7px 14px", background: "var(--accent)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 500, cursor: analyzing ? "not-allowed" : "pointer", opacity: analyzing ? 0.5 : 1, flexShrink: 0 }}>Send</button>
          )}
        </div>
      </div>

      {/* Right resize handle */}
      <div
        onMouseDown={startRightResize}
        style={{ width: 4, cursor: "col-resize", background: "transparent", flexShrink: 0, transition: "background 0.15s" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      />

      {/* Graph panel */}
      <div style={{ width: rightWidth, borderLeft: "0.5px solid var(--border)", background: "var(--bg-secondary)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--border)" }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>Paper connections</div>
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          <svg width="100%" height="100%" viewBox="0 0 240 340" style={{ overflow: "visible" }}>
            {edgeScores.length > 0
              ? edgeScores.map((e, i) => {
                  const a = nodes[e.paper_a];
                  const b = nodes[e.paper_b];
                  if (!a || !b) return null;
                  const thickness = Math.max(1, e.strength * 6);
                  const midX = (a.x + b.x) / 2;
                  const midY = (a.y + b.y) / 2;
                  const isHovered = hoveredEdge === i;
                  const isSelected = selectedEdge === i;
                  const isNodeHighlighted =
                    selectedNode !== null &&
                    (e.paper_a === selectedNode || e.paper_b === selectedNode);
                  const isDimmed = selectedNode !== null && !isNodeHighlighted;

                  return (
                    <g key={i}>
                      <line
                        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                        stroke="transparent"
                        strokeWidth={14}
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => setHoveredEdge(i)}
                        onMouseLeave={() => setHoveredEdge(null)}
                        onClick={() => setSelectedEdge(selectedEdge === i ? null : i)}
                      />
                      <line
                        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                        stroke="var(--accent)"
                        strokeWidth={isSelected || isNodeHighlighted ? thickness + 2 : thickness}
                        strokeOpacity={
                          isDimmed ? 0.1
                          : isSelected || isNodeHighlighted ? 1
                          : isHovered ? 0.9
                          : 0.4 + e.strength * 0.5
                        }
                        style={{ pointerEvents: "none" }}
                      />
                      {isHovered && !isSelected && (
                        <g>
                          <rect x={midX - 18} y={midY - 10} width={36} height={18} rx={4} fill="var(--bg-card)" stroke="var(--accent)" strokeWidth={0.5} />
                          <text x={midX} y={midY + 4} textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--accent)">{e.strength.toFixed(2)}</text>
                        </g>
                      )}
                    </g>
                  );
                })
              : nodes.length > 1 && nodes.map((n, i) =>
                  nodes.slice(i + 1).map((m, j) => (
                    <line key={`${i}-${j}`} x1={n.x} y1={n.y} x2={m.x} y2={m.y} stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.3" />
                  ))
                )
            }

            {nodes.map((n) => {
              const isSelected = selectedNode === n.id;
              const isDimmed = selectedNode !== null && !isSelected;
              return (
                <g
                  key={n.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setSelectedNode(selectedNode === n.id ? null : n.id);
                    setSelectedEdge(null);
                  }}
                >
                  <circle
                    cx={n.x} cy={n.y} r="24"
                    fill={isSelected ? "var(--accent)" : "var(--accent-light)"}
                    stroke="var(--accent)"
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    opacity={isDimmed ? 0.3 : 1}
                  />
                  <text
                    x={n.x} y={n.y + 4}
                    textAnchor="middle"
                    fontSize="8"
                    fill={isSelected ? "#fff" : "var(--text-secondary)"}
                    opacity={isDimmed ? 0.3 : 1}
                  >{n.label}</text>
                </g>
              );
            })}

            {nodes.length === 0 && (
              <text x="120" y="170" textAnchor="middle" fontSize="11" fill="var(--text-muted)">Upload papers to see connections</text>
            )}
          </svg>

          {selectedEdge !== null && edgeScores[selectedEdge] && (
            <div style={{
              position: "absolute", bottom: 8, left: 8, right: 8,
              background: "var(--bg-card)", border: "0.5px solid var(--accent)",
              borderRadius: 10, padding: "10px 12px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)" }}>
                  Paper {edgeScores[selectedEdge].paper_a + 1} ↔ Paper {edgeScores[selectedEdge].paper_b + 1}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)" }}>
                    {edgeScores[selectedEdge].strength.toFixed(2)}
                  </div>
                  <span onClick={() => setSelectedEdge(null)} style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>✕</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-primary)", lineHeight: 1.5 }}>
                {edgeScores[selectedEdge].reason || "No reason provided."}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "8px 14px", borderTop: "0.5px solid var(--border)", fontSize: 11, color: "var(--text-muted)" }}>
          Click node to highlight · Click edge for details
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            background: "var(--bg-card)", border: "0.5px solid var(--border)",
            borderRadius: 16, padding: 28, maxWidth: 380, width: "90%",
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
          }}>
            <div style={{ fontSize: 28, marginBottom: 12, textAlign: "center" }}>⚠️</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10, textAlign: "center" }}>
              {deleteConfirm.type === "chat" ? "Delete chat?" : "Delete document?"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, textAlign: "center", marginBottom: 24 }}>
              {deleteConfirm.type === "chat"
                ? `"${chats.find(c => c.id === deleteConfirm.chatId)?.title || "This chat"}" and all its messages, documents, and connection data will be permanently deleted.`
                : `"${deleteConfirm.docName}" will be removed. This cannot be undone.`
              }
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{ flex: 1, padding: "9px", border: "0.5px solid var(--border)", borderRadius: 8, background: "transparent", color: "var(--text-primary)", fontSize: 13, cursor: "pointer", fontWeight: 500 }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (deleteConfirm.type === "chat") {
                    await deleteChat(deleteConfirm.chatId);
                  } else if (deleteConfirm.type === "doc" && deleteConfirm.docName) {
                    await deleteDoc(deleteConfirm.chatId, deleteConfirm.docName);
                  }
                  setDeleteConfirm(null);
                }}
                style={{ flex: 1, padding: "9px", border: "none", borderRadius: 8, background: "#cc0000", color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600 }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}