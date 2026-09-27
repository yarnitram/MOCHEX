-- Migration: 027_app_settings.sql
-- Table for global application-level settings (e.g. site-wide Google Drive bucket token)

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read app_settings (e.g. storage status)
DROP POLICY IF EXISTS "Allow authenticated read app_settings" ON public.app_settings;
CREATE POLICY "Allow authenticated read app_settings" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

-- Allow service role full access
DROP POLICY IF EXISTS "Allow service role all app_settings" ON public.app_settings;
CREATE POLICY "Allow service role all app_settings" ON public.app_settings
  FOR ALL TO service_role USING (true);
