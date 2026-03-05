"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";
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

export default function TeacherStudentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const studentId = params.studentId as string;

  const [studentName, setStudentName] = useState<string>("");
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  // Create lesson form
  const [subject, setSubject] = useState("Piano");
  const [startsAt, setStartsAt] = useState("");
  const [duration, setDuration] = useState(60);

  // Notes editing
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  // Add assignment
  const [assignmentText, setAssignmentText] = useState("");
  const [assignmentLessonId, setAssignmentLessonId] = useState<string>("");

  const lessonMap = useMemo(() => {
    const m: Record<string, LessonRow> = {};
    lessons.forEach((l) => (m[l.id] = l));
    return m;
  }, [lessons]);

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
    const user = await requireAuth();
    if (!user) return;

    // Student name
    const { data: student, error: sErr } = await supabase
      .from("students")
      .select("full_name")
      .eq("id", studentId)
      .single();

    if (sErr) return setMsg(sErr.message);
    setStudentName(student?.full_name ?? "");

    // Lessons for this student
    const { data: lessonData, error: lErr } = await supabase
      .from("lessons")
      .select("id, subject, starts_at, duration_minutes, notes")
      .eq("student_id", studentId)
      .order("starts_at", { ascending: true });

    if (lErr) return setMsg(lErr.message);
    setLessons((lessonData as LessonRow[]) ?? []);

    // Checklist items for all lessons (teacher RLS allows)
    const { data: cData, error: cErr } = await supabase
      .from("checklist_items")
      .select("id, lesson_id, text, sort_order")
      .order("sort_order", { ascending: true });

    if (cErr) return setMsg(cErr.message);
    setChecklist((cData as ChecklistRow[]) ?? []);
  }

  async function createLesson(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const user = await requireAuth();
    if (!user) return;

    if (!startsAt) return setMsg("Choose a start date/time.");

    const { error } = await supabase.from("lessons").insert({
      teacher_id: user.id,
      student_id: studentId,
      subject: subject.trim() || "Lesson",
      starts_at: new Date(startsAt).toISOString(),
      duration_minutes: duration,
      notes: "",
    });

    if (error) return setMsg(error.message);

    setStartsAt("");
    await loadAll();
  }

  async function startEditNotes(lesson: LessonRow) {
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

    const { error } = await supabase.from("checklist_items").insert({
      lesson_id: assignmentLessonId,
      text,
      sort_order: 0,
    });

    if (error) return setMsg(error.message);

    setAssignmentText("");
    await loadAll();
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const lessonsForDropdown = lessons.slice().sort((a, b) =>
    a.starts_at.localeCompare(b.starts_at)
  );

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            Manage: {studentName || "Student"}
          </h1>
          <div className="text-sm text-gray-600">Create lessons, notes, and assignments.</div>
        </div>
        <Link className="underline" href="/teacher/students">
          Back to Students
        </Link>
      </div>

      {msg && <p className="mt-4 text-sm text-red-600">{msg}</p>}

      {/* Create Lesson */}
      <section className="mt-6 border rounded p-4">
        <h2 className="font-medium">Create a lesson</h2>
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
            Start date/time (local)
            <input
              className="w-full border rounded p-2 mt-1"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
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

          <button className="rounded bg-black text-white py-2 mt-1">
            Create Lesson
          </button>
        </form>
      </section>

      {/* Add Assignment */}
      <section className="mt-6 border rounded p-4">
        <h2 className="font-medium">Add assignment (checklist item)</h2>
        <form onSubmit={addAssignment} className="mt-3 grid gap-2">
          <label className="text-sm">
            Attach to lesson
            <select
              className="w-full border rounded p-2 mt-1"
              value={assignmentLessonId}
              onChange={(e) => setAssignmentLessonId(e.target.value)}
            >
              <option value="">Select a lesson…</option>
              {lessonsForDropdown.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.subject} — {new Date(l.starts_at).toLocaleString()}
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

          <button className="rounded bg-black text-white py-2 mt-1">
            Add Assignment
          </button>
        </form>
      </section>

      {/* Lessons list + notes editor */}
      <section className="mt-6">
        <h2 className="font-medium">Lessons</h2>

        <div className="mt-3 space-y-3">
          {lessons.map((l) => (
            <div key={l.id} className="border rounded p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">{l.subject}</div>
                  <div className="text-sm text-gray-600">
                    {new Date(l.starts_at).toLocaleString()} • {l.duration_minutes} min
                  </div>
                </div>

                <button
                  className="underline text-sm"
                  onClick={() => startEditNotes(l)}
                >
                  Edit notes
                </button>
              </div>

              {/* Notes */}
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

              {/* Assignments for this lesson */}
              <div className="mt-3">
                <div className="text-sm font-medium">Assignments</div>
                <div className="mt-2 space-y-1 text-sm">
                  {checklist
                    .filter((c) => c.lesson_id === l.id)
                    .map((c) => (
                      <div key={c.id} className="flex items-center gap-2">
                        <span>•</span>
                        <span>{c.text}</span>
                      </div>
                    ))}
                  {checklist.filter((c) => c.lesson_id === l.id).length === 0 && (
                    <div className="text-gray-500">No assignments yet.</div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {lessons.length === 0 && (
            <div className="text-sm text-gray-500">No lessons yet.</div>
          )}
        </div>
      </section>
    </main>
  );
}