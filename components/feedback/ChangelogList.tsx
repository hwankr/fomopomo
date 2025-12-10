'use client';

import { useState, useEffect, FormEvent, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { Plus, Trash2, Edit2, Loader2, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';

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

    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [version, setVersion] = useState('');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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

    const handleEdit = (log: Changelog) => {
        setEditingId(log.id);
        setVersion(log.version);
        setTitle(log.title);
        setContent(log.content);
        setIsCreating(true);
        // Scroll to top to show form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cancelEdit = () => {
        setIsCreating(false);
        setEditingId(null);
        setVersion('');
        setTitle('');
        setContent('');
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!version.trim() || !title.trim() || !content.trim()) return;

        setSubmitting(true);
        try {
            if (editingId) {
                // Update existing
                const { data, error } = await supabase
                    .from('changelogs')
                    .update({ version, title, content })
                    .eq('id', editingId)
                    .select()
                    .single();

                if (error) throw error;

                setChangelogs(prev => prev.map(item => item.id === editingId ? data : item));
                toast.success('변경 내역이 수정되었습니다.');
            } else {
                // Create new
                const { data, error } = await supabase
                    .from('changelogs')
                    .insert([{ version, title, content }])
                    .select()
                    .single();

                if (error) throw error;

                setChangelogs([data, ...changelogs]);
                toast.success('변경 내역이 등록되었습니다.');
            }

            cancelEdit();
        } catch (error) {
            console.error('Error saving changelog:', error);
            toast.error('저장 실패');
        } finally {
            setSubmitting(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            toast.error('이미지 크기는 5MB 이하여야 합니다.');
            return;
        }

        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `changelog/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('feedback-uploads')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage
                .from('feedback-uploads')
                .getPublicUrl(filePath);

            const markdownImage = `![이미지 설명](${data.publicUrl})\n`;
            
            // Textarea cursor position insertion
            const textarea = textareaRef.current;
            if (textarea) {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const newContent = content.substring(0, start) + markdownImage + content.substring(end);
                setContent(newContent);
                
                // Restore focus (optional, usually good UX)
                setTimeout(() => {
                    textarea.focus();
                    textarea.setSelectionRange(start + markdownImage.length, start + markdownImage.length);
                }, 0);
            } else {
                setContent(prev => prev + markdownImage);
            }

            toast.success('이미지가 업로드되었습니다.');
        } catch (error) {
            console.error('Error uploading image:', error);
            toast.error('이미지 업로드 실패');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
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
        } catch (error: any) {
            console.error('Delete error details:', error);
            toast.error(`삭제 실패: ${error.message || '알 수 없는 오류'}`);
        }
    };

    if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-rose-500" /></div>;

    return (
        <div className="space-y-6 p-4">
            {isAdmin && (
                <div className="flex justify-end">
                    <button
                        onClick={isCreating ? cancelEdit : () => setIsCreating(true)}
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
                    <div className="relative">
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder="변경 내용... (마크다운 지원: # 제목, - 리스트, **강조**)"
                            rows={10}
                            className="w-full p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none font-mono text-sm"
                        />
                        <div className="absolute bottom-3 right-3 flex gap-2">
                             <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleImageUpload}
                                accept="image/*"
                                className="hidden"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="p-2 bg-white dark:bg-slate-800 text-gray-500 rounded-lg shadow-sm border border-gray-200 dark:border-slate-600 hover:text-rose-500 transition-colors"
                                title="이미지 업로드"
                            >
                                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-3 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-600 transition-colors disabled:opacity-50"
                    >
                        {submitting ? <Loader2 className="animate-spin mx-auto w-5 h-5" /> : (editingId ? '수정완료' : '등록하기')}
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
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => handleEdit(log)}
                                                className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(log.id)}
                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="prose dark:prose-invert max-w-none text-gray-600 dark:text-gray-300 text-sm leading-relaxed whitespace-normal break-words">
                                    <ReactMarkdown 
                                        components={{
                                            h1: ({node, ...props}) => <h1 {...props} className="text-2xl font-bold my-4 pb-2 border-b dark:border-slate-700" />,
                                            h2: ({node, ...props}) => <h2 {...props} className="text-xl font-bold my-3" />,
                                            h3: ({node, ...props}) => <h3 {...props} className="text-lg font-semibold my-2" />,
                                            ul: ({node, ...props}) => <ul {...props} className="list-disc pl-5 my-2 space-y-1" />,
                                            ol: ({node, ...props}) => <ol {...props} className="list-decimal pl-5 my-2 space-y-1" />,
                                            li: ({node, ...props}) => <li {...props} className="my-0.5" />,
                                            blockquote: ({node, ...props}) => <blockquote {...props} className="border-l-4 border-rose-500 pl-4 italic my-2 text-gray-500 dark:text-gray-400" />,
                                            img: ({node, ...props}) => (
                                                <img {...props} className="rounded-lg max-h-96 object-contain my-2 shadow-sm" />
                                            ),
                                            a: ({node, ...props}) => (
                                                <a {...props} className="text-rose-500 hover:underline font-medium" target="_blank" rel="noopener noreferrer" />
                                            )
                                        }}
                                    >
                                        {log.content}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
