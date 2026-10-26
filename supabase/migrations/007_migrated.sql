-- POSER v7: the Migrated column showed old coins (days or years old) as if they just graduated.
-- Clears the migration time on coins whose "migration" we only noticed long after launch. Run after 006_speed.sql.
update coins set migrated_at = null
where migrated_at is not null and created_at < migrated_at - interval '3 days';
create index if not exists coins_migrated_idx on coins (migrated_at desc) where complete;