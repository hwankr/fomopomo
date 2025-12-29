-- Add is_draft column to changelogs table
ALTER TABLE changelogs ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;

-- Update RLS policy: non-admin users can only see published changelogs
DROP POLICY IF EXISTS "Anyone can view changelogs" ON changelogs;

CREATE POLICY "Anyone can view published changelogs"
ON changelogs FOR SELECT
USING (
  is_draft = false
  OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);
