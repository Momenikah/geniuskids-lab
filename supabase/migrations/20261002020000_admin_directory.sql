-- Search, filter and paginate the admin directory before returning rows to the API.
BEGIN;
CREATE OR REPLACE FUNCTION public.gkl_search_users(
  p_query text DEFAULT '', p_page integer DEFAULT 1,
  p_role text DEFAULT 'all', p_status text DEFAULT 'all', p_sort text DEFAULT 'newest'
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH directory AS (
    SELECT id, COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1), 'Pengguna') AS name,
      email, CASE WHEN raw_app_meta_data->>'gkl_role' = 'admin' THEN 'admin' ELSE 'user' END AS role,
      (banned_until IS NULL OR banned_until <= now()) AS active, created_at AS "createdAt"
    FROM auth.users WHERE deleted_at IS NULL
  ), filtered AS (
    SELECT * FROM directory
    WHERE (strpos(lower(name), lower(p_query)) > 0 OR strpos(lower(email), lower(p_query)) > 0)
      AND (p_role = 'all' OR role = p_role)
      AND (p_status = 'all' OR (p_status = 'active' AND active) OR (p_status = 'inactive' AND NOT active))
  ), counts AS (
    SELECT count(*) AS total, greatest(1, ceil(count(*) / 20.0)::integer) AS pages FROM filtered
  ), bounds AS (
    SELECT total, pages, greatest(1, least(p_page, pages)) AS page FROM counts
  ), numbered AS (
    SELECT *, row_number() OVER (ORDER BY
      CASE WHEN p_sort = 'name' THEN lower(name) END ASC,
      CASE WHEN p_sort = 'oldest' THEN "createdAt" END ASC,
      CASE WHEN p_sort NOT IN ('name', 'oldest') THEN "createdAt" END DESC,
      id ASC) AS position
    FROM filtered
  ), page_rows AS (
    SELECT n.* FROM numbered n, bounds b WHERE n.position > (b.page - 1) * 20 AND n.position <= b.page * 20
  ) SELECT jsonb_build_object(
    'users', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'position' ORDER BY position) FROM page_rows r), '[]'::jsonb),
    'total', b.total, 'page', b.page, 'pageSize', 20, 'pages', b.pages,
    'stats', (SELECT jsonb_build_object('total', count(*), 'active', count(*) FILTER (WHERE active),
      'inactive', count(*) FILTER (WHERE NOT active), 'admins', count(*) FILTER (WHERE active AND role = 'admin')) FROM directory)
  ) FROM bounds b;
$$;
REVOKE ALL ON FUNCTION public.gkl_search_users(text, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gkl_search_users(text, integer, text, text, text) TO service_role;
COMMIT;
