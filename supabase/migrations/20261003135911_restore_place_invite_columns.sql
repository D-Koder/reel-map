-- Restore columns expected by the current soft-delete and invite flows.
-- IF NOT EXISTS keeps this safe for databases where the original migrations ran.
ALTER TABLE public.places
	ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
	ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.collection_invites
	ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles (id) ON DELETE CASCADE;

-- Preserve older invite rows by assigning them to the current collection owner.
UPDATE public.collection_invites AS invite
SET created_by = collection.owner_id
FROM public.collections AS collection
WHERE collection.id = invite.collection_id
	AND invite.created_by IS NULL;

ALTER TABLE public.collection_invites
	ALTER COLUMN created_by SET DEFAULT auth.uid(),
	ALTER COLUMN created_by SET NOT NULL;

CREATE INDEX IF NOT EXISTS collection_invites_created_by_idx
	ON public.collection_invites (created_by);

-- Rebuild the policies that depend on created_by; invite updates remain disabled.
DROP POLICY IF EXISTS "collection invites: creators read" ON public.collection_invites;
CREATE POLICY "collection invites: creators read"
	ON public.collection_invites FOR SELECT TO authenticated
	USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "collection invites: collection owners create" ON public.collection_invites;
CREATE POLICY "collection invites: collection owners create"
	ON public.collection_invites FOR INSERT TO authenticated
	WITH CHECK (
		created_by = (SELECT auth.uid())
		AND private.is_collection_owner(collection_id)
	);

DROP POLICY IF EXISTS "collection invites: creators delete" ON public.collection_invites;
CREATE POLICY "collection invites: creators delete"
	ON public.collection_invites FOR DELETE TO authenticated
	USING (created_by = (SELECT auth.uid()));

NOTIFY pgrst, 'reload schema';
