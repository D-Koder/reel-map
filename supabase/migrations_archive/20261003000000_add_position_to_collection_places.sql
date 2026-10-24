-- Fix: Add position column to collection_places if it doesn't exist
-- This ensures new accounts get the proper schema

ALTER TABLE public.collection_places
ADD COLUMN IF NOT EXISTS position double precision;
