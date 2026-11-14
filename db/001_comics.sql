-- 001_comics.sql : 만화·오늘의 만화·좋아요 테이블, RLS, GRANT, 좋아요 함수
-- Supabase SQL Editor에서 한 번에 실행한다. (Automatically expose new tables 끔 / automatic RLS 켬 기준)
--
-- 접근 방식
--   * 브라우저는 Supabase에 직접 붙지 않고 /api/* (Pages Functions)만 부른다.
--   * 읽기(공개 만화·점수·오늘의 만화)는 Publishable key(anon 역할) + RLS로 승인된 것만.
--   * 쓰기(좋아요, 오늘의 만화 지정)와 기기별 좋아요 기록은 Secret key(service_role 역할)만.

-- ───────────────────────── 만화 ─────────────────────────
create table public.comics (
  id              uuid primary key default gen_random_uuid(),
  -- R2 객체 키. 샘플 만화는 '/samples/…' 처럼 '/'로 시작하는 정적 경로를 쓴다.
  image_key       text not null,
  image_width     integer,
  image_height    integer,
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  like_count      integer not null default 0 check (like_count >= 0),

  -- 나중에 쓸 칸 (지금은 시리즈 기능 없음)
  author_nickname text,
  author_id       uuid,            -- 8단계 로그인 후 auth.users 와 연결
  series_id       uuid,            -- 9-4 시리즈 연결용
  published_at    timestamptz,     -- 공개일. 승인할 때 채우고, 미래로 두면 그날부터 노출

  is_sample       boolean not null default false,  -- 화면 확인용 샘플 표시
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint comics_approved_has_published_at
    check (status <> 'approved' or published_at is not null)
);

create index comics_public_idx
  on public.comics (published_at desc)
  where status = 'approved';

create function public.touch_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger comics_touch_updated_at
  before update on public.comics
  for each row execute function public.touch_updated_at();

alter table public.comics enable row level security;

-- 공개: 승인되고 공개일이 지난 만화만
create policy comics_public_read on public.comics
  for select to anon, authenticated
  using (status = 'approved' and published_at <= now());

-- 공개 역할에는 필요한 칸만 열어 준다 (author_id, is_sample 등은 제외)
grant select (id, image_key, image_width, image_height, status, like_count,
              author_nickname, series_id, published_at, created_at)
  on public.comics to anon, authenticated;
grant all on public.comics to service_role;

-- ───────────────────────── 노출 점수 ─────────────────────────
-- 점수 = (좋아요 + 1) / (공개 후 경과 시간(h) + 2) ^ 1.3
-- 시간이 지나면 점수가 내려가서 오래된 만화가 계속 위에 있지 않는다. 1.3 을 키우면 더 빨리 내려간다.
create view public.ranked_comics
with (security_invoker = true) as
select
  c.id,
  c.image_key,
  c.image_width,
  c.image_height,
  c.like_count,
  c.published_at,
  (c.like_count + 1)::double precision
    / power(greatest(extract(epoch from (now() - c.published_at)) / 3600.0, 0) + 2, 1.3) as score
from public.comics c
where c.status = 'approved' and c.published_at <= now();

grant select on public.ranked_comics to anon, authenticated;
grant select on public.ranked_comics to service_role;

-- ───────────────────────── 오늘의 만화 지정 ─────────────────────────
-- 날짜(한국 시간)별로 한 편. 지정이 없는 날은 점수 1위가 오늘의 만화가 된다.
create table public.daily_picks (
  pick_date  date primary key,
  comic_id   uuid not null references public.comics (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.daily_picks enable row level security;

create policy daily_picks_public_read on public.daily_picks
  for select to anon, authenticated
  using (true);

grant select on public.daily_picks to anon, authenticated;
grant all on public.daily_picks to service_role;

-- ───────────────────────── 좋아요 ─────────────────────────
-- 기기(브라우저)마다 만화 하나에 한 번만. 기록은 서버(service_role)만 읽고 쓴다.
create table public.comic_likes (
  comic_id   uuid not null references public.comics (id) on delete cascade,
  device_id  text not null,
  ip_hash    text not null,
  created_at timestamptz not null default now(),
  primary key (comic_id, device_id)
);

create index comic_likes_device_idx on public.comic_likes (device_id);

-- 좋아요 누르기/취소 요청 기록. 너무 자주 누르는 것을 막는 데만 쓰고 하루 뒤 지운다.
create table public.like_events (
  id         bigint generated always as identity primary key,
  device_id  text not null,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);

create index like_events_device_idx on public.like_events (device_id, created_at);
create index like_events_ip_idx on public.like_events (ip_hash, created_at);

alter table public.comic_likes enable row level security;
alter table public.like_events enable row level security;
-- 정책을 만들지 않는다: anon/authenticated 는 접근 불가, service_role 만 사용.

grant all on public.comic_likes to service_role;
grant all on public.like_events to service_role;

-- 좋아요/취소를 한 번에 처리한다. (중복 방지, 카운트 증감, 요청 횟수 제한)
--   기기당 1시간 30회, IP당 1시간 120회를 넘으면 out_rate_limited = true 로 돌려주고 아무것도 바꾸지 않는다.
create function public.set_comic_like(
  p_comic_id  uuid,
  p_device_id text,
  p_ip_hash   text,
  p_like      boolean
)
returns table (out_liked boolean, out_like_count integer, out_rate_limited boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed integer;
  v_count   integer;
begin
  perform 1 from public.comics c
   where c.id = p_comic_id and c.status = 'approved' and c.published_at <= now();
  if not found then
    raise exception 'comic_not_found' using errcode = 'P0002';
  end if;

  if (select count(*) from public.like_events e
       where e.device_id = p_device_id and e.created_at > now() - interval '1 hour') >= 30
     or (select count(*) from public.like_events e
          where e.ip_hash = p_ip_hash and e.created_at > now() - interval '1 hour') >= 120
  then
    select c.like_count into v_count from public.comics c where c.id = p_comic_id;
    return query
      select exists (select 1 from public.comic_likes l
                      where l.comic_id = p_comic_id and l.device_id = p_device_id),
             coalesce(v_count, 0),
             true;
    return;
  end if;

  insert into public.like_events (device_id, ip_hash) values (p_device_id, p_ip_hash);
  if random() < 0.01 then
    delete from public.like_events where created_at < now() - interval '1 day';
  end if;

  if p_like then
    insert into public.comic_likes (comic_id, device_id, ip_hash)
    values (p_comic_id, p_device_id, p_ip_hash)
    on conflict do nothing;
    get diagnostics v_changed = row_count;
    if v_changed > 0 then
      update public.comics set like_count = like_count + 1 where id = p_comic_id;
    end if;
  else
    delete from public.comic_likes
     where comic_id = p_comic_id and device_id = p_device_id;
    get diagnostics v_changed = row_count;
    if v_changed > 0 then
      update public.comics set like_count = greatest(like_count - 1, 0) where id = p_comic_id;
    end if;
  end if;

  select c.like_count into v_count from public.comics c where c.id = p_comic_id;
  return query select p_like, v_count, false;
end;
$$;

revoke all on function public.set_comic_like(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.set_comic_like(uuid, text, text, boolean) to service_role;
