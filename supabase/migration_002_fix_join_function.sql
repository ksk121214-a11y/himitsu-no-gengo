-- join_language_by_code の戻り値カラム名が language_members.language_id と衝突し、
-- "column reference language_id is ambiguous" エラーになっていたのを修正する。
create or replace function join_language_by_code(code text, name text)
returns table(result_language_id uuid, result_language_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  found_id uuid;
  found_name text;
begin
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
