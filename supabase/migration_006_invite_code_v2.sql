-- 段階2: 招待コードを短い形式(英数字5文字、まぎらわしい文字を除く)にし、
-- 言語作成者(管理者)だけがコードを再発行できる仕組みを追加する。
-- 既存の「単語+数字」形式の招待コードも、そのまま使い続けられるようにする(互換性維持)。

create extension if not exists pgcrypto;

-- 参加: ハイフン・大文字小文字の違いを無視して照合する
drop function if exists join_language_by_code(text, text);
create or replace function join_language_by_code(code text, name text)
returns table(result_language_id uuid, result_language_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  found_id uuid;
  found_name text;
  recent_attempts int;
  normalized_input text;
begin
  normalized_input := upper(regexp_replace(code, '[^a-zA-Z0-9]', '', 'g'));

  select count(*) into recent_attempts
  from join_attempts
  where user_id = auth.uid() and attempted_at > now() - interval '10 minutes';

  if recent_attempts >= 10 then
    raise exception '試行回数が多すぎます。10分ほど待ってからもう一度試してください';
  end if;

  insert into join_attempts (user_id) values (auth.uid());

  select l.id, l.name into found_id, found_name
  from languages l
  where upper(regexp_replace(l.invite_code, '[^a-zA-Z0-9]', '', 'g')) = normalized_input
  limit 1;

  if found_id is null then
    raise exception '合言葉が正しくありません';
  end if;

  insert into language_members (language_id, user_id, display_name, role)
  values (found_id, auth.uid(), name, 'member')
  on conflict (language_id, user_id) do update set display_name = excluded.display_name;

  return query select found_id, found_name;
end;
$$;

-- 言語作成: 作成者を必ず管理者(admin)として登録する(これまで抜けていた)
create or replace function create_language_with_passcode(
  lang_name text, display_name text, invite_code text, creation_passcode text
)
returns table(result_language_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  existing_count int;
begin
  if creation_passcode is distinct from '8473' then
    raise exception '暗証番号が正しくありません';
  end if;

  select count(*) into existing_count from languages where created_by = auth.uid();
  if existing_count >= 3 then
    raise exception 'これ以上、新しい言語は作れません(お1人3個までです)';
  end if;

  new_id := gen_random_uuid();
  insert into languages (id, name, invite_code, created_by) values (new_id, lang_name, invite_code, auth.uid());
  insert into language_members (language_id, user_id, display_name, role) values (new_id, auth.uid(), display_name, 'admin');

  return query select new_id;
end;
$$;

-- 招待コードの再発行(管理者のみ)。クライアントは languages を直接更新できないため、必ずこの関数を経由する。
create or replace function regenerate_invite_code(p_language_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  charset text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 0/O, 1/I/L などまぎらわしい文字を除いた31文字
  charset_len int := length(charset);
  rand_bytes bytea;
  new_code text;
  i int;
  attempt int := 0;
begin
  if not is_admin_of(p_language_id) then
    raise exception 'この操作は管理者だけが行えます';
  end if;

  loop
    rand_bytes := gen_random_bytes(5);
    new_code := '';
    for i in 0..4 loop
      new_code := new_code || substr(charset, 1 + (get_byte(rand_bytes, i) % charset_len), 1);
    end loop;
    attempt := attempt + 1;
    exit when (not exists (select 1 from languages where invite_code = new_code)) or attempt > 20;
  end loop;

  update languages set invite_code = new_code where id = p_language_id;
  return new_code;
end;
$$;
