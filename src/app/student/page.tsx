"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Lesson = {
  id: string;
  subject: string;
  starts_at: string;
  notes: string;
};

type ChecklistItem = {
  id: string;
  text: string;
  lesson_id: string;
};

export default function StudentPage() {
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return router.push("/login");

      const { data: lessonData } = await supabase
        .from("lessons")
        .select("id, subject, starts_at, notes")
        .order("starts_at", { ascending: true });
      setLessons((lessonData as Lesson[]) ?? []);

      const { data: itemData } = await supabase
        .from("checklist_items")
        .select("id, text, lesson_id")
        .order("sort_order", { ascending: true });
      const itemsArr = (itemData as ChecklistItem[]) ?? [];
      setItems(itemsArr);

      const { data: completionData } = await supabase
        .from("checklist_completions")
        .select("checklist_item_id, completed");

      const map: Record<string, boolean> = {};
      (completionData ?? []).forEach((c: any) => (map[c.checklist_item_id] = c.completed));
      setDoneMap(map);
    }

    load();
  }, [router]);

  async function toggle(itemId: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return;

    const next = !(doneMap[itemId] ?? false);
    setDoneMap((m) => ({ ...m, [itemId]: next }));

    await supabase.from("checklist_completions").upsert({
      checklist_item_id: itemId,
      student_user_id: user.id,
      completed: next,
      updated_at: new Date().toISOString(),
    });
  }

  return (
    <main className="p-8 max-w-3xl mx-auto">
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

      <div className="mt-6 space-y-4">
        {lessons.map((l) => (
          <div key={l.id} className="border rounded p-4">
            <div className="font-medium">{l.subject}</div>
            <div className="text-sm text-gray-600">
              {new Date(l.starts_at).toLocaleString()}
            </div>

            <div className="mt-2 text-sm">
              <span className="font-medium">Notes:</span>{" "}
              {l.notes || "No notes yet."}
            </div>

            <div className="mt-3">
              <div className="text-sm font-medium">Checklist</div>
              <div className="mt-2 space-y-2">
                {items.filter((it) => it.lesson_id === l.id).map((it) => (
                  <label key={it.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={doneMap[it.id] ?? false}
                      onChange={() => toggle(it.id)}
                    />
                    {it.text}
                  </label>
                ))}
                {items.filter((it) => it.lesson_id === l.id).length === 0 && (
                  <div className="text-sm text-gray-500">No checklist yet.</div>
                )}
              </div>
            </div>
          </div>
        ))}
        {lessons.length === 0 && (
          <div className="text-sm text-gray-500">No lessons yet.</div>
        )}
      </div>
    </main>
  );
}