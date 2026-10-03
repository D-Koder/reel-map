-- Create collection with owner automatically added as a member
CREATE OR REPLACE FUNCTION public.create_collection(p_name text, p_emoji text DEFAULT '📌')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_collection_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to create a collection';
  END IF;

  -- Insert collection
  INSERT INTO public.collections (name, emoji, owner_id)
  VALUES (p_name, p_emoji, v_user_id)
  RETURNING id INTO v_collection_id;

  -- Add owner as member
  INSERT INTO public.collection_members (collection_id, user_id, role)
  VALUES (v_collection_id, v_user_id, 'owner')
  ON CONFLICT (collection_id, user_id) DO NOTHING;

  RETURN v_collection_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_collection(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_collection(text, text) TO authenticated;
