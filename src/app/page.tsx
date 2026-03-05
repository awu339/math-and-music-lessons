"use client";

import Link from "next/link";
import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.push("/app");
      }
    }

    checkSession();
  }, [router]);

  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold">Math and Music Lessons</h1>
      <p className="mt-2 text-gray-600">
        Schedule, lesson notes, and practice checklists.
      </p>
      <div className="mt-6">
        <Link className="underline" href="/login">
          Go to Login
        </Link>
      </div>
    </main>
  );
}