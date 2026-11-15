import { useState } from 'react'
import { getDeviceId } from '../api'
import { SITE_HOST, SITE_NAME, SUPPORT_EMAIL } from './constants'
import { Card, MailLink, P, PageLink, Section, Ul } from './ui'

// 개인정보 열람·삭제 요청에 쓸 수 있도록, 이 브라우저의 기기 ID를 보여 준다. (버튼을 눌러야 보인다)
function DeviceId() {
  const [id, setId] = useState('')
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
    } catch {
      setCopied(false) // 복사가 막힌 환경에서는 화면에 보이는 값을 직접 복사한다
    }
  }

  if (!id) {
    return (
      <button
        type="button"
        onClick={() => setId(getDeviceId())}
        className="self-start rounded-lg bg-surface-container-highest px-space-md py-2 font-label-lg text-label-lg text-on-surface transition active:scale-95 hover:bg-surface-bright"
      >
        내 기기 ID 보기
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-container-low p-space-md">
      <code className="font-mono text-body-sm break-all text-on-surface">{id}</code>
      <button
        type="button"
        onClick={() => void copy()}
        className="self-start rounded bg-surface-container-highest px-3 py-1.5 font-label-md text-label-md text-on-surface"
      >
        {copied ? '복사했어요' : '복사하기'}
      </button>
    </div>
  )
}

export default function Contact() {
  return (
    <>
      <P>
        서비스에 대한 문의, 오류 제보, 저작권 침해 신고, 만화 삭제 요청, 개인정보 요청은 모두 이메일로 받습니다. 순서대로 확인해서 답변드립니다.
      </P>

      <div className="mt-space-md rounded-xl bg-surface-container p-space-md">
        <p className="font-label-md text-label-md text-on-surface-variant">문의 이메일</p>
        <p className="mt-1 font-headline text-headline-sm">
          <MailLink />
        </p>
      </div>

      <Section title="일반 문의 · 오류 제보">
        <P>
          <MailLink subject="[오늘의 4컷] 문의" body={`사이트: ${SITE_HOST}\n\n문의 내용:\n`} />
          으로 보내 주세요. 오류라면 어떤 기기와 브라우저에서 무엇을 하다가 생겼는지 알려 주시면 도움이 됩니다.
        </P>
      </Section>

      <Section title="저작권 침해 신고 · 만화 삭제 요청">
        <P>
          권리를 침해당한 권리자, 또는 자신이 올린 만화를 지우고 싶은 작가가 보내 주세요. 어떤 만화인지 알 수 있는 자료가 필요합니다. 만화 아래의 공유 버튼을 누르면 그 만화의
          링크를 복사할 수 있어요.
        </P>
        <Card
          title="메일에 적어 주세요"
          rows={[
            ['누가', '신고하는 분의 이름(또는 단체명)과 연락처'],
            ['어떤 만화', '만화 링크(만화 아래 공유 버튼으로 복사). 링크를 알 수 없다면 화면 캡처와 올라온 시기'],
            ['이유', '어떤 권리가 어떻게 침해되었는지, 권리를 가진 것을 보여 주는 자료. 삭제 요청이라면 본인이 올린 작가라는 설명'],
          ]}
        />
        <P>
          <MailLink
            subject="[오늘의 4컷] 저작권 침해 신고 / 삭제 요청"
            body={`1. 신고(요청)하는 분 이름·연락처:\n\n2. 대상 만화 (만화 링크, 또는 화면 캡처 첨부 / 올라온 시기):\n\n3. 이유와 권리를 보여 주는 자료:\n`}
          />
          으로 보내 주세요. 만화를 올릴 때 남긴 이메일에서 보내시면 작가 본인 확인이 빠릅니다. 처리 방법은{' '}
          <PageLink href="/terms">이용약관</PageLink> 제7조에 있습니다.
        </P>
      </Section>

      <Section title="개인정보 열람 · 삭제 요청">
        <P>
          올릴 때 쓴 이름, 이메일, 만화 이미지나 좋아요·신고 기록 등에 대한 열람·정정·삭제 요청입니다. 이메일 없이 올렸거나 좋아요 기록을 확인하고 싶다면, 아래에서
          이 브라우저의 기기 ID를 확인해 메일에 함께 적어 주세요. 기기 ID로 해당 기록을 찾을 수 있습니다.
        </P>
        <DeviceId />
        <Ul
          items={[
            '기기 ID는 이 브라우저에 저장된 값입니다. 브라우저 데이터를 지운 뒤에는 이전 기록과 연결되지 않습니다.',
            '기기 ID는 이름이나 연락처가 아니며, 다른 사람에게 보여 줄 필요가 없습니다. 요청 메일에만 적어 주세요.',
          ]}
        />
        <P>
          <MailLink
            subject="[오늘의 4컷] 개인정보 열람·삭제 요청"
            body={`요청 종류 (열람 / 정정 / 삭제):\n\n올릴 때 쓴 이름:\n올린 시기:\n기기 ID (선택):\n`}
          />
          으로 보내 주세요. 자세한 내용은 <PageLink href="/privacy">개인정보처리방침</PageLink>에 있습니다.
        </P>
      </Section>

      <Section title="알아 두세요">
        <Ul
          items={[
            `${SITE_NAME}의 문의 메일(${SUPPORT_EMAIL})은 운영자의 메일함으로 전달됩니다.`,
            '메일로 받은 정보는 문의를 처리하는 데에만 씁니다.',
          ]}
        />
      </Section>
    </>
  )
}
