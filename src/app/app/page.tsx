"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AppRoot() {
  const router = useRouter();

  useEffect(() => {
    async function run() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return router.push("/login");

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile) return router.push("/login");

      router.push(profile.role === "teacher" ? "/teacher" : "/student");
    }

    run();
  }, [router]);

  return <main className="p-8">Loading...</main>;
}