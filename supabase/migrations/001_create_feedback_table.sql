-- ==============================================================================
-- 규픽(GyuPick) 피드백 테이블 생성 및 보안(RLS) 설정 마이그레이션
-- 파일명: supabase/migrations/001_create_feedback_table.sql
-- 목적: 사용자의 피드백(1~500자)과 등록 시각을 안전하게 저장하고 최신순으로 조회
-- ==============================================================================

begin;

-- 1. 피드백 테이블 생성
-- id: 클라이언트가 생성한 중복 방지용 고유 식별자(UUID v4)
-- body: 피드백 내용 (1자 이상 500자 이하의 텍스트만 허용)
-- created_at: 데이터베이스 등록 시각 (기본값: 현재 시각 now())
create table if not exists public.feedback (
  id uuid primary key,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

-- 2. 최신순 조회 성능 향상을 위한 복합 인덱스 생성
-- 등록 시각 내림차순(최신순), 시각이 같을 경우 고유 ID 내림차순으로 정렬
create index if not exists feedback_newest_idx
  on public.feedback (created_at desc, id desc);

-- 3. 강력한 데이터 보안을 위한 행 수준 보안(Row Level Security, RLS) 활성화
-- 외부 사용자가 Supabase API로 직접 테이블을 조작하거나 무단 열람하지 못하도록 잠급니다.
alter table public.feedback enable row level security;

-- 모든 기본 권한 회수 (익명 사용자 anon, 로그인 사용자 authenticated 모두 직접 접근 불가)
revoke all on table public.feedback from public, anon, authenticated, service_role;

-- 오직 서버 전용 비밀 키(service_role)를 통해서만 읽기(SELECT)와 쓰기(INSERT)가 가능하도록 권한 부여
grant select, insert on table public.feedback to service_role;

commit;

