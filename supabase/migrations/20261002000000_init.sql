-- Genius Kids Lab: Auth, administration, and family sync.
-- Consolidates 20261001000000_auth.sql and 20261001010000_family_sync.sql.
-- Apply with Supabase SQL Editor or `supabase db push` (see README for existing projects).
-- No passwords or email tokens are stored in application tables.
BEGIN;

-- Auth and administration
CREATE TABLE IF NOT EXISTS public.gkl_rate_limits (
  key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS gkl_rate_expiry_idx ON public.gkl_rate_limits(expires_at);
CREATE TABLE IF NOT EXISTS public.gkl_session_access (
  session_id uuid PRIMARY KEY REFERENCES auth.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS gkl_session_user_idx ON public.gkl_session_access(user_id);
CREATE TABLE IF NOT EXISTS public.gkl_admin_guard (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), revision bigint NOT NULL DEFAULT 0
);
INSERT INTO public.gkl_admin_guard(id) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE public.gkl_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gkl_session_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gkl_admin_guard ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gkl_rate_limits, public.gkl_session_access, public.gkl_admin_guard FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gkl_rate_limit(p_key text, p_limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE attempts integer;
BEGIN
  DELETE FROM public.gkl_rate_limits WHERE expires_at < now();
  INSERT INTO public.gkl_rate_limits(key,hits,expires_at) VALUES(p_key,1,now()+interval '15 minutes')
    ON CONFLICT(key) DO UPDATE SET hits=public.gkl_rate_limits.hits+1 RETURNING hits INTO attempts;
  RETURN attempts <= p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.gkl_allow_session(p_session uuid, p_user uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Lock the account so a simultaneous ban/revocation cannot leave a new grant behind.
  PERFORM 1 FROM auth.users WHERE id=p_user AND (banned_until IS NULL OR banned_until<=now()) FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=p_session AND user_id=p_user) THEN RETURN false; END IF;
  INSERT INTO public.gkl_session_access(session_id,user_id) VALUES(p_session,p_user) ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.gkl_check_session(p_session uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.gkl_session_access a JOIN auth.sessions s ON s.id=a.session_id
    JOIN auth.users u ON u.id=a.user_id WHERE a.session_id=p_session AND a.user_id=p_user
    AND (u.banned_until IS NULL OR u.banned_until<=now()));
$$;
CREATE OR REPLACE FUNCTION public.gkl_revoke_session(p_session uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.gkl_session_access WHERE session_id=p_session;
$$;

CREATE OR REPLACE FUNCTION public.gkl_account_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_admin boolean; new_admin boolean := false; changed boolean := false;
BEGIN
  old_admin := COALESCE(OLD.raw_app_meta_data->>'gkl_role','user')='admin'
    AND (OLD.banned_until IS NULL OR OLD.banned_until<=now());
  IF TG_OP='UPDATE' THEN
    new_admin := COALESCE(NEW.raw_app_meta_data->>'gkl_role','user')='admin'
      AND (NEW.banned_until IS NULL OR NEW.banned_until<=now());
    changed := OLD.email IS DISTINCT FROM NEW.email
      OR OLD.raw_app_meta_data->>'gkl_role' IS DISTINCT FROM NEW.raw_app_meta_data->>'gkl_role'
      OR OLD.banned_until IS DISTINCT FROM NEW.banned_until
      OR OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password;
  END IF;
  IF TG_OP='DELETE' OR old_admin IS DISTINCT FROM new_admin THEN
    -- Row lock serializes admin removal even across multiple API instances.
    UPDATE public.gkl_admin_guard SET revision=revision+1 WHERE id=true;
    IF old_admin AND NOT new_admin AND NOT EXISTS (
      SELECT 1 FROM auth.users WHERE id<>OLD.id AND raw_app_meta_data->>'gkl_role'='admin'
      AND (banned_until IS NULL OR banned_until<=now())
    ) THEN RAISE EXCEPTION 'gkl_last_admin'; END IF;
  END IF;
  IF TG_OP='DELETE' OR changed THEN DELETE FROM public.gkl_session_access WHERE user_id=OLD.id; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS gkl_account_changed ON auth.users;
CREATE TRIGGER gkl_account_changed BEFORE UPDATE OR DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.gkl_account_changed();

-- Service-only RPC reads Supabase Auth's directory without exposing auth.users via REST.
CREATE OR REPLACE FUNCTION public.gkl_list_users(p_query text DEFAULT '', p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH directory AS (
    SELECT id, COALESCE(raw_user_meta_data->>'name',split_part(email,'@',1),'Pengguna') AS name,
      email, CASE WHEN raw_app_meta_data->>'gkl_role'='admin' THEN 'admin' ELSE 'user' END AS role,
      (banned_until IS NULL OR banned_until<=now()) AS active, created_at AS "createdAt"
    FROM auth.users WHERE deleted_at IS NULL
  ), filtered AS (
    SELECT * FROM directory WHERE strpos(lower(name),lower(p_query))>0 OR strpos(lower(email),lower(p_query))>0
  ), page AS (
    SELECT * FROM filtered ORDER BY "createdAt" DESC,id LIMIT 20 OFFSET ((greatest(1,least(p_page,100000))-1)*20)
  ) SELECT jsonb_build_object(
    'users',COALESCE((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered),'page',greatest(1,least(p_page,100000)),'pageSize',20,
    'stats',(SELECT jsonb_build_object('total',count(*),'active',count(*) FILTER(WHERE active),'admins',count(*) FILTER(WHERE active AND role='admin')) FROM directory));
$$;

REVOKE ALL ON FUNCTION public.gkl_rate_limit(text,integer), public.gkl_allow_session(uuid,uuid),
  public.gkl_check_session(uuid,uuid), public.gkl_revoke_session(uuid), public.gkl_account_changed(),
  public.gkl_list_users(text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gkl_rate_limit(text,integer), public.gkl_allow_session(uuid,uuid),
  public.gkl_check_session(uuid,uuid), public.gkl_revoke_session(uuid), public.gkl_list_users(text,integer) TO service_role;

-- Family sync (depends on gkl_check_session above)
CREATE TABLE IF NOT EXISTS public.gkl_family_data (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data jsonb NOT NULL CHECK (jsonb_typeof(data)='object' AND data->>'version'='1'
    AND jsonb_typeof(data->'profiles')='array' AND jsonb_array_length(data->'profiles') BETWEEN 1 AND 5),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gkl_family_data ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gkl_family_data FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gkl_read_family(p_user uuid, p_session uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.gkl_check_session(p_session,p_user) THEN RAISE EXCEPTION 'gkl_session_denied'; END IF;
  SELECT jsonb_build_object('data',data,'revision',revision,'updatedAt',updated_at) INTO result
    FROM public.gkl_family_data WHERE user_id=p_user;
  RETURN coalesce(result,jsonb_build_object('data',null,'revision',0,'updatedAt',null));
END;
$$;

CREATE OR REPLACE FUNCTION public.gkl_write_family(p_user uuid, p_session uuid, p_revision bigint, p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_row public.gkl_family_data%ROWTYPE;
BEGIN
  -- Account lock serializes creation/updates and account revocation; comparison and write are atomic.
  PERFORM 1 FROM auth.users WHERE id=p_user FOR UPDATE;
  IF NOT public.gkl_check_session(p_session,p_user) THEN RAISE EXCEPTION 'gkl_session_denied'; END IF;
  IF p_revision IS NULL OR p_revision<0 OR p_data IS NULL OR jsonb_typeof(p_data)<>'object'
    OR octet_length(p_data::text)>3400000 THEN RAISE EXCEPTION 'gkl_invalid_family'; END IF;
  SELECT * INTO current_row FROM public.gkl_family_data WHERE user_id=p_user;
  -- Idempotent retry: a lost HTTP response must not create a false conflict.
  IF FOUND AND current_row.data=p_data THEN
    RETURN public.gkl_read_family(p_user,p_session) || jsonb_build_object('conflict',false);
  END IF;
  IF coalesce(current_row.revision,0)<>p_revision THEN
    RETURN public.gkl_read_family(p_user,p_session) || jsonb_build_object('conflict',true);
  END IF;
  INSERT INTO public.gkl_family_data(user_id,data,revision) VALUES(p_user,p_data,1)
    ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,revision=gkl_family_data.revision+1,updated_at=now();
  RETURN public.gkl_read_family(p_user,p_session) || jsonb_build_object('conflict',false);
END;
$$;
REVOKE ALL ON FUNCTION public.gkl_read_family(uuid,uuid),public.gkl_write_family(uuid,uuid,bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gkl_read_family(uuid,uuid),public.gkl_write_family(uuid,uuid,bigint,jsonb) TO service_role;

COMMIT;
