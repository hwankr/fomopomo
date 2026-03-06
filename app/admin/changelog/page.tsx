'use client';

import Link from 'next/link';
import AdminGuard from '@/components/admin/AdminGuard';

export default function AdminChangelogPage() {
  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50 px-6 py-12 dark:bg-gray-900">
        <div className="mx-auto max-w-3xl rounded-3xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-500">
            Admin
          </p>
          <h1 className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
            Changelog Management
          </h1>
          <p className="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-300">
            This route now exists so the admin dashboard no longer leads to a
            404 page. The full changelog management UI can be implemented on
            top of this screen.
          </p>
          <div className="mt-8">
            <Link
              href="/admin"
              className="inline-flex rounded-xl bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600"
            >
              Back to admin dashboard
            </Link>
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
