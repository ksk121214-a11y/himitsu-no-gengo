-- 段階1: メンバーの役割(管理者/参加者)と、編集履歴・復元の仕組みを追加する。
-- 既存テーブル・既存データは削除せず、追記のみ行う。

-- ============ 1. メンバーの役割 ============
alter table language_members add column if not exists role text not null default 'member';
alter table language_members drop constraint if exists language_members_role_check;
alter table language_members add constraint language_members_role_check check (role in ('admin', 'member'));

-- 既存データ: 言語の作成者を管理者にする
update language_members lm
set role = 'admin'
from languages l
where lm.language_id = l.id and lm.user_id = l.created_by and lm.role <> 'admin';

-- 管理者かどうかを判定するヘルパー(他の関数・RLSから使う)
create or replace function is_admin_of(target_language_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from language_members
    where language_id = target_language_id and user_id = auth.uid() and role = 'admin'
  );
$$;

-- ============ 2. 編集履歴 ============
create table if not exists edit_history (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references languages(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  actor_name text not null,
  target_type text not null check (target_type in ('word', 'rule', 'sound_glyph', 'example')),
  target_id text not null,
  action text not null check (action in ('create', 'update', 'delete', 'restore')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
alter table edit_history enable row level security;

drop policy if exists "edit_history_select_members" on edit_history;
create policy "edit_history_select_members" on edit_history
  for select using (is_member_of(language_id));
-- INSERTは下のトリガー(SECURITY DEFINER)だけが行う。クライアントが直接書き込めるポリシーはあえて作らない。

create index if not exists edit_history_language_id_idx on edit_history (language_id, created_at desc);

-- 汎用の履歴記録トリガー関数(単語・ルール・文字の変更を自動で記録する)
create or replace function log_edit_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_language_id uuid;
  v_target_id text;
  v_action text;
  v_actor_name text;
begin
  if TG_OP = 'DELETE' then
    v_language_id := OLD.language_id;
    v_target_id := OLD.id::text;
    v_action := 'delete';
  else
    v_language_id := NEW.language_id;
    v_target_id := NEW.id::text;
    if TG_OP = 'INSERT' then v_action := 'create'; else v_action := 'update'; end if;
  end if;

  if current_setting('app.is_restore', true) = 'true' then
    v_action := 'restore';
  end if;

  select display_name into v_actor_name
  from language_members
  where language_id = v_language_id and user_id = auth.uid();

  insert into edit_history (language_id, user_id, actor_name, target_type, target_id, action, before_data, after_data)
  values (
    v_language_id, auth.uid(), coalesce(v_actor_name, '不明なメンバー'), TG_ARGV[0], v_target_id, v_action,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) else null end
  );

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$;

drop trigger if exists trg_words_history on words;
create trigger trg_words_history after insert or update or delete on words
for each row execute function log_edit_history('word');

drop trigger if exists trg_rules_history on rules;
create trigger trg_rules_history after insert or update or delete on rules
for each row execute function log_edit_history('rule');

drop trigger if exists trg_sound_glyphs_history on sound_glyphs;
create trigger trg_sound_glyphs_history after insert or update or delete on sound_glyphs
for each row execute function log_edit_history('sound_glyph');

-- ============ 3. 復元 ============
create or replace function restore_edit_history(p_history_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h edit_history%rowtype;
begin
  select * into h from edit_history where id = p_history_id;
  if h is null then
    raise exception '履歴が見つかりません';
  end if;
  if not is_member_of(h.language_id) then
    raise exception 'この言語のメンバーではありません';
  end if;
  if h.before_data is null then
    raise exception '復元できるデータがありません';
  end if;

  perform set_config('app.is_restore', 'true', true);

  if h.target_type = 'word' then
    insert into words (id, language_id, reading, meaning, categories, forms, pos, pronunciation, description, example, memo, created_by, created_at, updated_at)
    values (
      (h.before_data->>'id')::uuid, h.language_id,
      h.before_data->>'reading', h.before_data->>'meaning',
      coalesce((select array_agg(x) from jsonb_array_elements_text(h.before_data->'categories') x), '{}'),
      coalesce(h.before_data->'forms', '[]'::jsonb),
      coalesce(h.before_data->>'pos', ''), coalesce(h.before_data->>'pronunciation', ''),
      coalesce(h.before_data->>'description', ''), coalesce(h.before_data->>'example', ''),
      coalesce(h.before_data->>'memo', ''), auth.uid(), now(), now()
    )
    on conflict (id) do update set
      reading = excluded.reading, meaning = excluded.meaning, categories = excluded.categories,
      forms = excluded.forms, pos = excluded.pos, pronunciation = excluded.pronunciation,
      description = excluded.description, example = excluded.example, memo = excluded.memo,
      updated_at = now();

  elsif h.target_type = 'rule' then
    insert into rules (id, language_id, category, title, content, pattern, is_conjugation, created_by, created_at, updated_at)
    values (
      (h.before_data->>'id')::uuid, h.language_id,
      h.before_data->>'category', h.before_data->>'title', h.before_data->>'content',
      h.before_data->'pattern', coalesce((h.before_data->>'is_conjugation')::boolean, false),
      auth.uid(), now(), now()
    )
    on conflict (id) do update set
      category = excluded.category, title = excluded.title, content = excluded.content,
      pattern = excluded.pattern, is_conjugation = excluded.is_conjugation, updated_at = now();

  elsif h.target_type = 'sound_glyph' then
    insert into sound_glyphs (id, language_id, sound, reading, svg_paths, created_by, created_at)
    values (
      (h.before_data->>'id')::uuid, h.language_id,
      h.before_data->>'sound', coalesce(h.before_data->>'reading', ''), h.before_data->>'svg_paths',
      auth.uid(), now()
    )
    on conflict (language_id, sound) do update set
      svg_paths = excluded.svg_paths, reading = excluded.reading;

  else
    raise exception '未対応の種類です';
  end if;
end;
$$;
