"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type TeacherStudentRow = {
  id: string;
  teacher_id: string;
  student_user_id: string;
  full_name: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string;
};

type LessonRow = {
  id: string;
  student_id: string;
  subject: string;
  starts_at: string;
  duration_minutes: number;
  notes: string;
};

type ChecklistItem = {
  id: string;
  lesson_id: string;
  text: string;
  sort_order: number;
};

type CompletionRow = {
  checklist_item_id: string;
  completed: boolean;
};

export default function StudentPage() {
  const router = useRouter();

  const [msg, setMsg] = useState<string | null>(null);
  const [teacherLinks, setTeacherLinks] = useState<TeacherStudentRow[]>([]);
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});
  const [activeTeacherId, setActiveTeacherId] = useState<string>("");

  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});

  async function requireAuth() {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      router.push("/login");
      return null;
    }
    return user;
  }

  async function loadTeacherTabs() {
    setMsg(null);
    const user = await requireAuth();
    if (!user) return;

    const { data: linkRows, error: linkErr } = await supabase
      .from("students")
      .select("id, teacher_id, student_user_id, full_name, created_at")
      .eq("student_user_id", user.id)
      .order("created_at", { ascending: true });

    if (linkErr) {
      setMsg(linkErr.message);
      return;
    }

    const links = (linkRows as TeacherStudentRow[]) ?? [];
    setTeacherLinks(links);

    const teacherIds = Array.from(new Set(links.map((l) => l.teacher_id)));
    if (teacherIds.length === 0) {
      setTeacherNames({});
      setActiveTeacherId("");
      setLessons([]);
      setItems([]);
      setDoneMap({});
      return;
    }

    const { data: profileRows, error: profileErr } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", teacherIds);

    if (profileErr) {
      setMsg(profileErr.message);
      return;
    }

    const teacherMap: Record<string, string> = {};
    ((profileRows as ProfileRow[]) ?? []).forEach((p) => {
      teacherMap[p.id] = p.full_name || "Teacher";
    });
    setTeacherNames(teacherMap);

    setActiveTeacherId((current) =>
      current && teacherIds.includes(current) ? current : teacherIds[0]
    );
  }

  async function loadTeacherBoard() {
    const user = await requireAuth();
    if (!user) return;
    if (!activeTeacherId) return;

    const selectedLink = teacherLinks.find((l) => l.teacher_id === activeTeacherId);
    if (!selectedLink) {
      setLessons([]);
      setItems([]);
      setDoneMap({});
      return;
    }

    const { data: lessonData, error: lessonErr } = await supabase
      .from("lessons")
      .select("id, student_id, subject, starts_at, duration_minutes, notes")
      .eq("student_id", selectedLink.id)
      .order("starts_at", { ascending: true });

    if (lessonErr) {
      setMsg(lessonErr.message);
      return;
    }

    const lessonRows = (lessonData as LessonRow[]) ?? [];
    setLessons(lessonRows);

    const lessonIds = lessonRows.map((l) => l.id);
    if (lessonIds.length === 0) {
      setItems([]);
      setDoneMap({});
      return;
    }

    const { data: itemData, error: itemErr } = await supabase
      .from("checklist_items")
      .select("id, lesson_id, text, sort_order")
      .in("lesson_id", lessonIds)
      .order("sort_order", { ascending: true });

    if (itemErr) {
      setMsg(itemErr.message);
      return;
    }

    const itemRows = (itemData as ChecklistItem[]) ?? [];
    setItems(itemRows);

    const itemIds = itemRows.map((i) => i.id);
    if (itemIds.length === 0) {
      setDoneMap({});
      return;
    }

    const { data: completionRows, error: completionErr } = await supabase
      .from("checklist_completions")
      .select("checklist_item_id, completed")
      .eq("student_user_id", user.id)
      .in("checklist_item_id", itemIds);

    if (completionErr) {
      setMsg(completionErr.message);
      return;
    }

    const map: Record<string, boolean> = {};
    ((completionRows as CompletionRow[]) ?? []).forEach((c) => {
      map[c.checklist_item_id] = c.completed;
    });
    setDoneMap(map);
  }

  useEffect(() => {
    loadTeacherTabs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTeacherBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeacherId, teacherLinks]);

  async function toggle(itemId: string) {
    const user = await requireAuth();
    if (!user) return;

    const next = !(doneMap[itemId] ?? false);
    setDoneMap((m) => ({ ...m, [itemId]: next }));

    const { error } = await supabase.from("checklist_completions").upsert(
      {
        checklist_item_id: itemId,
        student_user_id: user.id,
        completed: next,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "checklist_item_id,student_user_id",
      }
    );

    if (error) {
      setMsg(error.message);
      setDoneMap((m) => ({ ...m, [itemId]: !next }));
    }
  }

  const sortedLessons = useMemo(() => {
    return lessons.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [lessons]);

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Student Dashboard</h1>
        <button
          className="underline"
          onClick={async () => {
            await supabase.auth.signOut();
            router.push("/login");
          }}
        >
          Sign out
        </button>
      </div>

      {msg && <p className="mt-4 text-sm text-red-600">{msg}</p>}

      <section className="mt-6">
        <h2 className="font-medium">Teachers</h2>

        <div className="mt-3 flex flex-wrap gap-2">
          {teacherLinks.map((link) => {
            const isActive = link.teacher_id === activeTeacherId;
            return (
              <button
                key={link.id}
                type="button"
                className={`rounded border px-3 py-1 text-sm ${isActive ? "bg-black text-white" : "bg-white"}`}
                onClick={() => setActiveTeacherId(link.teacher_id)}
              >
                {teacherNames[link.teacher_id] ?? "Teacher"}
              </button>
            );
          })}
        </div>

        {teacherLinks.length === 0 && (
          <div className="mt-2 text-sm text-gray-500">
            No teacher has added you yet.
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-medium">
          {activeTeacherId ? `Lessons with ${teacherNames[activeTeacherId] ?? "Teacher"}` : "Lessons"}
        </h2>

        <div className="mt-3 space-y-4">
          {sortedLessons.map((lesson) => {
            const lessonItems = items
              .filter((it) => it.lesson_id === lesson.id)
              .sort((a, b) => a.sort_order - b.sort_order);

            return (
              <div key={lesson.id} className="border rounded p-4">
                <div className="font-medium">{lesson.subject}</div>
                <div className="text-sm text-gray-600">
                  {new Date(lesson.starts_at).toLocaleString()} - {lesson.duration_minutes} min
                </div>

                <div className="mt-2 text-sm">
                  <span className="font-medium">Notes:</span>{" "}
                  {lesson.notes || "No notes yet."}
                </div>

                <div className="mt-3">
                  <div className="text-sm font-medium">Checklist</div>
                  <div className="mt-2 space-y-2">
                    {lessonItems.map((it) => (
                      <label key={it.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={doneMap[it.id] ?? false}
                          onChange={() => toggle(it.id)}
                        />
                        {it.text}
                      </label>
                    ))}
                    {lessonItems.length === 0 && (
                      <div className="text-sm text-gray-500">No checklist items for this lesson.</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {sortedLessons.length === 0 && teacherLinks.length > 0 && (
            <div className="text-sm text-gray-500">No lessons scheduled yet.</div>
          )}
        </div>
      </section>
    </main>
  );
}