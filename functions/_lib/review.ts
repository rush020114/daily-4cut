import type { Env } from './env'
import { notifyAdminUpload, notifyAuthor, type UploadStatus } from './email'
import { moderateImage, shouldAutoReject } from './moderation'
import { rest } from './supabase'

// superseded: AI 결과가 나오기 전에 관리자가 이미 처리해서 저장하지 않았다
export type AiOutcome = { status: UploadStatus; error?: string; superseded?: boolean }

// AI 검수를 돌리고 결과를 DB에 저장한다. 검수가 실패해도 업로드는 그대로 두고(검수 대기), 실패 사유를 남긴다.
export async function runAiCheck(env: Env, id: string, webp: Uint8Array): Promise<AiOutcome> {
  try {
    const ai = await moderateImage(env, webp)
    const next = shouldAutoReject(ai) ? 'rejected' : 'review'
    const saved = await rest<string | null>(env, 'service', 'rpc/set_comic_ai_result', {
      method: 'POST',
      body: JSON.stringify({ p_id: id, p_status: next, p_result: ai }),
    })
    if (!saved) return { status: next, superseded: true }
    return { status: saved === 'rejected' ? 'rejected' : 'review' }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('AI moderation failed:', id, error)
    await rest(env, 'service', `comics?id=eq.${id}&status=eq.pending`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ ai_result: { error: error.slice(0, 300) }, ai_checked_at: new Date().toISOString() }),
    }).catch((e2) => console.error('Failed to store AI error:', id, e2))
    return { status: 'pending', error }
  }
}

// 업로드 직후 뒤에서 처리한다: AI 검수 → 운영자 알림 → (거절이면) 작가 안내
export async function afterUpload(env: Env, p: { id: string; webp: Uint8Array; nickname: string; email: string }) {
  const ai = await runAiCheck(env, p.id, p.webp)
  if (ai.superseded) return
  await notifyAdminUpload(env, { nickname: p.nickname, status: ai.status, aiError: ai.error }).catch((e) =>
    console.error('Admin upload mail failed:', p.id, e),
  )
  if (ai.status === 'rejected' && p.email) {
    await notifyAuthor(env, p.email, { nickname: p.nickname, result: 'rejected' }).catch((e) =>
      console.error('Author mail failed:', p.id, e),
    )
  }
}
