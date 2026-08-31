-- 部屋(言語)の作成を「暗証番号を知っている人だけ」「1人3個まで」に制限する。
-- 暗証番号はこの関数の中だけに書かれていて、クライアント側のJS・コンソールには一切出てこない。

-- 直接INSERTでの部屋作成・参加を禁止し、必ず下の関数(SECURITY DEFINER)経由にする
drop policy if exists "languages_insert_any_authed" on languages;
drop policy if exists "members_insert_self" on language_members;

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
  insert into language_members (language_id, user_id, display_name) values (new_id, auth.uid(), display_name);

  return query select new_id;
end;
$$;
