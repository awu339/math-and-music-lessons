"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type LessonRow = {
  id: string;
  subject: string;
  starts_at: string;
  duration_minutes: number;
  notes: string;
};

export default function TeacherPage() {
  const router = useRouter();
  const [lessons, setLessons] = useState<LessonRow[]>([]);

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return router.push("/login");

      const { data } = await supabase
        .from("lessons")
        .select("id, subject, starts_at, duration_minutes, notes")
        .order("starts_at", { ascending: true });

      setLessons((data as LessonRow[]) ?? []);
    }
    load();
  }, [router]);

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Teacher Dashboard</h1>
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

      <div className="mt-6 space-y-3">
        {lessons.map((l) => (
          <div key={l.id} className="border rounded p-4">
            <div className="font-medium">{l.subject}</div>
            <div className="text-sm text-gray-600">
              {new Date(l.starts_at).toLocaleString()} • {l.duration_minutes} min
            </div>
            <div className="mt-2 text-sm">
              <span className="font-medium">Notes:</span>{" "}
              {l.notes || "No notes yet."}
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