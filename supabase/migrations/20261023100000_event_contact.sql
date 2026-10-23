-- Who to ask about an event, as written in the post: an email, a phone number, or both
-- ("delegation@kotra.com.au / +61 3 9860 0500"). The app turns each into a tap-to-email or tap-to-call link.
alter table public.collection_places
  add column if not exists event_contact text;

alter table public.collection_places
  drop constraint if exists collection_places_event_contact_length;
alter table public.collection_places
  add constraint collection_places_event_contact_length
  check (event_contact is null or char_length(event_contact) <= 120);
