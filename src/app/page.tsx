import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <h1 className="text-3xl font-bold mb-4">Faigata</h1>
      <p className="mb-6 text-slate-600">
        Welcome to Faigata – start using FaigataCRM.
      </p>
      <Link
        href="/dashboard"
        className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm"
      >
        Go to FaigataCRM
      </Link>
    </main>
  );
}