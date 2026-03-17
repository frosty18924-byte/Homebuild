-- Migration: Add meal favorites and cupboard items

create table if not exists meal_favorites (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  meal_name text not null,
  meal_tag text not null default 'quick',
  prep_time_mins int not null default 20,
  source text,
  recipe text,
  ingredients jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  unique(household_id, meal_name)
);

create table if not exists cupboard_items (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  item text not null,
  quantity text,
  notes text,
  created_at timestamptz default now()
);

alter table meal_favorites enable row level security;
alter table cupboard_items enable row level security;

create policy "anon_all_meal_favorites" on meal_favorites for all using (true) with check (true);
create policy "anon_all_cupboard_items" on cupboard_items for all using (true) with check (true);
