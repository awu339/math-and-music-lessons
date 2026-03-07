"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";

type LessonRow = {
  id: string;
  student_id: string;
  subject: string;
  starts_at: string;
  duration_minutes: number;
  notes: string;
  checked_in_at: string | null;
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

function toLocalInputValue(iso: string) {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function getLessonStatus(lesson: LessonRow | null) {
  if (!lesson) return { isPast: false, attended: false, colorClass: "bg-blue-500" };

  const endMs = new Date(lesson.starts_at).getTime() + lesson.duration_minutes * 60_000;
  const isPast = endMs < Date.now();
  const attended = Boolean(lesson.checked_in_at);

  if (!isPast) return { isPast, attended, colorClass: "bg-blue-500" };
  if (attended) return { isPast, attended, colorClass: "bg-green-500" };
  return { isPast, attended, colorClass: "bg-red-500" };
}

export default function TeacherLessonDetailPage() {
  const router = useRouter();
  const params = useParams<{ lessonId?: string | string[] }>();
  const lessonId = Array.isArray(params.lessonId) ? params.lessonId[0] : params.lessonId;

  const [lesson, setLesson] = useState<LessonRow | null>(null);
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [items, setItems] = useState<ChecklistRow[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [assignmentText, setAssignmentText] = useState("");
  const [scheduleStartsAt, setScheduleStartsAt] = useState("");
  const [scheduleDuration, setScheduleDuration] = useState(60);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [checkInSaving, setCheckInSaving] = useState(false);
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
      .select("id, student_id, subject, starts_at, duration_minutes, notes, checked_in_at")
      .eq("id", lessonId)
      .single();

    if (lessonErr) return setMsg(lessonErr.message);
    const currentLesson = lessonRow as LessonRow;
    setLesson(currentLesson);
    setScheduleStartsAt(toLocalInputValue(currentLesson.starts_at));
    setScheduleDuration(currentLesson.duration_minutes);

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

  async function toggleCheckIn() {
    if (!lessonId || !lesson) return;

    setMsg(null);
    setCheckInSaving(true);

    const nextCheckedInAt = lesson.checked_in_at ? null : new Date().toISOString();

    const { error } = await supabase
      .from("lessons")
      .update({ checked_in_at: nextCheckedInAt })
      .eq("id", lessonId);

    setCheckInSaving(false);
    if (error) return setMsg(error.message);
    await load();
  }

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!lessonId) return setMsg("Invalid lesson id.");
    if (!scheduleStartsAt) return setMsg("Choose a start date/time.");
    if (!scheduleDuration || scheduleDuration < 15) {
      return setMsg("Duration must be at least 15 minutes.");
    }

    const startsAt = new Date(scheduleStartsAt);
    if (Number.isNaN(startsAt.getTime())) return setMsg("Invalid start date/time.");

    setScheduleSaving(true);

    const { error } = await supabase
      .from("lessons")
      .update({
        starts_at: startsAt.toISOString(),
        duration_minutes: scheduleDuration,
      })
      .eq("id", lessonId);

    setScheduleSaving(false);

    if (error) return setMsg(error.message);
    await load();
  }

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

  const completedCount = useMemo(() => {
    return items.filter((i) => completedIds.has(i.id)).length;
  }, [items, completedIds]);

  const lessonStatus = getLessonStatus(lesson);

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lesson Details</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link className="underline" href="/teacher/lessons">
            Lessons
          </Link>
          <Link className="underline" href="/teacher">
            Calendar
          </Link>
        </div>
      </div>

      {msg && <p className="mt-4 text-sm text-red-600">{msg}</p>}

      {lesson && (
        <section className="mt-6 border rounded p-4">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${lessonStatus.colorClass}`} />
            <div className={`font-medium text-lg ${lessonStatus.isPast ? "line-through" : ""}`}>
              {lesson.subject}
            </div>
          </div>

          <div className={`text-sm text-gray-600 mt-1 ${lessonStatus.isPast ? "line-through" : ""}`}>
            {new Date(lesson.starts_at).toLocaleString()} - {lesson.duration_minutes} min
          </div>

          <div className="text-sm text-gray-600 mt-1">Student: {student?.full_name || "Student"}</div>
          <div className="mt-3 text-sm">
            <span className="font-medium">Notes:</span> {lesson.notes || "No notes yet."}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={toggleCheckIn}
              disabled={checkInSaving}
              className="rounded bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
            >
              {checkInSaving
                ? "Saving..."
                : lesson.checked_in_at
                ? "Undo Check-In"
                : "Check In Student"}
            </button>
            <div className="text-sm text-gray-600">
              {lesson.checked_in_at
                ? `Checked in: ${new Date(lesson.checked_in_at).toLocaleString()}`
                : "Not checked in"}
            </div>
          </div>
        </section>
      )}

      <section className="mt-6 border rounded p-4">
        <h2 className="font-medium">Edit lesson schedule</h2>
        <form onSubmit={saveSchedule} className="mt-3 grid gap-2">
          <label className="text-sm">
            Start
            <input
              className="w-full border rounded p-2 mt-1"
              type="datetime-local"
              value={scheduleStartsAt}
              onChange={(e) => setScheduleStartsAt(e.target.value)}
            />
          </label>

          <label className="text-sm">
            Duration (minutes)
            <input
              className="w-full border rounded p-2 mt-1"
              type="number"
              min={15}
              step={15}
              value={scheduleDuration}
              onChange={(e) => setScheduleDuration(parseInt(e.target.value || "60", 10))}
            />
          </label>

          <button disabled={scheduleSaving} className="rounded bg-black text-white py-2 mt-1 disabled:opacity-60">
            {scheduleSaving ? "Saving..." : "Save Schedule"}
          </button>
        </form>
      </section>

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

        <div className="mt-3 text-xs text-gray-600">
          Completed: {completedCount}/{items.length}
        </div>

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