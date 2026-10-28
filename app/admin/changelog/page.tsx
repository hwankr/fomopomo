'use client';

import Link from 'next/link';
import AdminGuard from '@/components/admin/AdminGuard';

export default function AdminChangelogPage() {
  return (
    <AdminGuard>
      <div className="min-h-screen px-4 py-12 md:px-10">
        <div className="mx-auto max-w-3xl">
          <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-pomo">
            Admin
          </p>
          <h1 className="ui-h1 mt-2">
            Changelog Management
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            This route now exists so the admin dashboard no longer leads to a
            404 page. The full changelog management UI can be implemented on
            top of this screen.
          </p>
          <div className="mt-8">
            <Link
              href="/admin"
              className="ui-button-primary min-h-10 px-4 text-sm"
            >
              Back to admin dashboard
            </Link>
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
