"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, EventClickArg, EventMountArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";

type LessonRow = {
  id: string;
  student_id: string;
  subject: string;
  starts_at: string;
  duration_minutes: number;
  checked_in_at: string | null;
};

type StudentMapRow = {
  id: string;
  full_name: string;
};

function getLessonStatus(lesson: LessonRow) {
  const endMs = new Date(lesson.starts_at).getTime() + lesson.duration_minutes * 60_000;
  const isPast = endMs < Date.now();
  const attended = Boolean(lesson.checked_in_at);

  if (!isPast) return { isPast, color: "#2563eb" };
  return { isPast, color: attended ? "#16a34a" : "#dc2626" };
}

export default function TeacherPage() {
  const router = useRouter();
  const calendarRef = useRef<FullCalendar | null>(null);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
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

      const { data: lessonData, error: lessonErr } = await supabase
        .from("lessons")
        .select("id, student_id, subject, starts_at, duration_minutes, checked_in_at")
        .eq("teacher_id", user.id)
        .order("starts_at", { ascending: true });

      if (lessonErr) {
        setMsg(lessonErr.message);
        return;
      }

      const lessonRows = (lessonData as LessonRow[]) ?? [];
      setLessons(lessonRows);

      const studentIds = Array.from(new Set(lessonRows.map((l) => l.student_id)));
      if (studentIds.length === 0) {
        setStudentNames({});
        return;
      }

      const { data: studentRows, error: studentErr } = await supabase
        .from("students")
        .select("id, full_name")
        .in("id", studentIds);

      if (studentErr) {
        setMsg(studentErr.message);
        return;
      }

      const map: Record<string, string> = {};
      ((studentRows as StudentMapRow[]) ?? []).forEach((s) => {
        map[s.id] = s.full_name;
      });
      setStudentNames(map);
    }

    load();
  }, [router]);

  const events = useMemo(() => {
    return lessons.map((lesson) => {
      const status = getLessonStatus(lesson);
      return {
        id: lesson.id,
        title: `${lesson.subject} - ${studentNames[lesson.student_id] ?? "Student"}`,
        start: lesson.starts_at,
        end: new Date(
          new Date(lesson.starts_at).getTime() + lesson.duration_minutes * 60_000
        ).toISOString(),
        backgroundColor: status.color,
        borderColor: status.color,
        textColor: "#ffffff",
        extendedProps: {
          isPast: status.isPast,
        },
      };
    });
  }, [lessons, studentNames]);

  function onEventClick(arg: EventClickArg) {
    router.push(`/teacher/lessons/${arg.event.id}`);
  }

  function onDateClick(arg: DateClickArg) {
    if (arg.view.type === "dayGridMonth") {
      const api = calendarRef.current?.getApi();
      api?.changeView("timeGridDay", arg.date);
      api?.unselect();
    }
  }

  function onSelect(arg: DateSelectArg) {
    if (arg.view.type === "dayGridMonth") {
      const api = calendarRef.current?.getApi();
      api?.changeView("timeGridDay", arg.start);
      api?.unselect();
      return;
    }

    if (arg.view.type !== "timeGridDay" && arg.view.type !== "timeGridWeek") {
      return;
    }

    const start = arg.start.toISOString();
    const end = arg.end.toISOString();
    router.push(
      `/teacher/lessons/new?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    );
  }

  function onEventDidMount(arg: EventMountArg) {
    const isPast = Boolean(arg.event.extendedProps.isPast);
    if (isPast) {
      arg.el.style.textDecoration = "line-through";
    }
  }

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Teacher Calendar</h1>

        <div className="flex items-center gap-4">
          <Link className="underline" href="/teacher/lessons">
            Lessons
          </Link>
          <Link className="underline" href="/teacher/students">
            Students
          </Link>
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
      </div>

      <p className="mt-2 text-sm text-gray-600">
        Upcoming = blue. Past + attended = green. Past + no check-in = red. Past lessons are struck through.
      </p>

      {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}

      <div className="mt-6 border rounded p-3 bg-white">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          events={events}
          selectable
          selectMirror
          dateClick={onDateClick}
          select={onSelect}
          eventClick={onEventClick}
          eventDidMount={onEventDidMount}
          slotDuration="00:15:00"
          snapDuration="00:15:00"
          slotLabelInterval="00:30:00"
          dayMaxEvents={3}
          height="auto"
        />
      </div>
    </main>
  );
}