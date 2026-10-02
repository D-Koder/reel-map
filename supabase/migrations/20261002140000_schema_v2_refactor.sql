-- Reel Map v2 Schema Refactor (FIXED)
-- Changes:
-- 1. Merge venues into places (dedup by lat/lng)
-- 2. Create collection_places junction table (places in multiple collections)
-- 3. Merge place_visits into bookings
-- 4. Add streak tracking to profiles
-- 5. Simplify attribution (who added, when)

-- ---------------------------------------------------------------------------
-- Step 1: Add streak fields to profiles (non-breaking)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS best_streak INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

-- ---------------------------------------------------------------------------
-- Step 2: Modify places table (merge venues data)
-- ---------------------------------------------------------------------------
-- Add venue fields from old venues table
ALTER TABLE public.places
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS lat double precision CHECK (lat BETWEEN -90 AND 90),
ADD COLUMN IF NOT EXISTS lng double precision CHECK (lng BETWEEN -180 AND 180),
ADD COLUMN IF NOT EXISTS hours jsonb,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS booking_url text,
ADD COLUMN IF NOT EXISTS website_url text,
ADD COLUMN IF NOT EXISTS subtitle text,
ADD COLUMN IF NOT EXISTS menu_url text,
ADD COLUMN IF NOT EXISTS menu jsonb,
ADD COLUMN IF NOT EXISTS source text,
ADD COLUMN IF NOT EXISTS source_id text;

-- ---------------------------------------------------------------------------
-- Step 3: Create collection_places junction table (NEW)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.collection_places (
  collection_id uuid NOT NULL REFERENCES public.collections (id) ON DELETE CASCADE,
  place_id uuid NOT NULL REFERENCES public.places (id) ON DELETE CASCADE,
  added_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles (id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  position double precision,
  PRIMARY KEY (collection_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_places_collection_id ON public.collection_places (collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_places_place_id ON public.collection_places (place_id);
CREATE INDEX IF NOT EXISTS idx_collection_places_added_by ON public.collection_places (added_by);

-- RLS for collection_places
ALTER TABLE public.collection_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collection_places: members read" ON public.collection_places;
CREATE POLICY "collection_places: members read"
  ON public.collection_places FOR SELECT TO authenticated
  USING (private.is_collection_member(collection_id));

DROP POLICY IF EXISTS "collection_places: member adds" ON public.collection_places;
CREATE POLICY "collection_places: member adds"
  ON public.collection_places FOR INSERT TO authenticated
  WITH CHECK (
    added_by = (SELECT auth.uid())
    AND private.is_collection_member(collection_id)
  );

DROP POLICY IF EXISTS "collection_places: adder removes" ON public.collection_places;
CREATE POLICY "collection_places: adder removes"
  ON public.collection_places FOR DELETE TO authenticated
  USING (added_by = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- Step 4: Merge place_visits into bookings
-- ---------------------------------------------------------------------------
-- Add visit fields to bookings
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS done_at timestamptz,
ADD COLUMN IF NOT EXISTS marked_by uuid REFERENCES public.profiles (id) ON DELETE CASCADE;

-- Create index for marked_by
CREATE INDEX IF NOT EXISTS idx_bookings_marked_by ON public.bookings (marked_by);

-- ---------------------------------------------------------------------------
-- Step 5: Update place_order to include collection_id
-- ---------------------------------------------------------------------------
-- Drop old place_order if it only has user_id + place_id
DROP TABLE IF EXISTS public.place_order;

CREATE TABLE public.place_order (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles (id) ON DELETE CASCADE,
  collection_id uuid NOT NULL REFERENCES public.collections (id) ON DELETE CASCADE,
  place_id uuid NOT NULL REFERENCES public.places (id) ON DELETE CASCADE,
  position double precision NOT NULL,
  PRIMARY KEY (user_id, collection_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_place_order_collection ON public.place_order (collection_id);
CREATE INDEX IF NOT EXISTS idx_place_order_place ON public.place_order (place_id);

-- RLS for place_order
ALTER TABLE public.place_order ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_order: own rows" ON public.place_order;
CREATE POLICY "place_order: own rows"
  ON public.place_order FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND private.is_collection_member(collection_id)
  );

-- ---------------------------------------------------------------------------
-- Step 6: Helper function to update streak on activity
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_streak_on_visit(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.profiles
  SET
    current_streak = current_streak + 1,
    best_streak = GREATEST(best_streak, current_streak + 1),
    last_activity_at = now()
  WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_streak_on_visit(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_streak_on_visit(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Step 7: Create function to add place to collection (dedup + create)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_place_to_collection(
  p_collection_id uuid,
  p_name text,
  p_category text,
  p_lat double precision,
  p_lng double precision,
  p_address text DEFAULT NULL,
  p_hours jsonb DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_booking_url text DEFAULT NULL,
  p_reel_url text DEFAULT NULL,
  p_reel_thumbnail_url text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_source_id text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_place_id uuid;
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  -- Check permission
  IF NOT private.is_collection_member(p_collection_id) THEN
    RAISE EXCEPTION 'You are not a member of this collection';
  END IF;

  -- Try to find existing place by coordinates (within ~1m tolerance)
  SELECT id INTO v_place_id FROM public.places
  WHERE
    p_lat IS NOT NULL AND p_lng IS NOT NULL
    AND lat IS NOT NULL AND lng IS NOT NULL
    AND ABS(lat - p_lat) < 0.00001 AND ABS(lng - p_lng) < 0.00001
  LIMIT 1;

  -- If not found, create new place
  IF v_place_id IS NULL THEN
    INSERT INTO public.places (name, category, lat, lng, address, hours, phone, booking_url,
                               reel_url, reel_thumbnail_url, source, source_id, created_at, updated_at)
    VALUES (p_name, p_category, p_lat, p_lng, p_address, p_hours, p_phone, p_booking_url,
            p_reel_url, p_reel_thumbnail_url, p_source, p_source_id, now(), now())
    RETURNING id INTO v_place_id;
  END IF;

  -- Add place to collection (if not already there)
  INSERT INTO public.collection_places (collection_id, place_id, added_by, added_at)
  VALUES (p_collection_id, v_place_id, v_user_id, now())
  ON CONFLICT (collection_id, place_id) DO NOTHING;

  RETURN v_place_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_place_to_collection(uuid, text, text, double precision, double precision, text, jsonb, text, text, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.add_place_to_collection(uuid, text, text, double precision, double precision, text, jsonb, text, text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Step 8: Update sample data function for new schema
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sample_data()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  c_date uuid;
  c_events uuid;
  c_brunch uuid;
  p uuid;
  next_sat_7pm timestamptz :=
    (date_trunc('day', now() at time zone 'Australia/Melbourne') + interval '2 days 19 hours')
      at time zone 'Australia/Melbourne';
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.collections WHERE owner_id = me) THEN
    RAISE EXCEPTION 'You already have collections';
  END IF;

  INSERT INTO public.collections (name, emoji) VALUES ('Date Night', '📅') RETURNING id INTO c_date;
  INSERT INTO public.collections (name, emoji) VALUES ('Events', '🎉') RETURNING id INTO c_events;
  INSERT INTO public.collections (name, emoji) VALUES ('Brunch Spots', '☕') RETURNING id INTO c_brunch;

  -- Wine & Wild
  SELECT add_place_to_collection(
    c_date, 'Wine & Wild', 'food', -37.7985, 144.9784,
    'Brunswick St, Fitzroy VIC',
    '[{"days":"Mon-Thu","time":"5pm - 11pm"},{"days":"Fri","time":"5pm - 12am"},{"days":"Sat","time":"12pm - 12am"},{"days":"Sun","time":"12pm - 10pm"}]',
    '(03) 9000 1234', 'https://www.opentable.com',
    'https://instagram.com/reels/abc123', 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=160&h=160&fit=crop',
    'manual', NULL
  ) INTO p;
  INSERT INTO public.reactions (place_id, user_id, feeling) VALUES (p, me, 'keen');
  INSERT INTO public.bookings (place_id, booked_by, planned_at) VALUES (p, me, next_sat_7pm);

  -- Italian Bistro
  SELECT add_place_to_collection(
    c_date, 'Italian Bistro', 'food', -37.7990, 144.9668,
    'Lygon St, Carlton VIC',
    '[{"days":"Mon-Sun","time":"5pm - 10pm"}]',
    NULL, NULL, 'https://instagram.com/reels/mno345', NULL,
    'manual', NULL
  ) INTO p;
  INSERT INTO public.reactions (place_id, user_id, feeling) VALUES (p, me, 'keen');

  -- Concert Next Week
  SELECT add_place_to_collection(
    c_events, 'Forum Melbourne', 'event', -37.8164, 144.9696,
    'Flinders St, Melbourne VIC',
    '[{"days":"Thu","time":"7pm - 11pm"},{"days":"Fri","time":"7pm - 12am"},{"days":"Sat","time":"6pm - 12am"}]',
    NULL, 'https://www.ticketmaster.com',
    'https://instagram.com/reels/def456', 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=160&h=160&fit=crop',
    'manual', NULL
  ) INTO p;
  INSERT INTO public.reactions (place_id, user_id, feeling) VALUES (p, me, 'keen');

  -- Tech Festival
  SELECT add_place_to_collection(
    c_events, 'Melbourne Convention Centre', 'event', -37.8253, 144.9536,
    'South Wharf VIC',
    '[{"days":"Sat","time":"10am - 8pm"},{"days":"Sun","time":"10am - 6pm"}]',
    NULL, NULL, 'https://instagram.com/reels/ghi789', NULL,
    'manual', NULL
  ) INTO p;
  INSERT INTO public.reactions (place_id, user_id, feeling) VALUES (p, me, 'maybe');

  -- Brunch Spot Carlton
  SELECT add_place_to_collection(
    c_brunch, 'Brunch Spot Carlton', 'cafe', -37.8001, 144.9711,
    'Rathdowne St, Carlton VIC',
    '[{"days":"Mon-Fri","time":"7am - 3pm"},{"days":"Sat-Sun","time":"8am - 4pm"}]',
    NULL, NULL, 'https://instagram.com/reels/jkl012', 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=160&h=160&fit=crop',
    'manual', NULL
  ) INTO p;
  INSERT INTO public.reactions (place_id, user_id, feeling) VALUES (p, me, 'keen');

  -- Pancake House
  SELECT add_place_to_collection(
    c_brunch, 'Pancake House', 'cafe', -37.8150, 144.9650,
    'Collins St, Melbourne VIC',
    '[{"days":"Daily","time":"8am - 2pm"}]',
    NULL, NULL, 'https://instagram.com/reels/pqr678', NULL,
    'manual', NULL
  ) INTO p;
  INSERT INTO public.reactions (place_id, user_id, feeling) VALUES (p, me, 'meh');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_sample_data() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_sample_data() TO authenticated;

-- ---------------------------------------------------------------------------
-- Step 9: Enable realtime for new tables
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.collection_places,
  public.place_order;
