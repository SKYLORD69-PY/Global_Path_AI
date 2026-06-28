-- ============================================================
--  GlobalPath AI — PostgreSQL Schema
--  Run this once in Supabase SQL Editor:
--  Dashboard → SQL Editor → New Query → paste → Run
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ─────────────────────────────────────────────────────────────
--  USERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    supabase_id   TEXT        NOT NULL UNIQUE,
    email         TEXT        NOT NULL,
    full_name     TEXT,
    avatar_url    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_supabase_id ON users (supabase_id);
CREATE INDEX IF NOT EXISTS idx_users_email       ON users (email);


-- ─────────────────────────────────────────────────────────────
--  STUDENT PROFILES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_profiles (
    profile_id                TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id                   TEXT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    nationality               TEXT,
    home_country              TEXT,
    current_education_level   TEXT,
    target_degree             TEXT,
    field_of_study            TEXT,
    gpa                       NUMERIC(4,2),
    target_countries          JSONB       NOT NULL DEFAULT '[]',
    budget_max                INTEGER,
    intake_year               INTEGER,
    intake_semester           TEXT,
    language_tests            JSONB       NOT NULL DEFAULT '[]',
    work_experience_years     INTEGER     DEFAULT 0,
    gmat_gre                  JSONB,
    statement_of_purpose      TEXT,
    extracurriculars          JSONB       NOT NULL DEFAULT '[]',
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user_id ON student_profiles (user_id);


-- ─────────────────────────────────────────────────────────────
--  UNIVERSITIES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS universities (
    id                          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name                        TEXT        NOT NULL,
    country                     TEXT        NOT NULL,
    city                        TEXT,
    qs_rank                     INTEGER,
    the_rank                    INTEGER,
    tuition_usd                 NUMERIC(10,2),
    tuition_local               TEXT,
    tuition_currency            TEXT        DEFAULT 'USD',
    programs                    JSONB       NOT NULL DEFAULT '[]',
    ielts_min                   NUMERIC(3,1),
    toefl_min                   INTEGER,
    gpa_min                     NUMERIC(3,1),
    accepts_gre                 BOOLEAN     NOT NULL DEFAULT FALSE,
    work_experience_required    BOOLEAN     NOT NULL DEFAULT FALSE,
    application_deadline        TEXT,
    website                     TEXT,
    acceptance_rate             NUMERIC(5,4),
    description                 TEXT,
    scholarship_info            TEXT,
    campus_size                 TEXT,
    student_count               INTEGER,
    international_pct           NUMERIC(5,4),
    cost_of_living_usd_monthly  INTEGER,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_universities_country ON universities (country);
CREATE INDEX IF NOT EXISTS idx_universities_qs_rank ON universities (qs_rank);
CREATE INDEX IF NOT EXISTS idx_universities_name    ON universities (name);


-- ─────────────────────────────────────────────────────────────
--  SHORTLISTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shortlists (
    id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id         TEXT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    university_id   TEXT        NOT NULL REFERENCES universities (id) ON DELETE CASCADE,
    fit_level       TEXT        DEFAULT 'match',
    program_name    TEXT,
    notes           TEXT,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_shortlist_user_uni UNIQUE (user_id, university_id)
);

CREATE INDEX IF NOT EXISTS idx_shortlists_user_id ON shortlists (user_id);


-- ─────────────────────────────────────────────────────────────
--  CHAT SESSIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
    id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id     TEXT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title       TEXT,
    messages    JSONB       NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id    ON chat_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions (updated_at DESC);


-- ─────────────────────────────────────────────────────────────
--  CHAT MESSAGES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    session_id  TEXT        NOT NULL REFERENCES chat_sessions (id) ON DELETE CASCADE,
    role        TEXT        NOT NULL,
    content     TEXT        NOT NULL,
    rich_data   JSONB,
    sources     JSONB       NOT NULL DEFAULT '[]',
    intent      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages (session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages (created_at);


-- ─────────────────────────────────────────────────────────────
--  SCHOLARSHIPS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scholarships (
    id                          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name                        TEXT        NOT NULL,
    provider                    TEXT,
    amount_usd                  NUMERIC(12,2),
    coverage                    TEXT,
    deadline                    DATE,
    target_countries            JSONB       NOT NULL DEFAULT '[]',
    eligible_nationalities      JSONB       NOT NULL DEFAULT '[]',
    degree_levels               JSONB       NOT NULL DEFAULT '[]',
    min_work_experience_years   INTEGER     DEFAULT 0,
    gpa_min                     NUMERIC(3,1),
    url                         TEXT,
    description                 TEXT,
    competitiveness             TEXT,
    scraped_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scholarships_deadline ON scholarships (deadline);
CREATE INDEX IF NOT EXISTS idx_scholarships_name     ON scholarships (name);


-- ─────────────────────────────────────────────────────────────
--  VISA REQUIREMENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visa_requirements (
    id                  TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    from_country        TEXT        NOT NULL,
    to_country          TEXT        NOT NULL,
    visa_type           TEXT,
    processing_time     TEXT,
    fee_usd             NUMERIC(8,2),
    official_url        TEXT,
    visa_steps          JSONB       NOT NULL DEFAULT '[]',
    required_documents  JSONB       NOT NULL DEFAULT '[]',
    financial_req       TEXT,
    health_note         TEXT,
    rejection_reasons   JSONB       NOT NULL DEFAULT '[]',
    scraped_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_visa_route UNIQUE (from_country, to_country)
);

CREATE INDEX IF NOT EXISTS idx_visa_from_to ON visa_requirements (from_country, to_country);


-- ─────────────────────────────────────────────────────────────
--  SAVED PROGRAMS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_programs (
    id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id         TEXT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    program_name    TEXT        NOT NULL,
    university_name TEXT,
    university_id   TEXT        REFERENCES universities (id) ON DELETE SET NULL,
    url             TEXT,
    notes           TEXT,
    saved_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_programs_user_id ON saved_programs (user_id);


-- ─────────────────────────────────────────────────────────────
--  AUTO-UPDATE updated_at on every write
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'users','student_profiles','universities',
        'chat_sessions','scholarships','visa_requirements'
    ] LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
             CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON %s
             FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
            tbl, tbl, tbl, tbl
        );
    END LOOP;
END;
$$;


-- ─────────────────────────────────────────────────────────────
--  VERIFY — shows what was created
-- ─────────────────────────────────────────────────────────────
SELECT tablename AS "Table",
       (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name = t.tablename AND table_schema = 'public') AS "Columns"
FROM pg_tables t
WHERE schemaname = 'public'
ORDER BY tablename;