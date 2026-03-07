"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";

type LessonRow = {
  id: string;
  student_id: string;
  subject: string;
  starts_at: string;
  duration_minutes: number;
  notes: string;
};

type ChecklistRow = {
  id: string;
  lesson_id: string;
  text: string;
  sort_order: number;
};

type CompletionRow = {
  checklist_item_id: string;
  completed: boolean;
};

type StudentRow = {
  id: string;
  full_name: string;
  student_user_id: string;
};

export default function TeacherLessonDetailPage() {
  const router = useRouter();
  const params = useParams<{ lessonId?: string | string[] }>();
  const lessonId = Array.isArray(params.lessonId) ? params.lessonId[0] : params.lessonId;

  const [lesson, setLesson] = useState<LessonRow | null>(null);
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [items, setItems] = useState<ChecklistRow[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [assignmentText, setAssignmentText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setMsg(null);
    if (!lessonId) return setMsg("Invalid lesson id.");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      router.push("/login");
      return;
    }

    const { data: lessonRow, error: lessonErr } = await supabase
      .from("lessons")
      .select("id, student_id, subject, starts_at, duration_minutes, notes")
      .eq("id", lessonId)
      .single();

    if (lessonErr) return setMsg(lessonErr.message);
    const currentLesson = lessonRow as LessonRow;
    setLesson(currentLesson);

    const { data: studentRow, error: studentErr } = await supabase
      .from("students")
      .select("id, full_name, student_user_id")
      .eq("id", currentLesson.student_id)
      .single();

    if (studentErr) return setMsg(studentErr.message);
    const currentStudent = studentRow as StudentRow;
    setStudent(currentStudent);

    const { data: itemRows, error: itemErr } = await supabase
      .from("checklist_items")
      .select("id, lesson_id, text, sort_order")
      .eq("lesson_id", lessonId)
      .order("sort_order", { ascending: true });

    if (itemErr) return setMsg(itemErr.message);
    const checklist = (itemRows as ChecklistRow[]) ?? [];
    setItems(checklist);

    if (checklist.length === 0) {
      setCompletedIds(new Set());
      return;
    }

    const itemIds = checklist.map((i) => i.id);
    const { data: completionRows, error: completionErr } = await supabase
      .from("checklist_completions")
      .select("checklist_item_id, completed")
      .eq("student_user_id", currentStudent.student_user_id)
      .in("checklist_item_id", itemIds);

    if (completionErr) return setMsg(completionErr.message);

    const done = new Set<string>();
    ((completionRows as CompletionRow[]) ?? []).forEach((row) => {
      if (row.completed) done.add(row.checklist_item_id);
    });
    setCompletedIds(done);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  async function addAssignment(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!lessonId) return setMsg("Invalid lesson id.");

    const text = assignmentText.trim();
    if (!text) return setMsg("Assignment text is required.");

    const { error } = await supabase.from("checklist_items").insert({
      lesson_id: lessonId,
      text,
      sort_order: items.length,
    });

    if (error) return setMsg(error.message);
    setAssignmentText("");
    await load();
  }

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lesson Details</h1>
        <Link className="underline" href="/teacher">
          Back to Calendar
        </Link>
      </div>

      {msg && <p className="mt-4 text-sm text-red-600">{msg}</p>}

      {lesson && (
        <section className="mt-6 border rounded p-4">
          <div className="font-medium text-lg">{lesson.subject}</div>
          <div className="text-sm text-gray-600 mt-1">
            {new Date(lesson.starts_at).toLocaleString()} - {lesson.duration_minutes} min
          </div>
          <div className="text-sm text-gray-600 mt-1">Student: {student?.full_name || "Student"}</div>
          <div className="mt-3 text-sm">
            <span className="font-medium">Notes:</span> {lesson.notes || "No notes yet."}
          </div>
        </section>
      )}

      <section className="mt-6 border rounded p-4">
        <h2 className="font-medium">Assignments</h2>

        <form onSubmit={addAssignment} className="mt-3 flex gap-2">
          <input
            className="flex-1 border rounded p-2"
            value={assignmentText}
            onChange={(e) => setAssignmentText(e.target.value)}
            placeholder="Add an assignment"
          />
          <button className="rounded bg-black text-white px-4">Add</button>
        </form>

        <div className="mt-4 space-y-2 text-sm">
          {items.map((item) => {
            const done = completedIds.has(item.id);
            return (
              <div key={item.id} className="flex items-center gap-2">
                <span>*</span>
                <span className={done ? "line-through text-gray-500" : ""}>{item.text}</span>
                {done && <span className="text-xs text-gray-500">(Completed)</span>}
              </div>
            );
          })}
          {items.length === 0 && <div className="text-gray-500">No assignments yet.</div>}
        </div>
      </section>
    </main>
  );
}