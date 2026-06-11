-- Allow global context type for chat sessions (no project required)
-- Run this in the Supabase SQL Editor

ALTER TABLE chat_sessions DROP CONSTRAINT chat_sessions_context_type_check;
ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_context_type_check
  CHECK (context_type IN ('company', 'project', 'global'));
