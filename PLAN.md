# PLAN.md: 4컷 만화 웹 프로젝트 작업지시서

> **Claude Code에게: 진행 방식**
>
> 1. **한 번에 한 단계만** 진행한다.
> 2. 단계를 시작할 때 그 단계의 **"사람이 할 일"** 이 끝났는지 묻는다. 안 끝났으면 무엇을 해야 하는지 알려주고 기다린다.
> 3. 사람이 할 일이 끝났으면 **"N단계 프롬프트를 PROMPTS.md에서 복사해 붙여 주세요"** 라고 요청하고 기다린다. **프롬프트를 받기 전에는 구현을 시작하지 않는다.**
> 4. 받은 프롬프트대로 구현하되, 이 문서의 **작업 규칙과 그 단계의 "지킬 것"** 을 함께 지킨다. 프롬프트와 이 문서가 부딪히면 구현 전에 사람에게 묻는다.
> 5. 단계가 끝나면 **완료 기준**을 직접 확인하고 결과를 보고한 뒤 멈춘다. 다음 단계로 넘어갈지는 사람이 정한다.
>

---

## 프로젝트 개요

- **서비스**: 누구나 4컷 만화를 올리고, 사람들은 오늘의 4컷을 본다. 나중에 휴대폰을 켜면 4컷이 보이는 안드로이드 잠금화면 앱으로 확장
- **핵심 원칙**: 화면에는 **4컷 한 장만** 보여준다. 만화 아래 설명 글을 넣지 않는다
- **주소**: `comic.seunglabs.com`
- **시작 조건**: 로그인 없이 보기·좋아요·업로드 가능
- **화면 기준**: 모바일 퍼스트(휴대폰 세로). 컴퓨터에서는 가운데 휴대폰 폭으로 보여도 된다

## 작업 규칙

- 스택: Vite + React + TypeScript, Cloudflare Pages Functions, Cloudflare R2(이미지), Supabase(DB, 나중에 Auth)
- git push하면 Cloudflare Pages가 자동 배포. 커밋 메시지는 영어, 푸시는 묻지 말고 바로
- **키·토큰은 코드에 쓰지 않는다.** 사람이 Cloudflare Variables and Secrets에 넣고, 코드는 아래 이름으로 읽는다
- 실제 동작과 약관·안내 문구가 다르면 안 된다
- 실패를 조용히 숨기지 않는다. 오류 메시지와 다시 시도 방법을 보여준다
- 최신 공식 문서 기준으로 구현한다 (Cloudflare, Supabase, OpenAI, Polar, 안드로이드)
- DB 테이블·RLS SQL은 사람에게 주고 Supabase SQL Editor에서 직접 실행하게 한다

## 환경 변수와 바인딩 이름

| 이름 | 종류 | 용도 |
|---|---|---|
| `COMIC_BUCKET` | R2 바인딩 | 만화 이미지 |
| `SUPABASE_URL` | Plaintext | Supabase |
| `SUPABASE_ANON_KEY` | Plaintext | Supabase 공개 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | 서버 전용 |
| `TURNSTILE_SITE_KEY` | Plaintext | 봇 확인(화면) |
| `TURNSTILE_SECRET_KEY` | Secret | 봇 확인(서버) |
| `OPENAI_API_KEY` | Secret | 업로드 이미지 AI 검수 |
| `RESEND_API_KEY` | Secret | 알림 메일 |
| `POLAR_ACCESS_TOKEN` | Secret | 결제(9단계) |

## 이미 있는 인프라

| 서비스 | 상태 |
|---|---|
| 도메인 `seunglabs.com` | Cloudflare에서 관리. 서브 도메인으로 서비스 분리 |
| Google Search Console | `seunglabs.com` 도메인 속성 → 서브 도메인 자동 포함 |
| GA / Clarity | 계정 있음 |
| AdSense | `seunglabs.com` 등록 |
| Resend | `seunglabs.com` 인증 완료. 보내는 주소 `noreply@seunglabs.com` |
| 문의 메일 | `support@seunglabs.com` (Cloudflare Email Routing → 운영자 Gmail) |
| Polar | 조직 `seunglabs` 승인 완료 |
| Supabase | 조직 `seunglabs` |

---

## 1단계. 화면 구현

**사람이 할 일**

- [ ]  새 GitHub 레포 생성, `PLAN.md` 넣기
- [ ]  Stitch에서 [앱] 플랫폼으로 시안 만들기 → 더보기(⋮) → 코드 보기로 코드 준비

**범위**: 프로젝트 초기화, GitHub push, Stitch 시안대로 화면 구현(샘플 이미지, 데이터 연결 없음)

**지킬 것**: 시안에 있지만 이 계획에 없는 기능은 뺀다. 만화 아래 설명 글 금지

**완료 기준**: 휴대폰 화면에서 4컷이 꽉 차게 보이고, 넘기기와 업로드 화면이 열린다

---

## 2단계. 배포

**사람이 할 일**

- [ ]  Cloudflare Pages 새 프로젝트 → Git 연결 (preset React (Vite), build `npm run build`, output `dist`)
- [ ]  Custom domains에 `comic.seunglabs.com`
- [ ]  R2 버킷 `comic-images` 생성 → Pages Bindings에 `COMIC_BUCKET`으로 연결
- [ ]  Supabase 프로젝트(서울 리전) 생성 또는 기존 프로젝트 사용 → URL·키를 위 이름으로 등록

**범위**: 배포 설정 확인, 환경 변수를 읽는 코드 구조 준비

**완료 기준**: `https://comic.seunglabs.com`에서 1단계 화면이 열린다

---

## 3단계. 보기 · 좋아요 · 누구나 올리기 · 검수

**사람이 할 일**

- [ ]  Cloudflare Turnstile 사이트 생성 → 키 등록
- [ ]  OpenAI 새 키(이 프로젝트용), Resend 새 키(Sending access) 등록

**범위**: 승인된 만화 보기, 로그인 없는 좋아요, 로그인 없는 업로드, AI 검수 + 관리자 승인, 신고, 알림 메일

**지킬 것**

- **올리자마자 공개하지 않는다.** 검수 대기 → 승인된 것만 공개
- 업로드: Turnstile, IP·기기별 하루 개수 제한, 약관 동의, 크기·형식 제한
- 좋아요: 같은 기기 중복 방지 + 서버에서 과도한 요청 차단
- 관리자 페이지는 운영자만 접근

**완료 기준**: 다른 기기에서 올린 만화가 검수 대기 → 관리자 승인 → 공개되는 전 과정이 실제로 동작한다. 같은 기기에서 좋아요 중복이 안 된다

---

## 4단계. 분석 · 성능

**사람이 할 일**

- [ ]  GA 새 데이터 스트림, Clarity 새 프로젝트 → 코드 준비
- [ ]  배포 후 PageSpeed Insights 모바일 결과 준비

**범위**: GA·Clarity 삽입, 이벤트 기록, PageSpeed 개선

**지킬 것**: `<meta charset="utf-8">`은 `<head>` 맨 위

**완료 기준**: GA 실시간에 방문이 잡히고, PageSpeed 모바일 90점 이상

---

## 5단계. 약관 · 개인정보처리방침 · 저작권 신고

**범위**: 이용약관, 개인정보처리방침, 문의 페이지, 푸터 링크

**지킬 것**: 문구가 실제 동작과 일치. 문의처는 `support@seunglabs.com`

**완료 기준**: 수집 정보·검수·저작권 신고 방법이 실제 동작대로 적혀 있다

---

## 6단계. 검색 · 공유

**사람이 할 일**

- [ ]  Search Console에 `https://comic.seunglabs.com/sitemap.xml` 제출
- [ ]  네이버 서치어드바이저에 사이트 등록·소유 확인·사이트맵 제출

**범위**: SEO 태그, 만화별 OG 이미지, sitemap·robots, 공유 버튼, 홈 화면에 추가

**지킬 것**: 관리자 페이지는 robots.txt에서 막고 noindex

**완료 기준**: 카톡으로 링크를 보내면 만화 미리보기가 뜬다

---

## 7단계. 앱 사전 신청 배너

**범위**: 기기별 배너(안드로이드 사전 신청 / 아이폰 홈 화면 추가 안내 / 컴퓨터 없음), 오늘 하루 보지 않기, GA 이벤트

**지킬 것**: 첫 화면에 바로 띄우지 않는다. 만화를 가리지 않는다

**완료 기준**: 기기별로 다른 안내가 뜨고, 하루 보지 않기가 동작한다

---

## 8단계. 로그인 (필요해질 때)

> 진행 시점: 업로드가 많아져 검수가 감당 안 되거나, 좋아요 조작이 보이거나, 작가 수익 배분(9단계)을 시작할 때

**기준**

| 기능 | 지금 | 로그인으로 넘길 때 |
|---|---|---|
| 보기 | 로그인 없음 | **계속 없음** |
| 좋아요 | 로그인 없음 + 기기·IP 제한 | 순위 조작이 보이거나 수익 배분을 시작할 때 |
| 신고 | 로그인 없음 | 장난 신고가 많아질 때 |
| 업로드 | 로그인 없음 + Turnstile + 하루 제한 + 검수 | **가장 먼저** 넘긴다 |
| 댓글 | 만들지 않음 | 만든다면 처음부터 로그인 필수 |

**사람이 할 일**

- [ ]  Google Cloud Console OAuth 클라이언트 (승인된 JavaScript 원본 `https://comic.seunglabs.com`, 리디렉션 URI는 Supabase callback URL), Supabase Google Provider 등록, Supabase Redirect URLs에 `https://comic.seunglabs.com`
- [ ]  Supabase 인증 메일 SMTP를 Resend로 (host `smtp.resend.com`, port 465, username `resend`, 전용 키, 보내는 주소 `noreply@seunglabs.com`)

**범위**: Supabase Auth(이메일 + 구글), 업로드는 로그인한 사람만, 작가 페이지, 탈퇴

**지킬 것**: **보기는 막지 않는다.** 탈퇴 시 계정·만화·R2 이미지까지 삭제

---

## 9단계. 수익: 광고 · 광고 없애기 · 작가 수익 배분

> 진행 시점: 매일 보러 오는 사람이 확인된 뒤

**사람이 할 일 (배분 전에 반드시)**

- [ ]  **세무사 상담**: 개인 작가에게 수익을 지급할 때의 세금 처리, 지급 방식
- [ ]  작가 파트너 약관 (배분 비율, 지급 주기, 해지 조건)
- [ ]  작가 지급은 처음엔 월 1회 직접 계좌 이체 (Polar는 운영자에게만 정산)
- [ ]  Polar에 광고 없애기 상품 추가, Settings → Embedding에 `comic.seunglabs.com` 등록

**범위**: 광고, 광고 없애기 결제(Polar), 작가 파트너 신청·승인, 월별 배분 계산표, 작가 통계

**지킬 것**

- 만화 자체를 가리는 광고 금지
- 배분을 시작하면 좋아요를 로그인으로 넘긴다
- 지급은 사람이 한다. 코드는 계산표까지만
- 돈 내면 노출을 올려주는 방식, 보는 것 자체를 유료로 막는 방식 금지

---

## 10단계. 안드로이드 잠금화면 앱

> 진행 시점: 웹 재방문과 사전 신청 수로 수요가 확인된 뒤

**사람이 할 일**

- [ ]  Google Play 개발자 계정(등록비 1회), 본인 인증
- [ ]  새 개인 계정의 **비공개 테스트 요건** 확인, 테스터 모집
- [ ]  잠금화면·사용자 콘텐츠·광고 정책, 데이터 보안 섹션 확인

**범위**: 먼저 설계만 → 사람이 승인하면 개발 빌드부터 구현

**지킬 것**

- **기기 보안 잠금은 절대 우회하지 않는다.** 만화를 보여주고 넘기면 원래 잠금 해제 화면으로
- 데이터는 `comic.seunglabs.com` API를 그대로 사용
- 최신 안드로이드 공식 문서 기준

**완료 기준**: 내 폰에서 화면을 켜면 오늘의 4컷이 보이고, 설정(하루 한 번 / 켤 때마다 / 끄기)이 동작한다
