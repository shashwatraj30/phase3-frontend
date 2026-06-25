"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError("");

    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setError("Check your email to confirm your account, then log in.");
        setIsSignup(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg-primary)",
    }}>
      <div style={{
        width: 360,
        padding: 32,
        background: "var(--bg-card)",
        border: "0.5px solid var(--border)",
        borderRadius: 16,
      }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
          Research Copilot
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 28 }}>
          {isSignup ? "Create your account" : "Sign in to continue"}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            style={{
              padding: "10px 12px",
              border: "0.5px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              fontSize: 13,
              outline: "none",
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            style={{
              padding: "10px 12px",
              border: "0.5px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              fontSize: 13,
              outline: "none",
            }}
          />

          {error && (
            <div style={{ fontSize: 12, color: error.includes("Check your email") ? "green" : "#cc0000" }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: "10px",
              background: "var(--accent)",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
          </button>

          <div
            onClick={() => { setIsSignup(!isSignup); setError(""); }}
            style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", cursor: "pointer" }}
          >
            {isSignup ? "Already have an account? Sign in" : "No account? Sign up"}
          </div>
        </div>
      </div>
    </div>
  );
}