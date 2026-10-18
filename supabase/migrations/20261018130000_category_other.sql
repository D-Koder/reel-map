-- Adds 'other' as a place category, for places that aren't a cafe, food spot or event.
alter table places drop constraint places_category_check;
alter table places add constraint places_category_check
  check (category in ('cafe', 'food', 'event', 'other'));

alter table collection_places drop constraint collection_places_category_check;
alter table collection_places add constraint collection_places_category_check
  check (category in ('cafe', 'food', 'event', 'other'));
