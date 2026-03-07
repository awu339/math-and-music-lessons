"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type StudentRow = {
  id: string;
  full_name: string;
};

function toLocalInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export default function TeacherNewLessonPage() {
  const router = useRouter();

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentId, setStudentId] = useState("");
  const [subject, setSubject] = useState("Lesson");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function load() {
      setMsg(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        router.push("/login");
        return;
      }

      const query = new URLSearchParams(window.location.search);
      const startParam = query.get("start");
      const endParam = query.get("end");
      const startDate = startParam ? new Date(startParam) : new Date();
      const endDate = endParam
        ? new Date(endParam)
        : new Date(startDate.getTime() + 60 * 60_000);

      setStartsAt(toLocalInputValue(startDate));
      setEndsAt(toLocalInputValue(endDate));

      const { data, error } = await supabase
        .from("students")
        .select("id, full_name")
        .eq("teacher_id", user.id)
        .order("full_name", { ascending: true });

      if (error) return setMsg(error.message);
      const rows = (data as StudentRow[]) ?? [];
      setStudents(rows);
      if (rows.length > 0) setStudentId(rows[0].id);
    }

    load();
  }, [router]);

  const durationMinutes = useMemo(() => {
    if (!startsAt || !endsAt) return 0;
    const diffMs = new Date(endsAt).getTime() - new Date(startsAt).getTime();
    return Math.round(diffMs / 60_000);
  }, [startsAt, endsAt]);

  async function createLesson(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!studentId) return setMsg("Select a student.");
    if (!startsAt || !endsAt) return setMsg("Choose start and end time.");

    const startIso = new Date(startsAt);
    const endIso = new Date(endsAt);
    if (Number.isNaN(startIso.getTime()) || Number.isNaN(endIso.getTime())) {
      return setMsg("Invalid date/time.");
    }

    const minutes = Math.round((endIso.getTime() - startIso.getTime()) / 60_000);
    if (minutes <= 0) return setMsg("End time must be after start time.");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      router.push("/login");
      return;
    }

    setBusy(true);

    const { data, error } = await supabase
      .from("lessons")
      .insert({
        teacher_id: user.id,
        student_id: studentId,
        subject: subject.trim() || "Lesson",
        starts_at: startIso.toISOString(),
        duration_minutes: minutes,
        notes: "",
      })
      .select("id")
      .single();

    setBusy(false);
    if (error) return setMsg(error.message);

    router.push(`/teacher/lessons/${data.id}`);
  }

  return (
    <main className="p-8 max-w-xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Create Lesson</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link className="underline" href="/teacher/lessons">
            Lessons
          </Link>
          <Link className="underline" href="/teacher">
            Back to Calendar
          </Link>
        </div>
      </div>

      {msg && <p className="mt-4 text-sm text-red-600">{msg}</p>}

      <form onSubmit={createLesson} className="mt-6 grid gap-3">
        <label className="text-sm">
          Student
          <select
            className="w-full border rounded p-2 mt-1"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          Subject
          <input
            className="w-full border rounded p-2 mt-1"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>

        <label className="text-sm">
          Start
          <input
            className="w-full border rounded p-2 mt-1"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </label>

        <label className="text-sm">
          End
          <input
            className="w-full border rounded p-2 mt-1"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </label>

        <p className="text-sm text-gray-600">Duration: {durationMinutes > 0 ? durationMinutes : 0} minutes</p>

        <button disabled={busy} className="rounded bg-black text-white py-2 disabled:opacity-60">
          {busy ? "Creating..." : "Create Lesson"}
        </button>
      </form>
    </main>
  );
}