import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="text-center max-w-2xl">
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-6xl mb-6">
          Volatile Fantasy Football
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-8">
          A high-performance fantasy football analytics platform powered by Next.js and PostgreSQL.
        </p>

        <div className="flex justify-center gap-4">
          <Link
            href="/players"
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            View All Players <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/league/1200992049558454272"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            View My League
          </Link>
        </div>
      </div>
    </div>
  );
}
