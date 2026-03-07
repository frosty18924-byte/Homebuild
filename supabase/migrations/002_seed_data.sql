-- ============================================================
-- HEARTH - Seed Data
-- Run AFTER 001_initial_schema.sql
-- Replace 'YOUR_HOUSEHOLD_ID' with the UUID returned from the schema migration
-- ============================================================

-- First, get your household ID:
-- select id from households limit 1;

-- Then replace every instance of 'YOUR_HOUSEHOLD_ID' below with that UUID
-- e.g. 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

do $$
declare
  v_hid uuid;
begin
  select id into v_hid from households limit 1;

  -- ─── DEFAULT CHORES ────────────────────────────────────────
  insert into chores (household_id, name, room, icon, assigned, default_freq_days) values
    (v_hid, 'Washing (darks)',    'Laundry',      '🧺', 'Both', 7),
    (v_hid, 'Washing (lights)',   'Laundry',      '👕', 'A',    7),
    (v_hid, 'Change bed sheets',  'Bedroom',      '🛏️', 'Both', 14),
    (v_hid, 'Clean bathroom',     'Bathroom',     '🚿', 'B',    7),
    (v_hid, 'Hoover throughout',  'Whole house',  '🧹', 'A',    7),
    (v_hid, 'Mop kitchen floor',  'Kitchen',      '🧽', 'B',    14),
    (v_hid, 'Clean oven',         'Kitchen',      '🍳', 'Both', 30),
    (v_hid, 'Wipe down surfaces', 'Kitchen',      '🍽️', 'Both', 1),
    (v_hid, 'Take out bins',      'Outside',      '🗑️', 'B',    7),
    (v_hid, 'Clean windows',      'Whole house',  '🪟', 'A',    30),
    (v_hid, 'Descale kettle',     'Kitchen',      '☕', 'A',    30),
    (v_hid, 'Wipe mirrors',       'Bathroom',     '🪞', 'Both', 7);

  -- ─── SEED SOME COMPLETIONS so learning engine has data ─────
  -- Washing darks (completed 3x in last 3 weeks)
  insert into chore_completions (chore_id, completed_at)
  select id, now() - interval '21 days' from chores where household_id = v_hid and name = 'Washing (darks)';
  insert into chore_completions (chore_id, completed_at)
  select id, now() - interval '14 days' from chores where household_id = v_hid and name = 'Washing (darks)';
  insert into chore_completions (chore_id, completed_at)
  select id, now() - interval '7 days' from chores where household_id = v_hid and name = 'Washing (darks)';

  -- Bed sheets (2x)
  insert into chore_completions (chore_id, completed_at)
  select id, now() - interval '28 days' from chores where household_id = v_hid and name = 'Change bed sheets';
  insert into chore_completions (chore_id, completed_at)
  select id, now() - interval '14 days' from chores where household_id = v_hid and name = 'Change bed sheets';

  -- Bathroom (2x)
  insert into chore_completions (chore_id, completed_at)
  select id, now() - interval '15 days' from chores where household_id = v_hid and name = 'Clean bathroom';
  insert into chore_completions (chore_id, completed_at)
  select id, now() - interval '8 days' from chores where household_id = v_hid and name = 'Clean bathroom';

  -- Hoover (3x)
  insert into chore_completions (chore_id, completed_at)
  select id, now() - interval '14 days' from chores where household_id = v_hid and name = 'Hoover throughout';
  insert into chore_completions (chore_id, completed_at)
  select id, now() - interval '7 days' from chores where household_id = v_hid and name = 'Hoover throughout';
  insert into chore_completions (chore_id, completed_at)
  select id, now() - interval '4 days' from chores where household_id = v_hid and name = 'Hoover throughout';

  -- ─── DEFAULT BILLS ──────────────────────────────────────────
  insert into bills (household_id, name, icon, color, provider, bill_type, amount_pence, due_day_of_month, renewal_date) values
    (v_hid, 'Mortgage',            '🏡', '#C1714F', 'Halifax',        'mortgage',       124000, 1,  current_date + interval '95 days'),
    (v_hid, 'Energy (Gas & Elec)', '⚡', '#C4962A', 'Octopus Energy', 'energy',          14200, 15, current_date + interval '55 days'),
    (v_hid, 'Broadband',           '📡', '#7A9E7E', 'BT Broadband',   'broadband',        2800, 22, current_date + interval '42 days'),
    (v_hid, 'Car Insurance',       '🚗', '#C4877A', 'Direct Line',    'car_insurance',    8900, 5,  current_date + interval '78 days'),
    (v_hid, 'Home Insurance',      '🔒', '#8A7E78', 'Churchill',      'home_insurance',   3800, 10, current_date + interval '155 days'),
    (v_hid, 'Council Tax',         '🏛️', '#7A9E7E', 'Local Council',  'council',         19500, 1,  null),
    (v_hid, 'TV Licence',          '📺', '#5a4a42', 'TV Licensing',   'other',            1408, 1,  current_date + interval '120 days');

  raise notice 'Seed complete. Household ID: %', v_hid;
end;
$$;
