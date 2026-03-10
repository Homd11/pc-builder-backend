-- =============================================
-- RLS Policy update for builds table (auth-aware)
-- Run this in Supabase SQL Editor
-- =============================================

-- Drop old permissive policies
DROP POLICY IF EXISTS "Public can read builds" ON builds;
DROP POLICY IF EXISTS "Anyone can insert builds" ON builds;
DROP POLICY IF EXISTS "Anyone can delete builds" ON builds;

-- New auth-aware policies: users can only CRUD their own builds
CREATE POLICY "Users can read own builds"
  ON builds FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own builds"
  ON builds FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own builds"
  ON builds FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own builds"
  ON builds FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Ensure profiles table has proper RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow the anon key to insert profiles during signup (backend does upsert)
CREATE POLICY "Service can manage profiles"
  ON profiles FOR ALL
  USING (true)
  WITH CHECK (true);

