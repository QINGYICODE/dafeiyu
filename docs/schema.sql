-- 设计阶段结构；应用启动时每个连接都必须启用外键。
PRAGMA foreign_keys = ON;

BEGIN;

CREATE TABLE model_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    base_url TEXT NOT NULL CHECK (base_url LIKE 'https://%'),
    model_name TEXT NOT NULL,
    secret_ref TEXT NOT NULL UNIQUE,
    max_output_tokens INTEGER NOT NULL DEFAULT 2048 CHECK (max_output_tokens > 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    -- 人格与回复习惯由应用内置版本定义，不提供编辑接口。
    personality_version TEXT NOT NULL DEFAULT 'xiaoyu-v1',
    avatar_asset TEXT NOT NULL DEFAULT 'whale_default',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE character_states (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    mood_label TEXT NOT NULL DEFAULT '平静',
    mood_reason TEXT NOT NULL DEFAULT '',
    mood_intensity REAL NOT NULL DEFAULT 0.3 CHECK (mood_intensity BETWEEN 0 AND 1),
    expression TEXT NOT NULL DEFAULT 'idle',
    latest_event_id TEXT REFERENCES life_events(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    summary TEXT,
    summary_updated_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sequence_no INTEGER NOT NULL CHECK (sequence_no >= 0),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('complete', 'waiting', 'stopped', 'interrupted', 'failed')),
    reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    model_profile_id TEXT REFERENCES model_profiles(id) ON DELETE SET NULL,
    model_name_snapshot TEXT,
    input_tokens INTEGER CHECK (input_tokens >= 0),
    output_tokens INTEGER CHECK (output_tokens >= 0),
    error_code TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (role != 'assistant' OR status = 'complete' OR content = ''),
    UNIQUE (conversation_id, sequence_no)
);

-- 无记录表示尚未知道如何称呼用户。只从用户本人的消息提取。
-- 删除来源消息时删除这条档案，下一轮默认使用自然的「你」。
CREATE TABLE user_profiles (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    preferred_name TEXT NOT NULL CHECK (length(trim(preferred_name)) BETWEEN 1 AND 40),
    source_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    updated_at TEXT NOT NULL
);

CREATE TABLE browsing_preferences (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    max_runs_per_day INTEGER NOT NULL DEFAULT 6 CHECK (max_runs_per_day BETWEEN 1 AND 48),
    max_pages_per_run INTEGER NOT NULL DEFAULT 2 CHECK (max_pages_per_run BETWEEN 1 AND 5),
    min_interval_minutes INTEGER NOT NULL DEFAULT 120 CHECK (min_interval_minutes >= 15),
    quiet_start TEXT NOT NULL DEFAULT '23:00',
    quiet_end TEXT NOT NULL DEFAULT '08:00',
    updated_at TEXT NOT NULL
);

CREATE TABLE browsing_runs (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('autonomous', 'conversation', 'manual')),
    query TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('waiting', 'running', 'succeeded', 'no_results', 'cancelled', 'interrupted', 'failed')),
    search_requests INTEGER NOT NULL DEFAULT 0 CHECK (search_requests >= 0),
    fetch_requests INTEGER NOT NULL DEFAULT 0 CHECK (fetch_requests >= 0),
    error_code TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT
);

CREATE TABLE browsing_items (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES browsing_runs(id) ON DELETE CASCADE,
    url TEXT NOT NULL CHECK (url LIKE 'https://%'),
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    reflection TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    UNIQUE (run_id, url)
);

CREATE TABLE character_interests (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 0.5 CHECK (weight BETWEEN 0 AND 1),
    source_kind TEXT NOT NULL CHECK (source_kind IN ('initial', 'conversation', 'browsing')),
    source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    source_item_id TEXT REFERENCES browsing_items(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (character_id, topic)
);

CREATE TABLE life_events (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('conversation', 'browsing', 'rest')),
    description TEXT NOT NULL,
    source_message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
    source_item_id TEXT REFERENCES browsing_items(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('preference', 'event', 'agreement', 'other')),
    content TEXT NOT NULL CHECK (length(trim(content)) > 0),
    origin TEXT NOT NULL CHECK (origin IN ('manual', 'extracted')),
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('candidate', 'confirmed', 'rejected')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE memory_sources (
    memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    PRIMARY KEY (memory_id, message_id)
);

-- 删除会话前，应用应在事务内先删除有来源的提取记忆，再删除会话。
-- 手动删除或更正任何记忆时，先使该角色的会话摘要失效。
-- 所有跨表写入必须验证来源消息与记忆所属角色一致。
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_conversations_character ON conversations(character_id, updated_at DESC);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, sequence_no);
CREATE INDEX idx_memories_lookup ON memories(character_id, status, category, updated_at DESC);
CREATE INDEX idx_memory_sources_message ON memory_sources(message_id);
CREATE INDEX idx_browsing_runs_character ON browsing_runs(character_id, started_at DESC);
CREATE INDEX idx_interests_character ON character_interests(character_id, weight DESC);
CREATE INDEX idx_life_events_character ON life_events(character_id, created_at DESC);

PRAGMA user_version = 2;
COMMIT;
