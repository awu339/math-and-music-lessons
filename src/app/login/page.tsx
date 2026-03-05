"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type AuthMode = "teacher" | "student";

type StudentAuthAction = "login" | "signup";

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function usernameToEmail(username: string) {
  return `${username}@students.local`;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("teacher");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [studentPassword, setStudentPassword] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.push("/app");
      }
    }

    checkSession();
  }, [router]);

  async function signInTeacher(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setBusy(false);
    if (error) return setMsg(error.message);
    router.push("/app");
  }

  async function runStudentAuth(e: React.SyntheticEvent, action: StudentAuthAction) {
    e.preventDefault();
    setMsg(null);

    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) return setMsg("Username is required (letters, numbers, underscore).\n");
    if (normalizedUsername.length < 3) return setMsg("Username must be at least 3 characters.");
    if (!studentPassword || studentPassword.length < 6) {
      return setMsg("Password must be at least 6 characters.");
    }

    const syntheticEmail = usernameToEmail(normalizedUsername);

    setBusy(true);

    if (action === "signup") {
      const cleanName = fullName.trim();
      if (!cleanName) {
        setBusy(false);
        return setMsg("Full name is required.");
      }

      const signUpRes = await fetch("/api/student-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: cleanName,
          username: normalizedUsername,
          password: studentPassword,
        }),
      });
      const signUpJson = (await signUpRes.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!signUpRes.ok) {
        setBusy(false);
        return setMsg(signUpJson?.error ?? "Unable to create account.");
      }
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: syntheticEmail,
      password: studentPassword,
    });

    setBusy(false);
    if (signInError) return setMsg(signInError.message);

    router.push("/app");
  }

  return (
    <main className="p-8 max-w-md mx-auto">
      <h1 className="text-xl font-semibold">Math and Music Lessons</h1>

      <div className="mt-6 inline-flex rounded border overflow-hidden text-sm">
        <button
          type="button"
          className={`px-3 py-2 ${mode === "teacher" ? "bg-black text-white" : "bg-white"}`}
          onClick={() => {
            setMode("teacher");
            setMsg(null);
          }}
        >
          Teacher Sign In
        </button>
        <button
          type="button"
          className={`px-3 py-2 ${mode === "student" ? "bg-black text-white" : "bg-white"}`}
          onClick={() => {
            setMode("student");
            setMsg(null);
          }}
        >
          Student Login / Sign Up
        </button>
      </div>

      {mode === "teacher" ? (
        <form onSubmit={signInTeacher} className="mt-6 space-y-3">
          <input
            className="w-full border rounded p-2"
            placeholder="Teacher email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full border rounded p-2"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button disabled={busy} className="w-full rounded bg-black text-white py-2 disabled:opacity-60">
            {busy ? "Signing in..." : "Sign In"}
          </button>
        </form>
      ) : (
        <form className="mt-6 space-y-3">
          <input
            className="w-full border rounded p-2"
            placeholder="Full name (for sign up)"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <input
            className="w-full border rounded p-2"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="w-full border rounded p-2"
            placeholder="Password"
            type="password"
            value={studentPassword}
            onChange={(e) => setStudentPassword(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              className="rounded border py-2 disabled:opacity-60"
              onClick={(e) => runStudentAuth(e, "login")}
            >
              {busy ? "Working..." : "Log In"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded bg-black text-white py-2 disabled:opacity-60"
              onClick={(e) => runStudentAuth(e, "signup")}
            >
              {busy ? "Working..." : "Create Account"}
            </button>
          </div>

          <p className="text-xs text-gray-600">
            Student auth uses username + password and does not send confirmation emails.
          </p>
        </form>
      )}

      {msg && <p className="mt-4 text-sm text-red-600 whitespace-pre-wrap">{msg}</p>}
    </main>
  );
}