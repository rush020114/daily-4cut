import type { ReactNode } from 'react'
import { SUPPORT_EMAIL } from './constants'

// 약관·방침 페이지용 작은 부품들

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-space-lg">
      <h2 className="font-headline text-headline-sm text-on-surface">{title}</h2>
      <div className="mt-2 flex flex-col gap-space-sm">{children}</div>
    </section>
  )
}

export function P({ children }: { children: ReactNode }) {
  return <p className="font-body text-body-md leading-relaxed text-on-surface-variant">{children}</p>
}

export function Ul({ items, ordered = false }: { items: ReactNode[]; ordered?: boolean }) {
  const Tag = ordered ? 'ol' : 'ul'
  return (
    <Tag
      className={`flex flex-col gap-1.5 pl-5 font-body text-body-md leading-relaxed text-on-surface-variant ${
        ordered ? 'list-decimal' : 'list-disc'
      }`}
    >
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </Tag>
  )
}

// 눈에 띄게 알려야 하는 내용(예: AI 검수의 한계)
export function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-container-high p-space-md ring-1 ring-secondary/40">
      <p className="font-headline text-headline-sm text-secondary-fixed">{title}</p>
      <div className="mt-1 flex flex-col gap-space-sm font-body text-body-md leading-relaxed text-on-surface-variant">
        {children}
      </div>
    </div>
  )
}

// 항목 하나를 "이름 / 설명" 줄들로 보여 주는 카드. 휴대폰 폭에서도 읽히도록 표 대신 쓴다.
export function Card({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return (
    <div className="rounded-xl bg-surface-container p-space-md">
      <p className="font-headline text-headline-sm text-on-surface">{title}</p>
      <dl className="mt-2 flex flex-col gap-1.5 font-body text-body-sm leading-relaxed text-on-surface-variant">
        {rows.map(([label, text]) => (
          <div key={label} className="flex gap-2">
            <dt className="w-16 shrink-0 text-on-surface">{label}</dt>
            <dd className="min-w-0 flex-1">{text}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function MailLink({ subject, body }: { subject?: string; body?: string }) {
  const query = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`]
    .filter(Boolean)
    .join('&')
  return (
    <a href={`mailto:${SUPPORT_EMAIL}${query ? `?${query}` : ''}`} className="text-primary underline underline-offset-2">
      {SUPPORT_EMAIL}
    </a>
  )
}

export function PageLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-primary underline underline-offset-2">
      {children}
    </a>
  )
}
