import Link from "next/link";

export default function Home() {
  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold">Math & Music Lessons</h1>
      <p className="mt-2 text-gray-600">
        Schedule, lesson notes, and practice checklists.
      </p>
      <div className="mt-6">
        <Link className="underline" href="/login">Go to Login</Link>
      </div>
    </main>
  );
}