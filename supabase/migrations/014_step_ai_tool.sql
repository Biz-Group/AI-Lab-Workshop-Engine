-- Add per-step AI tool override fields to module_steps (nullable = inherit from template)
ALTER TABLE module_steps
  ADD COLUMN ai_tool_name TEXT DEFAULT NULL,
  ADD COLUMN ai_tool_url  TEXT DEFAULT NULL;

-- Add resolved AI tool fields to session_snapshot_steps (NOT NULL = always resolved at snapshot time)
ALTER TABLE session_snapshot_steps
  ADD COLUMN ai_tool_name TEXT NOT NULL DEFAULT 'ChatGPT',
  ADD COLUMN ai_tool_url  TEXT NOT NULL DEFAULT 'https://chat.openai.com';
