-- words テーブルに、辞書の詳細項目(品詞・発音メモ・説明・例文・メモ)を追加する。
-- SQL Editor でこれを追加実行してください(schema.sql を実行済みであること)。

alter table words add column if not exists pos text not null default '';
alter table words add column if not exists pronunciation text not null default '';
alter table words add column if not exists description text not null default '';
alter table words add column if not exists example text not null default '';
alter table words add column if not exists memo text not null default '';
