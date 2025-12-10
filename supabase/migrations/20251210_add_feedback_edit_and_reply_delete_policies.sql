-- Migration: Add feedback edit and reply delete policies
-- Branch: feature/feedback-improvements
-- Safe version: drops existing policies first if they exist

-- ==========================================
-- 1. Feedbacks UPDATE policy
-- 작성자 본인만, 상태가 pending일 때만 수정 가능
-- ==========================================

-- 기존 정책 삭제 (있으면)
DROP POLICY IF EXISTS "Authors can update their pending feedbacks" ON public.feedbacks;

CREATE POLICY "Authors can update their pending feedbacks"
    ON public.feedbacks FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = user_id
        AND status = 'pending'
    )
    WITH CHECK (
        auth.uid() = user_id
        AND status = 'pending'
    );


-- ==========================================
-- 2. Feedback Replies DELETE policies
-- 작성자 본인 또는 관리자만 삭제 가능
-- ==========================================

-- 기존 정책 삭제 (있으면)
DROP POLICY IF EXISTS "Users can delete their own replies" ON public.feedback_replies;
DROP POLICY IF EXISTS "Admins can delete any reply" ON public.feedback_replies;

-- Policy: Authors can delete their own replies
CREATE POLICY "Users can delete their own replies"
    ON public.feedback_replies FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Policy: Admins can delete any reply
CREATE POLICY "Admins can delete any reply"
    ON public.feedback_replies FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

