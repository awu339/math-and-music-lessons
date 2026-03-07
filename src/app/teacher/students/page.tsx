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

type LessonLookupRow = {
  student_id: string;
  starts_at: string;
};

export default function TeacherStudentsPage() {
  const router = useRouter();
  const [allStudents, setAllStudents] = useState<StudentAccount[]>([]);
  const [myStudents, setMyStudents] = useState<TeacherStudentRow[]>([]);
  const [nextLessonByStudentId, setNextLessonByStudentId] = useState<Record<string, string>>({});
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

    const myStudentRows = (myRows as TeacherStudentRow[]) ?? [];
    setAllStudents((accountRows as StudentAccount[]) ?? []);
    setMyStudents(myStudentRows);

    const myStudentIds = myStudentRows.map((s) => s.id);
    if (myStudentIds.length === 0) {
      setNextLessonByStudentId({});
      return;
    }

    const { data: lessonRows, error: lessonErr } = await supabase
      .from("lessons")
      .select("student_id, starts_at")
      .in("student_id", myStudentIds)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true });

    if (lessonErr) {
      setMsg(lessonErr.message);
      return;
    }

    const nextMap: Record<string, string> = {};
    ((lessonRows as LessonLookupRow[]) ?? []).forEach((row) => {
      if (!nextMap[row.student_id]) {
        nextMap[row.student_id] = row.starts_at;
      }
    });
    setNextLessonByStudentId(nextMap);
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
    if (error) {
      if (error.code === "23505") {
        return setMsg("That student is already in your students list.");
      }
      return setMsg(error.message);
    }

    await loadStudents();
  }

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myStudentUserIds = useMemo(() => {
    return new Set(myStudents.map((s) => s.student_user_id));
  }, [myStudents]);

  const availableStudents = useMemo(() => {
    return allStudents.filter((s) => !myStudentUserIds.has(s.id));
  }, [allStudents, myStudentUserIds]);

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
          {myStudents.map((s) => {
            const nextLesson = nextLessonByStudentId[s.id];
            return (
              <div key={s.id} className="border rounded p-3 flex justify-between items-center gap-3">
                <div>
                  <div className="font-medium">{s.full_name}</div>
                  <div className="text-xs text-gray-500">
                    {nextLesson
                      ? `Next lesson ${new Date(nextLesson).toLocaleString()}`
                      : "No upcoming lessons"}
                  </div>
                </div>
                <Link className="underline text-sm" href={`/teacher/students/${s.id}`}>
                  Manage
                </Link>
              </div>
            );
          })}
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
          {availableStudents.map((s) => (
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
                disabled={busyUserId === s.id}
                onClick={() => addToMyStudents(s.id)}
              >
                {busyUserId === s.id ? "Adding..." : "Add to My Students"}
              </button>
            </div>
          ))}
          {availableStudents.length === 0 && (
            <div className="text-sm text-gray-500">No unclaimed student accounts right now.</div>
          )}
        </div>
      </section>
    </main>
  );
}