import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function usernameToEmail(username: string) {
  return `${username}@students.local`;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | {
        username?: string;
        password?: string;
        fullName?: string;
      }
    | null;

  const username = normalizeUsername(body?.username ?? "");
  const password = body?.password?.trim() ?? "";
  const fullName = body?.fullName?.trim() ?? "";

  if (!username || username.length < 3) {
    return NextResponse.json(
      { error: "Username must be at least 3 characters." },
      { status: 400 }
    );
  }
  if (!password || password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 }
    );
  }
  if (!fullName) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      {
        error:
          "Server config missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 }
    );
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = usernameToEmail(username);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: "student",
      full_name: fullName,
      username,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { error: profileErr } = await admin.from("profiles").upsert({
    id: data.user.id,
    role: "student",
    full_name: fullName,
    username,
  });

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}