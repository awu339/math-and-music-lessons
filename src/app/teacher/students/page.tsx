"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

type StudentAccount = {
  id: string;
  full_name: string;
  created_at: string;
};

type TeacherStudentRow = {
  id: string;
  student_user_id: string;
  full_name: string;
  created_at: string;
};

export default function TeacherStudentsPage() {
  const router = useRouter();
  const [allStudents, setAllStudents] = useState<StudentAccount[]>([]);
  const [myStudents, setMyStudents] = useState<TeacherStudentRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

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

    const [{ data: accountRows, error: accountErr }, { data: myRows, error: myErr }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, created_at")
          .eq("role", "student")
          .order("created_at", { ascending: false }),
        supabase
          .from("students")
          .select("id, student_user_id, full_name, created_at")
          .eq("teacher_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

    if (accountErr) {
      setMsg(accountErr.message);
      return;
    }
    if (myErr) {
      setMsg(myErr.message);
      return;
    }

    setAllStudents((accountRows as StudentAccount[]) ?? []);
    setMyStudents((myRows as TeacherStudentRow[]) ?? []);
  }

  async function addToMyStudents(studentUserId: string) {
    setMsg(null);
    setBusyUserId(studentUserId);

    const user = await requireAuth();
    if (!user) {
      setBusyUserId(null);
      return;
    }

    const alreadyExists = myStudents.some((s) => s.student_user_id === studentUserId);
    if (alreadyExists) {
      setMsg("Student is already in your list.");
      setBusyUserId(null);
      return;
    }

    const account = allStudents.find((s) => s.id === studentUserId);
    const fullName = account?.full_name?.trim() || "Student";

    const { error } = await supabase.from("students").insert({
      teacher_id: user.id,
      student_user_id: studentUserId,
      full_name: fullName,
    });

    setBusyUserId(null);
    if (error) return setMsg(error.message);

    await loadStudents();
  }

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myStudentUserIds = useMemo(() => {
    return new Set(myStudents.map((s) => s.student_user_id));
  }, [myStudents]);

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Students</h1>
        <Link className="underline" href="/teacher">
          Back to Dashboard
        </Link>
      </div>

      {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}

      <section className="mt-6">
        <h2 className="font-medium">Your Students</h2>
        <div className="mt-3 space-y-2">
          {myStudents.map((s) => (
            <div key={s.id} className="border rounded p-3 flex justify-between items-center gap-3">
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
          {myStudents.length === 0 && (
            <div className="text-sm text-gray-500">No students selected yet.</div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-medium">All Student Accounts</h2>
        <p className="text-sm text-gray-600 mt-1">
          Students create their own accounts. Select any student to add them to your list.
        </p>

        <div className="mt-3 space-y-2">
          {allStudents.map((s) => {
            const alreadyAdded = myStudentUserIds.has(s.id);
            return (
              <div key={s.id} className="border rounded p-3 flex justify-between items-center gap-3">
                <div>
                  <div className="font-medium">{s.full_name || "Student"}</div>
                  <div className="text-xs text-gray-500">
                    Joined {new Date(s.created_at).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded border px-3 py-1 text-sm disabled:opacity-60"
                  disabled={alreadyAdded || busyUserId === s.id}
                  onClick={() => addToMyStudents(s.id)}
                >
                  {alreadyAdded ? "Added" : busyUserId === s.id ? "Adding..." : "Add to My Students"}
                </button>
              </div>
            );
          })}
          {allStudents.length === 0 && (
            <div className="text-sm text-gray-500">No student accounts yet.</div>
          )}
        </div>
      </section>
    </main>
  );
}