-- Migration: 026_google_drive_storage.sql
-- Add Google Drive credentials and screenshot storage settings to user_settings

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS google_drive_connected boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS google_drive_email text,
ADD COLUMN IF NOT EXISTS google_drive_refresh_token text,
ADD COLUMN IF NOT EXISTS screenshot_storage_backend text DEFAULT 'auto';
