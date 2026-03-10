-- =============================================
-- FULL SETUP — Run this ONE file in Supabase SQL Editor
-- Includes: tables + RPC functions
-- =============================================

-- ⚠️ Drop existing
DROP FUNCTION IF EXISTS calculate_bottleneck;
DROP FUNCTION IF EXISTS get_compatible_parts;
DROP TABLE IF EXISTS builds CASCADE;
DROP TABLE IF EXISTS components CASCADE;
DROP TABLE IF EXISTS calculations CASCADE;

-- 1. Components table
CREATE TABLE components (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type            TEXT NOT NULL CHECK (type IN ('CPU', 'GPU', 'Motherboard', 'RAM')),
    tier            TEXT NOT NULL CHECK (tier IN ('low', 'mid', 'high')),
    name            TEXT NOT NULL,
    price           TEXT NOT NULL,
    benchmark       INTEGER NOT NULL DEFAULT 0,
    match_score     INTEGER NOT NULL DEFAULT 0,
    socket          TEXT,
    chipset         TEXT,
    form_factor     TEXT,
    memory_type     TEXT,
    max_memory      INTEGER,
    speed           INTEGER,
    capacity        INTEGER,
    modules         TEXT,
    latency         TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_components_type_tier ON components (type, tier);
CREATE INDEX idx_components_name ON components (name);
CREATE INDEX idx_components_socket ON components (socket) WHERE socket IS NOT NULL;
CREATE INDEX idx_components_memory_type ON components (memory_type) WHERE memory_type IS NOT NULL;

-- 2. Calculations table
CREATE TABLE calculations (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cpu_score           NUMERIC NOT NULL,
    gpu_score           NUMERIC NOT NULL,
    bottleneck_percent  INTEGER NOT NULL,
    severity            TEXT NOT NULL,
    culprit             TEXT NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calculations_created_at ON calculations (created_at DESC);

-- 3. Builds table
CREATE TABLE builds (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    build_name              TEXT NOT NULL,
    cpu_id                  BIGINT REFERENCES components(id) ON DELETE SET NULL,
    gpu_id                  BIGINT REFERENCES components(id) ON DELETE SET NULL,
    ram_id                  BIGINT REFERENCES components(id) ON DELETE SET NULL,
    motherboard_id          BIGINT REFERENCES components(id) ON DELETE SET NULL,
    bottleneck_percentage   NUMERIC DEFAULT 0,
    user_id                 TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_builds_created_at ON builds (created_at DESC);

-- 4. RLS
ALTER TABLE components ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE builds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read components" ON components FOR SELECT USING (true);
CREATE POLICY "Anyone can delete components" ON components FOR DELETE USING (true);
CREATE POLICY "Anyone can insert components" ON components FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert calculations" ON calculations FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can read calculations" ON calculations FOR SELECT USING (true);
CREATE POLICY "Public can read builds" ON builds FOR SELECT USING (true);
CREATE POLICY "Anyone can insert builds" ON builds FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete builds" ON builds FOR DELETE USING (true);

-- =============================================
-- 5. Bottleneck Calculator RPC (with RAM support)
-- =============================================
CREATE OR REPLACE FUNCTION calculate_bottleneck(
    p_cpu_id BIGINT,
    p_gpu_id BIGINT,
    p_ram_id BIGINT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cpu_benchmark   INTEGER;
    v_gpu_benchmark   INTEGER;
    v_ram_benchmark   INTEGER;
    v_cpu_name        TEXT;
    v_gpu_name        TEXT;
    v_ram_name        TEXT;
    v_cpu_min         INTEGER;
    v_cpu_max         INTEGER;
    v_gpu_min         INTEGER;
    v_gpu_max         INTEGER;
    v_ram_min         INTEGER;
    v_ram_max         INTEGER;
    v_cpu_norm        NUMERIC;
    v_gpu_norm        NUMERIC;
    v_ram_norm        NUMERIC;
    v_cg_diff         NUMERIC;
    v_ram_diff        NUMERIC;
    v_bottleneck_pct  INTEGER;
    v_severity        TEXT;
    v_culprit         TEXT;
    v_message         TEXT;
    v_ram_bottleneck  BOOLEAN := false;
    v_ram_severity    TEXT := 'None';
BEGIN
    SELECT benchmark, name INTO v_cpu_benchmark, v_cpu_name
    FROM components WHERE id = p_cpu_id AND type = 'CPU';
    IF v_cpu_benchmark IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'CPU not found');
    END IF;

    SELECT benchmark, name INTO v_gpu_benchmark, v_gpu_name
    FROM components WHERE id = p_gpu_id AND type = 'GPU';
    IF v_gpu_benchmark IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'GPU not found');
    END IF;

    SELECT MIN(benchmark), MAX(benchmark) INTO v_cpu_min, v_cpu_max FROM components WHERE type = 'CPU';
    SELECT MIN(benchmark), MAX(benchmark) INTO v_gpu_min, v_gpu_max FROM components WHERE type = 'GPU';

    IF v_cpu_max = v_cpu_min THEN v_cpu_norm := 50;
    ELSE v_cpu_norm := ((v_cpu_benchmark - v_cpu_min)::NUMERIC / (v_cpu_max - v_cpu_min)) * 100;
    END IF;

    IF v_gpu_max = v_gpu_min THEN v_gpu_norm := 50;
    ELSE v_gpu_norm := ((v_gpu_benchmark - v_gpu_min)::NUMERIC / (v_gpu_max - v_gpu_min)) * 100;
    END IF;

    v_cg_diff := ABS(v_cpu_norm - v_gpu_norm);
    v_ram_norm := NULL;

    IF p_ram_id IS NOT NULL THEN
        SELECT benchmark, name INTO v_ram_benchmark, v_ram_name
        FROM components WHERE id = p_ram_id AND type = 'RAM';

        IF v_ram_benchmark IS NOT NULL THEN
            SELECT MIN(benchmark), MAX(benchmark) INTO v_ram_min, v_ram_max FROM components WHERE type = 'RAM';

            IF v_ram_max = v_ram_min THEN v_ram_norm := 50;
            ELSE v_ram_norm := ((v_ram_benchmark - v_ram_min)::NUMERIC / (v_ram_max - v_ram_min)) * 100;
            END IF;

            v_ram_diff := GREATEST((v_cpu_norm + v_gpu_norm) / 2.0 - v_ram_norm, 0);

            IF v_ram_diff > 30 THEN v_ram_bottleneck := true; v_ram_severity := 'Severe';
            ELSIF v_ram_diff > 20 THEN v_ram_bottleneck := true; v_ram_severity := 'Moderate';
            ELSIF v_ram_diff > 10 THEN v_ram_bottleneck := true; v_ram_severity := 'Mild';
            END IF;

            v_cg_diff := (v_cg_diff * 0.7) + (v_ram_diff * 0.3);
        END IF;
    END IF;

    v_bottleneck_pct := LEAST(ROUND(v_cg_diff), 100);

    IF v_bottleneck_pct < 10 THEN v_severity := 'Balanced';
    ELSIF v_bottleneck_pct < 25 THEN v_severity := 'Mild';
    ELSIF v_bottleneck_pct < 50 THEN v_severity := 'Moderate';
    ELSE v_severity := 'Severe';
    END IF;

    IF v_bottleneck_pct < 10 THEN
        v_culprit := 'None';
        v_message := 'Your build is well balanced! No significant bottleneck detected.';
    ELSIF v_ram_bottleneck AND v_ram_diff > v_cg_diff THEN
        v_culprit := 'RAM';
        v_message := 'Your RAM is holding back your system. (' || v_bottleneck_pct || '% ' || v_severity || ' Bottleneck)';
    ELSIF v_cpu_norm < v_gpu_norm THEN
        v_culprit := 'CPU';
        v_message := 'Your CPU is holding back your GPU. (' || v_bottleneck_pct || '% ' || v_severity || ' Bottleneck)';
    ELSE
        v_culprit := 'GPU';
        v_message := 'Your GPU is holding back your CPU. (' || v_bottleneck_pct || '% ' || v_severity || ' Bottleneck)';
    END IF;

    INSERT INTO calculations (cpu_score, gpu_score, bottleneck_percent, severity, culprit)
    VALUES (v_cpu_benchmark, v_gpu_benchmark, v_bottleneck_pct, v_severity, v_culprit);

    RETURN json_build_object(
        'success',            true,
        'bottleneckPercent',  v_bottleneck_pct,
        'severity',           v_severity,
        'culprit',            v_culprit,
        'message',            v_message,
        'cpuName',            v_cpu_name,
        'gpuName',            v_gpu_name,
        'ramName',            COALESCE(v_ram_name, 'Not selected'),
        'cpuPercentile',      ROUND(v_cpu_norm),
        'gpuPercentile',      ROUND(v_gpu_norm),
        'ramPercentile',      CASE WHEN v_ram_norm IS NOT NULL THEN ROUND(v_ram_norm) ELSE NULL END,
        'ramBottleneck',      v_ram_bottleneck,
        'ramSeverity',        v_ram_severity,
        'cpuBenchmark',       v_cpu_benchmark,
        'gpuBenchmark',       v_gpu_benchmark,
        'ramBenchmark',       v_ram_benchmark
    );
END;
$$;

-- =============================================
-- 6. Compatibility Filter RPC
-- =============================================
CREATE OR REPLACE FUNCTION get_compatible_parts(p_cpu_id BIGINT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_socket      TEXT;
    v_memory_type TEXT;
    v_cpu_name    TEXT;
    v_mobos       JSON;
    v_rams        JSON;
BEGIN
    SELECT socket, memory_type, name
    INTO v_socket, v_memory_type, v_cpu_name
    FROM components WHERE id = p_cpu_id AND type = 'CPU';

    IF v_socket IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'CPU not found');
    END IF;

    SELECT COALESCE(json_agg(row_to_json(m) ORDER BY m.benchmark DESC), '[]'::json)
    INTO v_mobos
    FROM (
        SELECT id, name, price, benchmark, match_score, socket, chipset,
               form_factor, memory_type, max_memory, tier
        FROM components WHERE type = 'Motherboard' AND socket = v_socket
    ) m;

    SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.benchmark DESC), '[]'::json)
    INTO v_rams
    FROM (
        SELECT id, name, price, benchmark, match_score, memory_type,
               speed, capacity, modules, latency, tier
        FROM components WHERE type = 'RAM' AND memory_type = v_memory_type
    ) r;

    RETURN json_build_object(
        'success',                  true,
        'cpuName',                  v_cpu_name,
        'socket',                   v_socket,
        'memoryType',               v_memory_type,
        'compatibleMotherboards',   v_mobos,
        'compatibleRam',            v_rams
    );
END;
$$;

