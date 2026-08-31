-- 「秘密の言語」 Supabase 連携用スキーマ
-- Supabase の SQL Editor に貼り付けて一括実行してください。
-- 匿名認証(Authentication > Providers > Anonymous Sign-ins)を先にONにしておくこと。

-- ============ テーブル ============

create table if not exists languages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null,              -- 合言葉。RLSでSELECT自体を絞るのでここは平文でも可
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists language_members (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references languages(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (language_id, user_id)
);

create table if not exists words (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references languages(id) on delete cascade,
  reading text not null,
  meaning text not null,
  categories text[] not null default '{}',
  forms jsonb not null default '[]',      -- 活用形の配列 [{id,label,reading,meaning,sourceRuleId}, ...]
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rules (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references languages(id) on delete cascade,
  category text not null,
  title text not null,
  content text not null default '',
  pattern jsonb,                          -- 活用パターン {type, pairs?, from?, to?}
  is_conjugation boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sound_glyphs (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references languages(id) on delete cascade,
  sound text not null,                    -- 母音/子音/数字のキー(例: 'a', 'ka', '3')
  reading text,                           -- 数字用の読み方
  svg_paths text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (language_id, sound)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references languages(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id),
  sender_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);

-- ============ RLS 有効化 ============

alter table languages enable row level security;
alter table language_members enable row level security;
alter table words enable row level security;
alter table rules enable row level security;
alter table sound_glyphs enable row level security;
alter table messages enable row level security;

-- メンバーかどうかを判定するヘルパー(SECURITY DEFINERで再帰RLSを回避)
create or replace function is_member_of(target_language_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from language_members
    where language_id = target_language_id and user_id = auth.uid()
  );
$$;

-- languages: メンバーだけ閲覧可。作成は誰でも可(作成者=最初のメンバーになる)
create policy "languages_select_members" on languages
  for select using (is_member_of(id));
create policy "languages_insert_any_authed" on languages
  for insert with check (auth.uid() is not null and created_by = auth.uid());

-- language_members: 同じ言語のメンバー同士は互いに見える。自分の行だけ作成可
create policy "members_select_same_language" on language_members
  for select using (is_member_of(language_id));
create policy "members_insert_self" on language_members
  for insert with check (user_id = auth.uid());

-- words / rules / sound_glyphs / messages: メンバー全員が読み書き可(お互い編集できるように)
create policy "words_all_members" on words
  for all using (is_member_of(language_id)) with check (is_member_of(language_id));
create policy "rules_all_members" on rules
  for all using (is_member_of(language_id)) with check (is_member_of(language_id));
create policy "glyphs_all_members" on sound_glyphs
  for all using (is_member_of(language_id)) with check (is_member_of(language_id));
create policy "messages_select_members" on messages
  for select using (is_member_of(language_id));
create policy "messages_insert_members" on messages
  for insert with check (is_member_of(language_id) and sender_user_id = auth.uid());

-- ============ 合言葉で参加する関数 ============
-- 招待コードを知っている人だけが、languagesテーブルを直接SELECTすることなく参加できるようにする。
create or replace function join_language_by_code(code text, name text)
returns table(language_id uuid, language_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  found_id uuid;
  found_name text;
begin
  select id, languages.name into found_id, found_name
  from languages
  where invite_code = code
  limit 1;

  if found_id is null then
    raise exception '合言葉が正しくありません';
  end if;

  insert into language_members (language_id, user_id, display_name)
  values (found_id, auth.uid(), name)
  on conflict (language_id, user_id) do update set display_name = excluded.display_name;

  return query select found_id, found_name;
end;
$$;

-- ============ リアルタイム配信を有効化 ============
alter publication supabase_realtime add table words;
alter publication supabase_realtime add table rules;
alter publication supabase_realtime add table sound_glyphs;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table language_members;
