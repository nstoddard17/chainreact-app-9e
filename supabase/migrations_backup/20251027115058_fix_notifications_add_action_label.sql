-- Add action_label column to notifications table if it doesn't exist
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS action_label TEXT;
