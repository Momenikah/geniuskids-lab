-- Run once in the Supabase SQL Editor after the application migrations.
-- Promote the existing, verified account; preserve password, metadata and family data.
BEGIN;
DO $$
DECLARE target auth.users%ROWTYPE;
BEGIN
  SELECT * INTO STRICT target FROM auth.users
    WHERE lower(email) = 'wahib.chelsea@gmail.com' AND deleted_at IS NULL FOR UPDATE;
  IF target.email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Konfirmasi email akun terlebih dahulu.';
  END IF;
  IF target.banned_until > now() THEN
    RAISE EXCEPTION 'Akun sedang dinonaktifkan; periksa status akun terlebih dahulu.';
  END IF;
  UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"gkl_role":"admin"}'::jsonb
    WHERE id = target.id AND raw_app_meta_data->>'gkl_role' IS DISTINCT FROM 'admin';
END;
$$;
SELECT id, email, raw_app_meta_data->>'gkl_role' AS role
  FROM auth.users WHERE lower(email) = 'wahib.chelsea@gmail.com' AND deleted_at IS NULL;
COMMIT;
-- Existing application sessions are revoked by gkl_account_changed: log in again.
