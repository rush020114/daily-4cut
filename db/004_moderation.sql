-- 004_moderation.sql : AI 검수, 관리자 승인/거절, 신고 누적 숨김
-- 001, 003 실행 후 Supabase SQL Editor에서 실행한다.
--
-- 만화 상태(status)
--   pending   검수 대기   : 올라온 직후. AI 검수 결과를 기다리거나, AI 검수가 실패해 다시 해야 하는 상태
--   review    승인 대기   : AI 검수를 통과해 관리자의 승인을 기다리는 상태
--   approved  승인        : 공개. 이 상태만 공개 화면에 나온다
--   rejected  거절        : AI 또는 관리자가 거절. 공개되지 않는다
--   hidden    숨김        : 신고가 쌓여 자동으로 숨겨진 상태. 관리자 확인 대기

alter table public.comics drop constraint if exists comics_status_check;
alter table public.comics
  add constraint comics_status_check
  check (status in ('pending', 'review', 'approved', 'rejected', 'hidden'));

-- 새 칸은 anon 에 열지 않는다 (001 에서 칸 단위로만 SELECT 를 줬다)
alter table public.comics
  add column ai_result          jsonb,        -- AI 검수 결과(또는 실패 사유)
  add column ai_checked_at      timestamptz,
  add column reviewed_at        timestamptz,  -- 승인/거절된 시각
  add column hidden_at          timestamptz,  -- 신고 누적으로 숨겨진 시각
  add column report_cleared_at  timestamptz;  -- 관리자가 확인한 시각. 이전 신고는 다시 세지 않는다

-- ───────────────────────── 신고 ─────────────────────────
create table public.comic_reports (
  id         bigint generated always as identity primary key,
  comic_id   uuid not null references public.comics (id) on delete cascade,
  device_id  text not null,
  ip_hash    text not null,
  reason     text not null check (reason in ('inappropriate', 'copyright', 'other')),
  created_at timestamptz not null default now()
);

create index comic_reports_comic_idx  on public.comic_reports (comic_id, created_at);
create index comic_reports_device_idx on public.comic_reports (device_id, created_at);
create index comic_reports_ip_idx     on public.comic_reports (ip_hash, created_at);

alter table public.comic_reports enable row level security;
-- 정책을 만들지 않는다: service_role 만 사용.
grant all on public.comic_reports to service_role;

-- ───────────────────────── AI 검수 결과 저장 ─────────────────────────
-- 검수 대기(pending)인 만화에만 적용한다. 그 사이 관리자가 먼저 처리했으면 null 을 돌려주고 아무것도 바꾸지 않는다.
create function public.set_comic_ai_result(p_id uuid, p_status text, p_result jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if p_status not in ('review', 'rejected') then
    raise exception 'bad_status';
  end if;

  update public.comics c
     set status = p_status,
         ai_result = p_result,
         ai_checked_at = now(),
         reviewed_at = case when p_status = 'rejected' then now() else null end
   where c.id = p_id and c.status = 'pending'
  returning c.status into v_status;

  return v_status;
end;
$$;

-- ───────────────────────── 관리자 승인/거절 ─────────────────────────
--   승인: 검수 대기·승인 대기·숨김·거절 → 승인   (숨김에서 승인하면 이전 신고는 다시 세지 않는다)
--   거절: 검수 대기·승인 대기·숨김·승인 → 거절   (승인된 것을 내릴 때도 쓴다)
create function public.admin_decide_comic(p_id uuid, p_decision text)
returns table (out_prev text, out_status text, out_nickname text, out_email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev     text;
  v_nickname text;
  v_email    text;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'bad_decision';
  end if;

  select c.status, c.author_nickname, c.contact_email
    into v_prev, v_nickname, v_email
    from public.comics c where c.id = p_id for update;
  if not found then
    raise exception 'comic_not_found' using errcode = 'P0002';
  end if;

  if p_decision = 'approve' then
    if v_prev not in ('pending', 'review', 'hidden', 'rejected') then
      raise exception 'invalid_state';
    end if;
    update public.comics c
       set status = 'approved',
           published_at = coalesce(c.published_at, now()),
           reviewed_at = now(),
           hidden_at = null,
           report_cleared_at = case when v_prev = 'hidden' then now() else c.report_cleared_at end
     where c.id = p_id;
  else
    if v_prev not in ('pending', 'review', 'hidden', 'approved') then
      raise exception 'invalid_state';
    end if;
    update public.comics c set status = 'rejected', reviewed_at = now() where c.id = p_id;
  end if;

  return query
    select v_prev, case when p_decision = 'approve' then 'approved' else 'rejected' end, v_nickname, v_email;
end;
$$;

-- ───────────────────────── 신고 접수 ─────────────────────────
--   같은 기기 또는 같은 IP 는 한 만화를 한 번만 신고할 수 있다. (관리자가 확인한 뒤에는 다시 신고할 수 있다)
--   기기당 하루 10건, IP당 하루 30건을 넘으면 접수하지 않는다.
--   확인된 신고가 p_threshold 건 이상 쌓이면 만화를 숨김(hidden)으로 바꾼다.
create function public.report_comic(
  p_comic_id  uuid,
  p_device_id text,
  p_ip_hash   text,
  p_reason    text,
  p_threshold integer
)
returns table (out_reported boolean, out_already boolean, out_hidden boolean, out_rate_limited boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cleared timestamptz;
  v_count   integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('report:' || p_comic_id::text, 0));

  select c.report_cleared_at into v_cleared
    from public.comics c
   where c.id = p_comic_id and c.status = 'approved' and c.published_at <= now();
  if not found then
    raise exception 'comic_not_found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.comic_reports r
              where r.comic_id = p_comic_id
                and (r.device_id = p_device_id or r.ip_hash = p_ip_hash)
                and r.created_at > coalesce(v_cleared, '-infinity'::timestamptz)) then
    return query select false, true, false, false;
    return;
  end if;

  if (select count(*) from public.comic_reports r
       where r.device_id = p_device_id and r.created_at > now() - interval '24 hours') >= 10
     or (select count(*) from public.comic_reports r
          where r.ip_hash = p_ip_hash and r.created_at > now() - interval '24 hours') >= 30 then
    return query select false, false, false, true;
    return;
  end if;

  insert into public.comic_reports (comic_id, device_id, ip_hash, reason)
  values (p_comic_id, p_device_id, p_ip_hash, p_reason);

  select count(*) into v_count
    from public.comic_reports r
   where r.comic_id = p_comic_id
     and r.created_at > coalesce(v_cleared, '-infinity'::timestamptz);

  if v_count >= p_threshold then
    update public.comics c
       set status = 'hidden', hidden_at = now()
     where c.id = p_comic_id and c.status = 'approved';
    return query select true, false, true, false;
  else
    return query select true, false, false, false;
  end if;
end;
$$;

revoke all on function public.set_comic_ai_result(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.admin_decide_comic(uuid, text) from public, anon, authenticated;
revoke all on function public.report_comic(uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.set_comic_ai_result(uuid, text, jsonb) to service_role;
grant execute on function public.admin_decide_comic(uuid, text) to service_role;
grant execute on function public.report_comic(uuid, text, text, text, integer) to service_role;
