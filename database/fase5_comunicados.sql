-- ============================================================
-- FASE 5 - COMUNICADOS (CRUD ADMIN + HOME)
-- Cria persistencia real para comunicados da home.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Fallback para projetos antigos sem helper is_admin()
DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.is_admin()
      RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER
      AS $inner$
        SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
      $inner$;
    $fn$;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.comunicados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  summary text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  cover_image_url text,
  type text NOT NULL DEFAULT 'comunicado' CHECK (type IN ('comunicado', 'novidade', 'parceria', 'aviso')),
  author_name text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS idx_comunicados_status ON public.comunicados(status);
CREATE INDEX IF NOT EXISTS idx_comunicados_published_at ON public.comunicados(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_comunicados_created_at ON public.comunicados(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_comunicados_slug_lower ON public.comunicados((lower(slug)));

CREATE OR REPLACE FUNCTION public.comunicados_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.title := trim(coalesce(NEW.title, ''));
  NEW.slug := lower(trim(coalesce(NEW.slug, '')));
  NEW.summary := coalesce(NEW.summary, '');
  NEW.content := coalesce(NEW.content, '');
  NEW.author_name := nullif(trim(coalesce(NEW.author_name, '')), '');
  NEW.type := lower(trim(coalesce(NEW.type, 'comunicado')));
  NEW.status := lower(trim(coalesce(NEW.status, 'draft')));

  IF NEW.title = '' THEN
    RAISE EXCEPTION 'Titulo do comunicado e obrigatorio.';
  END IF;

  IF NEW.slug = '' THEN
    RAISE EXCEPTION 'Slug do comunicado e obrigatorio.';
  END IF;

  IF NEW.type NOT IN ('comunicado', 'novidade', 'parceria', 'aviso') THEN
    NEW.type := 'comunicado';
  END IF;

  IF NEW.status NOT IN ('draft', 'published') THEN
    NEW.status := 'draft';
  END IF;

  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  ELSIF NEW.status = 'draft' THEN
    NEW.published_at := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := coalesce(NEW.created_by, auth.uid());
    NEW.created_at := coalesce(NEW.created_at, now());
  END IF;

  NEW.updated_by := auth.uid();
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comunicados_before_write ON public.comunicados;
CREATE TRIGGER trg_comunicados_before_write
BEFORE INSERT OR UPDATE ON public.comunicados
FOR EACH ROW
EXECUTE FUNCTION public.comunicados_before_write();

ALTER TABLE public.comunicados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comunicados_read_published_or_admin" ON public.comunicados;
CREATE POLICY "comunicados_read_published_or_admin" ON public.comunicados
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (status = 'published' OR is_admin())
  );

DROP POLICY IF EXISTS "comunicados_admin_write" ON public.comunicados;
CREATE POLICY "comunicados_admin_write" ON public.comunicados
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comunicados TO authenticated;

COMMIT;
