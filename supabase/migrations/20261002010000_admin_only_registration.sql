-- Only trusted Admin API provisioning supplies app_metadata.gkl_role.
-- Public signup/user_metadata must never be able to create an application account.
BEGIN;
CREATE OR REPLACE FUNCTION public.gkl_require_admin_provisioning()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF COALESCE(NEW.raw_app_meta_data->>'gkl_role', '') NOT IN ('user', 'admin') THEN
    RAISE EXCEPTION 'gkl_admin_only_registration' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.gkl_require_admin_provisioning() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS gkl_require_admin_provisioning ON auth.users;
CREATE TRIGGER gkl_require_admin_provisioning BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.gkl_require_admin_provisioning();
COMMIT;
