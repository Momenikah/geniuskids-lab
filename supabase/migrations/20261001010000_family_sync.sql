BEGIN;
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
