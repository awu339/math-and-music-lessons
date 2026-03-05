"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type LessonRow = {
  id: string;
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

export default function TeacherStudentDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ studentID?: string | string[] }>();
  const studentId = Array.isArray(params.studentID)
    ? params.studentID[0]
    : params.studentID;

  const highlightedLessonId = searchParams.get("lessonId") ?? "";

  const [studentName, setStudentName] = useState<string>("");
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const [completedItemIds, setCompletedItemIds] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  const [subject, setSubject] = useState("Piano");
  const [lessonDate, setLessonDate] = useState("");
  const [lessonTime, setLessonTime] = useState("16:00");
  const [duration, setDuration] = useState(60);

  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  const [assignmentText, setAssignmentText] = useState("");
  const [assignmentLessonId, setAssignmentLessonId] = useState<string>("");

  function isValidUuid(value?: string) {
    if (!value) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    );
  }

  async function requireAuth() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.push("/login");
      return null;
    }
    return data.session.user;
  }

  async function loadAll() {
    setMsg(null);
    if (!isValidUuid(studentId)) {
      setMsg("Invalid student id.");
      return;
    }

    const user = await requireAuth();
    if (!user) return;

    const { data: student, error: sErr } = await supabase
      .from("students")
      .select("full_name, student_user_id")
      .eq("id", studentId)
      .single();

    if (sErr) return setMsg(sErr.message);
    setStudentName(student?.full_name ?? "");

    const selectedStudentUserId = student?.student_user_id as string | undefined;

    const { data: lessonData, error: lErr } = await supabase
      .from("lessons")
      .select("id, subject, starts_at, duration_minutes, notes")
      .eq("student_id", studentId)
      .order("starts_at", { ascending: true });

    if (lErr) return setMsg(lErr.message);
    const loadedLessons = (lessonData as LessonRow[]) ?? [];
    setLessons(loadedLessons);

    if (!assignmentLessonId && loadedLessons.length > 0) {
      setAssignmentLessonId(loadedLessons[0].id);
    }

    const { data: cData, error: cErr } = await supabase
      .from("checklist_items")
      .select("id, lesson_id, text, sort_order")
      .order("sort_order", { ascending: true });

    if (cErr) return setMsg(cErr.message);
    const loadedChecklist = (cData as ChecklistRow[]) ?? [];
    setChecklist(loadedChecklist);

    const checklistIds = loadedChecklist.map((c) => c.id);
    if (!selectedStudentUserId || checklistIds.length === 0) {
      setCompletedItemIds(new Set());
      return;
    }

    const { data: completionData, error: completionErr } = await supabase
      .from("checklist_completions")
      .select("checklist_item_id, completed")
      .eq("student_user_id", selectedStudentUserId)
      .in("checklist_item_id", checklistIds);

    if (completionErr) return setMsg(completionErr.message);

    const completed = new Set<string>();
    ((completionData as CompletionRow[]) ?? []).forEach((row) => {
      if (row.completed) completed.add(row.checklist_item_id);
    });
    setCompletedItemIds(completed);
  }

  async function createLesson(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!isValidUuid(studentId)) {
      return setMsg("Invalid student id.");
    }

    const user = await requireAuth();
    if (!user) return;

    if (!lessonDate) return setMsg("Choose a lesson date.");

    const localDateTime = new Date(`${lessonDate}T${lessonTime || "00:00"}:00`);
    if (Number.isNaN(localDateTime.getTime())) {
      return setMsg("Invalid date/time.");
    }

    const { error } = await supabase.from("lessons").insert({
      teacher_id: user.id,
      student_id: studentId,
      subject: subject.trim() || "Lesson",
      starts_at: localDateTime.toISOString(),
      duration_minutes: duration,
      notes: "",
    });

    if (error) return setMsg(error.message);

    setLessonDate("");
    setLessonTime("16:00");
    await loadAll();
  }

  function startEditNotes(lesson: LessonRow) {
    setEditingNotesId(lesson.id);
    setNotesDraft(lesson.notes ?? "");
  }

  async function saveNotes() {
    if (!editingNotesId) return;
    setMsg(null);

    const { error } = await supabase
      .from("lessons")
      .update({ notes: notesDraft })
      .eq("id", editingNotesId);

    if (error) return setMsg(error.message);

    setEditingNotesId(null);
    setNotesDraft("");
    await loadAll();
  }

  async function addAssignment(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const text = assignmentText.trim();
    if (!text) return setMsg("Assignment text is required.");
    if (!assignmentLessonId) return setMsg("Pick a lesson to attach this to.");

    const nextSortOrder = checklist.filter((c) => c.lesson_id === assignmentLessonId).length;

    const { error } = await supabase.from("checklist_items").insert({
      lesson_id: assignmentLessonId,
      text,
      sort_order: nextSortOrder,
    });

    if (error) return setMsg(error.message);

    setAssignmentText("");
    await loadAll();
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const lessonsForDropdown = useMemo(() => {
    return lessons.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [lessons]);

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Manage: {studentName || "Student"}</h1>
          <div className="text-sm text-gray-600">Create lessons, add notes, and assign checklist work.</div>
        </div>
        <Link className="underline" href="/teacher/students">
          Back to Students
        </Link>
      </div>

      {msg && <p className="mt-4 text-sm text-red-600">{msg}</p>}

      <section className="mt-6 border rounded p-4">
        <h2 className="font-medium">Schedule a lesson</h2>
        <form onSubmit={createLesson} className="mt-3 grid gap-2">
          <label className="text-sm">
            Subject
            <input
              className="w-full border rounded p-2 mt-1"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Piano / Math / etc."
            />
          </label>

          <label className="text-sm">
            Lesson date
            <input
              className="w-full border rounded p-2 mt-1"
              type="date"
              value={lessonDate}
              onChange={(e) => setLessonDate(e.target.value)}
            />
          </label>

          <label className="text-sm">
            Lesson time
            <input
              className="w-full border rounded p-2 mt-1"
              type="time"
              value={lessonTime}
              onChange={(e) => setLessonTime(e.target.value)}
            />
          </label>

          <label className="text-sm">
            Duration (minutes)
            <input
              className="w-full border rounded p-2 mt-1"
              type="number"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value || "60", 10))}
              min={15}
              step={15}
            />
          </label>

          <button className="rounded bg-black text-white py-2 mt-1">Schedule Lesson</button>
        </form>
      </section>

      <section className="mt-6 border rounded p-4">
        <h2 className="font-medium">Add checklist item</h2>
        <form onSubmit={addAssignment} className="mt-3 grid gap-2">
          <label className="text-sm">
            Attach to lesson
            <select
              className="w-full border rounded p-2 mt-1"
              value={assignmentLessonId}
              onChange={(e) => setAssignmentLessonId(e.target.value)}
            >
              <option value="">Select a lesson...</option>
              {lessonsForDropdown.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.subject} - {new Date(l.starts_at).toLocaleString()}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            Assignment text
            <input
              className="w-full border rounded p-2 mt-1"
              value={assignmentText}
              onChange={(e) => setAssignmentText(e.target.value)}
              placeholder="e.g., Practice scales 10 min/day"
            />
          </label>

          <button className="rounded bg-black text-white py-2 mt-1">Add Assignment</button>
        </form>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">Lessons</h2>

        <div className="mt-3 space-y-3">
          {lessons.map((l) => {
            const lessonItems = checklist.filter((c) => c.lesson_id === l.id);
            const isHighlighted = highlightedLessonId === l.id;

            return (
              <div
                key={l.id}
                className={`border rounded p-4 ${isHighlighted ? "border-black ring-1 ring-black" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">{l.subject}</div>
                    <div className="text-sm text-gray-600">
                      {new Date(l.starts_at).toLocaleString()} - {l.duration_minutes} min
                    </div>
                  </div>

                  <button className="underline text-sm" onClick={() => startEditNotes(l)}>
                    Edit notes
                  </button>
                </div>

                {editingNotesId === l.id ? (
                  <div className="mt-3">
                    <textarea
                      className="w-full border rounded p-2 text-sm"
                      rows={5}
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Lesson notes..."
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        className="rounded bg-black text-white px-4 py-2 text-sm"
                        onClick={saveNotes}
                        type="button"
                      >
                        Save
                      </button>
                      <button
                        className="rounded border px-4 py-2 text-sm"
                        type="button"
                        onClick={() => {
                          setEditingNotesId(null);
                          setNotesDraft("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm">
                    <span className="font-medium">Notes:</span>{" "}
                    {l.notes || <span className="text-gray-500">No notes yet.</span>}
                  </div>
                )}

                <div className="mt-3">
                  <div className="text-sm font-medium">Assignments</div>
                  <div className="mt-2 space-y-1 text-sm">
                    {lessonItems.map((c) => {
                      const isComplete = completedItemIds.has(c.id);
                      return (
                        <div key={c.id} className="flex items-center gap-2">
                          <span>*</span>
                          <span className={isComplete ? "line-through text-gray-500" : ""}>
                            {c.text}
                          </span>
                          {isComplete && <span className="text-xs text-gray-500">(Completed)</span>}
                        </div>
                      );
                    })}
                    {lessonItems.length === 0 && (
                      <div className="text-gray-500">No assignments yet.</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {lessons.length === 0 && <div className="text-sm text-gray-500">No lessons yet.</div>}
        </div>
      </section>
    </main>
  );
}