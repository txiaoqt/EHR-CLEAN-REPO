-- ============================================================================
-- Migration: normalise personal-name casing
-- ============================================================================
--
-- The register contained SHOUTED and all-lowercase names, because nothing
-- normalised them on the way in:
--
--   TUPM-25-0001  'EMIEL JOHN'            -> 'Emiel John'
--   TUPM-25-0025  'EMIEL JOHN'            -> 'Emiel John'
--   TUPM-23-5003  'emiel john estabaya'   -> 'Emiel John Estabaya'
--
-- New registrations are normalised in the app (src/utils/nameFormat.js). This
-- adds the SQL counterpart so existing rows and any future bulk import can be
-- fixed the same way, and applies it.
--
-- `initcap` alone is not enough for Filipino names: it would produce
-- "Maria Dela Cruz" and "Juan Santos Iii". This keeps lowercase particles
-- ("Maria dela Cruz") and uppercase suffixes ("Juan Santos III").
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proper_name(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN value IS NULL OR btrim(value) = '' THEN value
    ELSE (
      SELECT string_agg(
               CASE
                 -- Lowercase particles, unless they open the name.
                 WHEN ord > 1 AND lower(w) = ANY (ARRAY[
                   'de','del','dela','delas','dels','der','den',
                   'van','von','vin','da','das',
                   'la','las','lo','los','le','les',
                   'san','santa','sto','sta','bin','binti','al'
                 ]) THEN lower(w)
                 -- Generational suffixes stay uppercase.
                 WHEN lower(w) ~ '^(i{1,3}|iv|v|vi{0,3}|ix|x)$' THEN upper(w)
                 ELSE initcap(w)
               END,
               ' ' ORDER BY ord
             )
        FROM unnest(
               string_to_array(btrim(regexp_replace(value, '\s+', ' ', 'g')), ' ')
             ) WITH ORDINALITY AS t(w, ord)
    )
  END;
$$;

COMMENT ON FUNCTION public.proper_name(text) IS
  'Proper-case a personal name: keeps lowercase particles (dela, del, van) and uppercase suffixes (III, Jr).';

-- ---------------------------------------------------------------------------
-- Apply to the clinical record. proper_name is idempotent, so already-correct
-- names are rewritten to themselves and nothing else changes.
-- ---------------------------------------------------------------------------
UPDATE public.patients
   SET name = public.proper_name(name),
       updated_at = now()
 WHERE name IS DISTINCT FROM public.proper_name(name);

UPDATE public.students
   SET name = public.proper_name(name),
       updated_at = now()
 WHERE name IS DISTINCT FROM public.proper_name(name);

UPDATE public.patient_profiles
   SET full_name = public.proper_name(full_name),
       updated_at = now()
 WHERE full_name IS DISTINCT FROM public.proper_name(full_name);

UPDATE public.users
   SET name = public.proper_name(name),
       updated_at = now()
 WHERE name IS DISTINCT FROM public.proper_name(name);
