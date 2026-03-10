-- =============================================
-- RLS policies for builds table with proper auth
-- Run this in Supabase SQL Editor
-- =============================================

-- Drop old permissive policies
DROP POLICY IF EXISTS "Public can read builds" ON builds;
DROP POLICY IF EXISTS "Anyone can insert builds" ON builds;
DROP POLICY IF EXISTS "Anyone can delete builds" ON builds;

-- Users can only read their own builds
CREATE POLICY "Users read own builds"
  ON builds FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert builds for themselves
CREATE POLICY "Users insert own builds"
  ON builds FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own builds
CREATE POLICY "Users delete own builds"
  ON builds FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only update their own builds
CREATE POLICY "Users update own builds"
  ON builds FOR UPDATE
  USING (auth.uid() = user_id);

-- Ensure profiles table has proper policies too
DROP POLICY IF EXISTS "Users read own profile" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON profiles;

CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

