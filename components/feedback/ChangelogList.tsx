'use client';

import { useState, useEffect, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { Plus, Trash2, Edit2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

interface Changelog {
    id: string;
    version: string;
    title: string;
    content: string;
    created_at: string;
}

interface ChangelogListProps {
    isAdmin: boolean;
}

export default function ChangelogList({ isAdmin }: ChangelogListProps) {
    const [changelogs, setChangelogs] = useState<Changelog[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    // Form State
    const [version, setVersion] = useState('');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchChangelogs();
    }, []);

    const fetchChangelogs = async () => {
        const { data, error } = await supabase
            .from('changelogs')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching changelogs:', error);
            toast.error('변경 내역을 불러오지 못했습니다.');
        } else {
            setChangelogs(data || []);
        }
        setLoading(false);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!version.trim() || !title.trim() || !content.trim()) return;

        setSubmitting(true);
        try {
            const { data, error } = await supabase
                .from('changelogs')
                .insert([{ version, title, content }])
                .select()
                .single();

            if (error) throw error;

            setChangelogs([data, ...changelogs]);
            setIsCreating(false);
            setVersion('');
            setTitle('');
            setContent('');
            toast.success('변경 내역이 등록되었습니다.');
        } catch (error) {
            console.error('Error creating changelog:', error);
            toast.error('등록 실패');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('정말 삭제하시겠습니까?')) return;

        try {
            const { error } = await supabase
                .from('changelogs')
                .delete()
                .eq('id', id);

            if (error) throw error;

            setChangelogs(prev => prev.filter(c => c.id !== id));
            toast.success('삭제되었습니다.');
        } catch (error) {
            console.error(error);
            toast.error('삭제 실패');
        }
    };

    if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-rose-500" /></div>;

    return (
        <div className="space-y-6 p-4">
            {isAdmin && (
                <div className="flex justify-end">
                    <button
                        onClick={() => setIsCreating(!isCreating)}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                        {isCreating ? '취소' : <><Plus className="w-4 h-4" /> 새 변경 내역 작성</>}
                    </button>
                </div>
            )}

            {isCreating && (
                <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm animate-in slide-in-from-top-4 duration-200 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <input
                            value={version}
                            onChange={e => setVersion(e.target.value)}
                            placeholder="버전 (예: v1.0.0)"
                            className="p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                        <input
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="제목"
                            className="md:col-span-2 p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                    </div>
                    <textarea
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        placeholder="변경 내용..."
                        rows={5}
                        className="w-full p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                    />
                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-3 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-600 transition-colors disabled:opacity-50"
                    >
                        {submitting ? <Loader2 className="animate-spin mx-auto w-5 h-5" /> : '등록하기'}
                    </button>
                </form>
            )}

            <div className="space-y-4">
                {changelogs.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                        아직 변경 내역이 없습니다.
                    </div>
                ) : (
                    changelogs.map(log => (
                        <div key={log.id} className="relative pl-8 md:pl-0">
                            {/* Timeline line (desktop only potentially, but simple card view is generic) */}
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-bold px-2 py-1 rounded-md">
                                                {log.version}
                                            </span>
                                            <span className="text-sm text-gray-500">
                                                {format(new Date(log.created_at), 'yyyy.MM.dd')}
                                            </span>
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                            {log.title}
                                        </h3>
                                    </div>
                                    {isAdmin && (
                                        <button
                                            onClick={() => handleDelete(log.id)}
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                <div className="prose dark:prose-invert max-w-none text-gray-600 dark:text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                                    {log.content}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
