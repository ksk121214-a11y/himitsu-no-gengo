-- migration_006 の修正: Supabase では pgcrypto が public ではなく extensions スキーマに
-- インストールされているため、gen_random_bytes が見つからないエラーになっていた。
-- search_path に extensions を含める形に直す。
create or replace function regenerate_invite_code(p_language_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
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
