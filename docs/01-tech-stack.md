# 01 · Tech Stack

기존 사내 프로젝트(StoryGatcha, autocartoon, wony)와 동일 축. 학습비용 최소화.

## 런타임 / 언어
| 항목 | 선택 | 버전 | 이유 |
|---|---|---|---|
| Node.js | LTS | 20.x | Vercel 기본 |
| Framework | Next.js App Router | ^16.2 | 최신 RSC/Route Handlers |
| Language | TypeScript | ^5.7 strict | 전 프로젝트 공통 |
| Package manager | npm | — | wony/autocartoon과 일치 |

## DB / 데이터
| 항목 | 선택 | 이유 |
|---|---|---|
| DB | PostgreSQL (Neon 권장) | pgvector 확장 지원 |
| ORM | Prisma ^6.4 | 타입 안전, migrate 파이프 |
| Vector | pgvector(768) + HNSW | 단일 DB 일관성 |
| 일부 쿼리 | `$queryRaw` | `vector` 타입 미지원 필드 검색용 |

## LLM / AI
| 용도 | 모델 | SDK |
|---|---|---|
| Chat (기본) | `gemini-2.5-flash-lite` 또는 `gemini-3.1-flash-lite-preview` | `@google/genai` ^1.50 |
| Image (Caster 포트레이트) | `gemini-3.1-flash-image-preview` | 동일 |
| Embedding | `text-embedding-004` (768d) | 동일 |

`next.config.ts` 의 `serverExternalPackages: ['@google/genai','sharp']` 필수.

## 인증
| 항목 | 선택 |
|---|---|
| NextAuth | v5 beta (`5.0.0-beta.30`) |
| Providers | Google + Credentials(dev-only) |
| Session strategy | JWT |
| User 저장 | Prisma.User |
| Admin 식별 | `AdminConfig.adminEmails` 배열 |

StoryGatcha 패턴을 1:1 포팅한다. Firestore만 Prisma로 교체. 상세는 [12-auth-and-access.md](12-auth-and-access.md).

## UI
| 항목 | 선택 | 비고 |
|---|---|---|
| CSS | Tailwind v4 | PostCSS `@tailwindcss/postcss` |
| Components | shadcn/ui (new-york) | 필요한 컴포넌트만 생성 |
| Icons | lucide-react | **이모지 금지** |
| Animation | framer-motion ^12 | 캐러셀 snap 부드럽게, 타이핑 |
| 색상 토큰 | `tailwind.config.ts` 중앙 | 교체는 여기 한 곳만 |

**디자인 원칙**: 임시 중립 팔레트(off-white/warm-gray/slate) — 사용자 CSS 교체를 전제로 한 보수적 스타일. 네온·다크 네이비 금지. 상세 [16-ui-style-placeholder.md](16-ui-style-placeholder.md).

## State
| 레이어 | 선택 |
|---|---|
| Client global | Zustand ^5 |
| Server cache | TanStack Query ^5 |
| Form | React Hook Form (필요 시) + Zod |

## Infra / Utility
| 용도 | 선택 |
|---|---|
| Asset storage | Vercel Blob |
| Image pipeline | sharp |
| Schema validation | Zod |
| ID generation | ulid |
| Email (향후) | Resend |

## Deploy
- Vercel 배포 기본.
- DB는 Neon 권장(pgvector 지원 + free tier).
- 환경변수 카탈로그는 [13-deployment.md](13-deployment.md) 참조.

## 버전 Pin 규칙
- Major: caret(`^`) 유지 (예: `^19.2.0`).
- Next.js / React 는 LTS-adjacent, 15 이상만.
- Beta/RC는 **NextAuth v5 beta만 허용**(StoryGatcha 정합성).
- 의존성 추가 시 PR에 근거 메모를 docstring/코멘트로 남긴다.
