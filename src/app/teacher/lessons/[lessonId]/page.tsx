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

type LearningResource = {
  id: string;
  title: string;
  kind: "song" | "math_book";
};

type ChecklistRow = {
  id: string;
  lesson_id: string;
  text: string;
  sort_order: number;
  resource_id: string | null;
  segment: string | null;
  practice_instructions: string | null;
  resource: LearningResource[] | null;
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

function formatAssignment(item: ChecklistRow) {
  return {
    title: (Array.isArray(item.resource) ? item.resource[0]?.title : undefined) || item.text || "Assignment",
    segment: item.segment?.trim() || "",
    practice: item.practice_instructions?.trim() || "",
  };
}

export default function TeacherLessonDetailPage() {
  const router = useRouter();
  const params = useParams<{ lessonId?: string | string[] }>();
  const lessonId = Array.isArray(params.lessonId) ? params.lessonId[0] : params.lessonId;

  const [lesson, setLesson] = useState<LessonRow | null>(null);
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [items, setItems] = useState<ChecklistRow[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const [assignmentType, setAssignmentType] = useState<"song" | "math_book">("song");
  const [assignmentResourceName, setAssignmentResourceName] = useState("");
  const [assignmentSegment, setAssignmentSegment] = useState("");
  const [assignmentPractice, setAssignmentPractice] = useState("");

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
      .select(
        "id, lesson_id, text, sort_order, resource_id, segment, practice_instructions, resource:learning_resources(id, title, kind)"
      )
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

    const resourceName = assignmentResourceName.trim();
    const segment = assignmentSegment.trim();
    const practice = assignmentPractice.trim();

    if (!resourceName) return setMsg("Song/Book name is required.");

    const { data: resourceRow, error: resourceErr } = await supabase
      .from("learning_resources")
      .upsert(
        {
          kind: assignmentType,
          title: resourceName,
        },
        { onConflict: "kind,title" }
      )
      .select("id")
      .single();

    if (resourceErr) return setMsg(resourceErr.message);

    const { error } = await supabase.from("checklist_items").insert({
      lesson_id: lessonId,
      resource_id: resourceRow.id,
      text: resourceName,
      segment: segment || null,
      practice_instructions: practice || null,
      sort_order: items.length,
    });

    if (error) return setMsg(error.message);

    setAssignmentResourceName("");
    setAssignmentSegment("");
    setAssignmentPractice("");
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

        <form onSubmit={addAssignment} className="mt-3 grid gap-2">
          <label className="text-sm">
            Resource type
            <select
              className="w-full border rounded p-2 mt-1"
              value={assignmentType}
              onChange={(e) => setAssignmentType(e.target.value as "song" | "math_book")}
            >
              <option value="song">Song</option>
              <option value="math_book">Math Book</option>
            </select>
          </label>

          <label className="text-sm">
            Song / Book name
            <input
              className="w-full border rounded p-2 mt-1"
              value={assignmentResourceName}
              onChange={(e) => setAssignmentResourceName(e.target.value)}
              placeholder="e.g., Fur Elise / Singapore Math 4A"
            />
          </label>

          <label className="text-sm">
            Measure numbers / Page numbers
            <input
              className="w-full border rounded p-2 mt-1"
              value={assignmentSegment}
              onChange={(e) => setAssignmentSegment(e.target.value)}
              placeholder="e.g., mm. 12-24 / pp. 31-33"
            />
          </label>

          <label className="text-sm">
            How to practice
            <textarea
              className="w-full border rounded p-2 mt-1 text-sm"
              rows={3}
              value={assignmentPractice}
              onChange={(e) => setAssignmentPractice(e.target.value)}
              placeholder="Practice instructions..."
            />
          </label>

          <button className="rounded bg-black text-white px-4 py-2 mt-1">Add</button>
        </form>

        <div className="mt-3 text-xs text-gray-600">
          Completed: {completedCount}/{items.length}
        </div>

        <div className="mt-4 space-y-2 text-sm">
          {items.map((item) => {
            const done = completedIds.has(item.id);
            const formatted = formatAssignment(item);
            return (
              <div key={item.id} className="border rounded p-2">
                <div className={`font-medium ${done ? "line-through text-gray-500" : ""}`}>
                  {formatted.title}
                </div>
                {formatted.segment && <div className="text-xs text-gray-600">{formatted.segment}</div>}
                {formatted.practice && <div className="text-xs text-gray-700 mt-1">{formatted.practice}</div>}
                {done && <div className="text-xs text-gray-500 mt-1">Completed</div>}
              </div>
            );
          })}
          {items.length === 0 && <div className="text-gray-500">No assignments yet.</div>}
        </div>
      </section>
    </main>
  );
}