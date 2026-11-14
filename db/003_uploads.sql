-- 003_uploads.sql : 누구나 올리기 (검수 대기 저장, 하루 업로드 제한)
-- 001_comics.sql 실행 후 Supabase SQL Editor에서 실행한다.

-- 올린 사람 정보. 공개 역할(anon)에는 열지 않는다.
-- (001에서 anon 에는 칸 단위로만 SELECT 를 줬으므로, 새 칸은 자동으로 service_role 만 읽는다.)
alter table public.comics
  add column uploader_device_id text,
  add column uploader_ip_hash   text,
  add column contact_email      text,        -- 연락받을 이메일(선택)
  add column terms_version      text,        -- 동의한 약관 버전
  add column terms_accepted_at  timestamptz;

create index comics_uploader_device_idx on public.comics (uploader_device_id, created_at);
create index comics_uploader_ip_idx     on public.comics (uploader_ip_hash, created_at);

-- 검수 대기('pending') 만화를 만든다.
--   같은 기기 또는 같은 IP 가 최근 24시간 안에 p_daily_limit 개 이상 올렸으면 만들지 않고 out_rate_limited = true.
--   확인과 저장을 한 트랜잭션에서 하고, 기기·IP별 잠금으로 동시에 여러 개를 올려 제한을 넘기는 것을 막는다.
create function public.create_pending_comic(
  p_id            uuid,
  p_image_key     text,
  p_width         integer,
  p_height        integer,
  p_nickname      text,
  p_email         text,
  p_device_id     text,
  p_ip_hash       text,
  p_terms_version text,
  p_daily_limit   integer
)
returns table (out_created boolean, out_rate_limited boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('upload:device:' || p_device_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('upload:ip:' || p_ip_hash, 0));

  if (select count(*) from public.comics c
       where c.uploader_device_id = p_device_id
         and c.created_at > now() - interval '24 hours') >= p_daily_limit
     or (select count(*) from public.comics c
          where c.uploader_ip_hash = p_ip_hash
            and c.created_at > now() - interval '24 hours') >= p_daily_limit
  then
    return query select false, true;
    return;
  end if;

  insert into public.comics (
    id, image_key, image_width, image_height, status, author_nickname, contact_email,
    uploader_device_id, uploader_ip_hash, terms_version, terms_accepted_at
  ) values (
    p_id, p_image_key, p_width, p_height, 'pending', p_nickname, p_email,
    p_device_id, p_ip_hash, p_terms_version, now()
  );

  return query select true, false;
end;
$$;

revoke all on function public.create_pending_comic(uuid, text, integer, integer, text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.create_pending_comic(uuid, text, integer, integer, text, text, text, text, text, integer)
  to service_role;
