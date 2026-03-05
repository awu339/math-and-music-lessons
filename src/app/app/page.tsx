"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type ProfileRow = {
  id: string;
  role: "teacher" | "student";
  full_name: string | null;
};

export default function AppRoot() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, role, full_name")
        .eq("id", user.id)
        .maybeSingle<ProfileRow>();

      let role: "teacher" | "student" | null = profile?.role ?? null;

      if (!role) {
        const fallbackRole =
          user.user_metadata?.role === "teacher" ? "teacher" : "student";
        const fallbackName =
          (typeof user.user_metadata?.full_name === "string" &&
            user.user_metadata.full_name.trim()) ||
          user.email ||
          "Student";

        const { error: upsertError } = await supabase.from("profiles").upsert({
          id: user.id,
          role: fallbackRole,
          full_name: fallbackName,
        });

        if (upsertError) {
          console.error("Profile bootstrap failed", upsertError);
          setMsg(`Profile setup failed: ${upsertError.message}`);
          return;
        }

        role = fallbackRole;
      }

      router.push(role === "teacher" ? "/teacher" : "/student");
    }

    run();
  }, [router]);

  return <main className="p-8">{msg || "Loading..."}</main>;
}