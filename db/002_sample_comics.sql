-- 002_sample_comics.sql : 화면 확인용 샘플 만화 (is_sample = true 로 표시됨)
-- 이미지는 사이트에 들어 있는 /samples/*.svg 를 쓰므로 R2에 올릴 것이 없다.
-- 001_comics.sql 을 먼저 실행한 뒤 실행한다.

insert into public.comics
  (image_key, image_width, image_height, status, like_count, author_nickname, published_at, is_sample)
values
  ('/samples/sample-1.svg',  900, 1600, 'approved', 1284, '샘플 작가 A', now() - interval '3 hours',  true),
  ('/samples/sample-2.svg', 1200, 1200, 'approved',  892, '샘플 작가 B', now() - interval '30 hours', true),
  ('/samples/sample-3.svg',  900, 1600, 'approved',   37, '샘플 작가 C', now() - interval '1 hour',   true);

-- ───── 샘플 지우기 (실제 만화를 올리기 시작하면 실행) ─────
-- 샘플의 좋아요 기록과 오늘의 만화 지정도 함께 지워진다.
--
--   delete from public.comics where is_sample;
