"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

type StudentRow = {
  id: string;
  full_name: string;
  created_at: string;
};

export default function TeacherStudentsPage() {
  const router = useRouter();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [fullName, setFullName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function requireAuth() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.push("/login");
      return null;
    }
    return data.session.user;
  }

  async function loadStudents() {
    setMsg(null);
    const user = await requireAuth();
    if (!user) return;

    const { data, error } = await supabase
      .from("students")
      .select("id, full_name, created_at")
      .order("created_at", { ascending: false });

    if (error) setMsg(error.message);
    setStudents((data as StudentRow[]) ?? []);
  }

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const user = await requireAuth();
    if (!user) return;

    const name = fullName.trim();
    if (!name) return setMsg("Student name is required.");

    const { error } = await supabase.from("students").insert({
      teacher_id: user.id,
      full_name: name,
    });

    if (error) return setMsg(error.message);
    setFullName("");
    await loadStudents();
  }

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Students</h1>
        <Link className="underline" href="/teacher">
          Back to Dashboard
        </Link>
      </div>

      <form onSubmit={addStudent} className="mt-6 flex gap-2">
        <input
          className="flex-1 border rounded p-2"
          placeholder="Student full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <button className="rounded bg-black text-white px-4">Add</button>
      </form>

      {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}

      <div className="mt-6 space-y-2">
        {students.map((s) => (
          <div key={s.id} className="border rounded p-3 flex justify-between">
            <div>
              <div className="font-medium">{s.full_name}</div>
              <div className="text-xs text-gray-500">
                Added {new Date(s.created_at).toLocaleString()}
              </div>
            </div>
            <Link className="underline text-sm" href={`/teacher/students/${s.id}`}>
              Manage
            </Link>
          </div>
        ))}
        {students.length === 0 && (
          <div className="text-sm text-gray-500">No students yet.</div>
        )}
      </div>
    </main>
  );
}