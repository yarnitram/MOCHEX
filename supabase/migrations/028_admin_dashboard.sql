-- Migration: 028_admin_dashboard.sql
-- Add is_admin column to user_settings and create system_announcements table

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Grant admin rights to user 'ymatt'
UPDATE public.user_settings
SET is_admin = true
WHERE username = 'ymatt' OR user_id = '8704a735-585f-4d7c-9427-b47326988034';

-- System-wide Broadcast Announcements
CREATE TABLE IF NOT EXISTS public.system_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'info', -- 'info', 'warning', 'success', 'announcement'
  link_url text,
  link_text text,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read active announcements
DROP POLICY IF EXISTS "Allow read active announcements" ON public.system_announcements;
CREATE POLICY "Allow read active announcements" ON public.system_announcements
  FOR SELECT TO authenticated USING (true);

-- Allow service role full access
DROP POLICY IF EXISTS "Allow service role all announcements" ON public.system_announcements;
CREATE POLICY "Allow service role all announcements" ON public.system_announcements
  FOR ALL TO service_role USING (true);
