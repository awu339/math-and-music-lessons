"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type LessonRow = {
  id: string;
  student_id: string;
  subject: string;
  starts_at: string;
  duration_minutes: number;
  notes: string;
  checked_in_at: string | null;
};

type StudentRow = {
  id: string;
  full_name: string;
};

function getLessonStatus(lesson: LessonRow) {
  const endMs = new Date(lesson.starts_at).getTime() + lesson.duration_minutes * 60_000;
  const isPast = endMs < Date.now();
  const attended = Boolean(lesson.checked_in_at);

  if (!isPast) return { isPast, attended, colorClass: "bg-blue-500" };
  if (attended) return { isPast, attended, colorClass: "bg-green-500" };
  return { isPast, attended, colorClass: "bg-red-500" };
}

export default function TeacherLessonsPage() {
  const router = useRouter();
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("all");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setMsg(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        router.push("/login");
        return;
      }

      const [{ data: lessonRows, error: lessonErr }, { data: studentRows, error: studentErr }] =
        await Promise.all([
          supabase
            .from("lessons")
            .select("id, student_id, subject, starts_at, duration_minutes, notes, checked_in_at")
            .eq("teacher_id", user.id)
            .order("starts_at", { ascending: false }),
          supabase
            .from("students")
            .select("id, full_name")
            .eq("teacher_id", user.id)
            .order("full_name", { ascending: true }),
        ]);

      if (lessonErr) return setMsg(lessonErr.message);
      if (studentErr) return setMsg(studentErr.message);

      setLessons((lessonRows as LessonRow[]) ?? []);
      setStudents((studentRows as StudentRow[]) ?? []);
    }

    load();
  }, [router]);

  const studentNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    students.forEach((s) => {
      map[s.id] = s.full_name;
    });
    return map;
  }, [students]);

  const filteredLessons = useMemo(() => {
    if (selectedStudentId === "all") return lessons;
    return lessons.filter((l) => l.student_id === selectedStudentId);
  }, [lessons, selectedStudentId]);

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Lessons</h1>
        <div className="flex items-center gap-4">
          <Link className="underline" href="/teacher">
            Calendar
          </Link>
          <Link className="underline" href="/teacher/students">
            Students
          </Link>
        </div>
      </div>

      {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}

      <div className="mt-6 flex items-center gap-2">
        <label className="text-sm">Filter by student:</label>
        <select
          className="border rounded p-2 text-sm"
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(e.target.value)}
        >
          <option value="all">All students</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 text-sm text-gray-600">{filteredLessons.length} lesson(s)</div>

      <div className="mt-4 space-y-3">
        {filteredLessons.map((lesson) => {
          const status = getLessonStatus(lesson);
          return (
            <Link
              key={lesson.id}
              href={`/teacher/lessons/${lesson.id}`}
              className="block border rounded p-4 hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${status.colorClass}`} />
                <div className={`font-medium ${status.isPast ? "line-through" : ""}`}>{lesson.subject}</div>
              </div>

              <div className={`text-sm text-gray-600 mt-1 ${status.isPast ? "line-through" : ""}`}>
                {new Date(lesson.starts_at).toLocaleString()} - {lesson.duration_minutes} min
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Student: {studentNameMap[lesson.student_id] ?? "Student"}
              </div>
              <div className="mt-2 text-sm text-gray-700">
                {lesson.notes ? lesson.notes : "No notes yet."}
              </div>
            </Link>
          );
        })}

        {filteredLessons.length === 0 && (
          <div className="text-sm text-gray-500">No lessons match this filter.</div>
        )}
      </div>
    </main>
  );
}