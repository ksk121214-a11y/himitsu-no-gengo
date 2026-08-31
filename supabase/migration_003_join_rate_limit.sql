-- 合言葉の総当たり対策: 同じ人が短時間に何度も参加を試みたら一時的に止める。
create table if not exists join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
alter table join_attempts enable row level security;
-- ポリシーを何も付けないことで、クライアントから直接は一切読み書きできないようにする
-- (下の関数だけが SECURITY DEFINER として例外的にアクセスできる)。

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
begin
  select count(*) into recent_attempts
  from join_attempts
  where user_id = auth.uid() and attempted_at > now() - interval '10 minutes';

  if recent_attempts >= 10 then
    raise exception '試行回数が多すぎます。10分ほど待ってからもう一度試してください';
  end if;

  insert into join_attempts (user_id) values (auth.uid());

  select l.id, l.name into found_id, found_name
  from languages l
  where l.invite_code = code
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
