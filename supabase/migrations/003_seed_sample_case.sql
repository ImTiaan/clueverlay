insert into cases (
  id,
  scene_narrative,
  victim_name,
  victim_description,
  victim_avatar_url,
  solution_summary,
  evidence_items,
  suspect_count,
  evidence_count,
  status,
  created_at,
  updated_at
)
values (
  '11111111-1111-1111-1111-111111111111',
  'A champagne tower collapsed at the Blackthorne Gallery opening. In the confusion, curator Evelyn Shaw was found dead in the locked conservation room.',
  'Evelyn Shaw',
  'Gallery curator, elegant and exacting, discovered beside a toppled archive case.',
  'https://api.dicebear.com/10.x/adventurer/svg?seed=evelyn-shaw',
  'Jonah had access to the conservation room and overcompensated in both statements. The ledger smear and missing keycard place him inside before the alarm.',
  '[
    {"name":"silver keycard","detail":"Found beneath the archive cabinet. It belongs to the conservation room and has fresh black paint on one edge."},
    {"name":"ledger page","detail":"A torn shipping ledger page is smeared with black paint and signed off by Jonah Mercer an hour after the gallery closed."},
    {"name":"champagne flute","detail":"A flute on the tray is dry except for a lip print. It was planted after the spill, not carried through it."}
  ]'::jsonb,
  3,
  3,
  'ready',
  now(),
  now()
)
on conflict (id) do nothing;

insert into suspects (
  id,
  case_id,
  name,
  description,
  avatar_url,
  statement_v1,
  statement_v2,
  sort_order,
  created_at
)
values
  (
    '22222222-2222-2222-2222-222222222221',
    '11111111-1111-1111-1111-111111111111',
    'Jonah Mercer',
    'Assistant curator, immaculate suit, rehearsed calm',
    'https://api.dicebear.com/10.x/adventurer/svg?seed=jonah-mercer',
    'I was in the foyer managing the guest list when the tower came down. I did not leave that desk until people started screaming.',
    'I stayed by the front desk the entire time, calming guests and counting names. I never went near the conservation room.',
    0,
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Mara Vale',
    'Guest artist, paint-stained cuffs, visibly rattled',
    'https://api.dicebear.com/10.x/adventurer/svg?seed=mara-vale',
    'I was outside smoking because the room was too loud. I came back in when someone shouted Evelyn''s name.',
    'I was drifting between the courtyard and the bar. I saw the champagne fall, then everyone rushed away from me toward the back hall.',
    1,
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222223',
    '11111111-1111-1111-1111-111111111111',
    'Felix Dune',
    'Security contractor, clipped tone, watchful',
    'https://api.dicebear.com/10.x/adventurer/svg?seed=felix-dune',
    'I was checking the east stairwell alarm because it kept chirping. By the time I reached the conservation wing, the door was already blocked by guests.',
    'I had gone to inspect a sensor fault near the stairwell. I only saw the conservation room after the panic started.',
    2,
    now()
  )
on conflict (id) do nothing;

update cases
set guilty_suspect_id = '22222222-2222-2222-2222-222222222221',
    updated_at = now()
where id = '11111111-1111-1111-1111-111111111111'
  and guilty_suspect_id is distinct from '22222222-2222-2222-2222-222222222221';
