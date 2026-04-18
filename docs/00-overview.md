# 00 · Overview

CharacterChat는 1:1 AI 캐릭터 채팅 웹앱이다. Crack(crack.wrtn.ai), Character.ai, KakaoTalk을 참고해 설계하되, 운영 주체가 1명이고 캐릭터는 큐레이션되는 모델을 택한다.

## 핵심 가치
- **몰입형 1:1 대화**: 하나의 캐릭터와 하나의 연속적인 대화. "여러 방"이 아니라 "하나의 관계".
- **LLM 네이티브 제작**: 관리자는 직접 시스템 프롬프트를 쓰거나, **Caster** 에이전트에게 위임해 웹검색·디자인·RAG 지식 주입까지 자동화할 수 있다.
- **확장 가능한 MVP**: 스택은 사용자의 기존 프로젝트(StoryGatcha, autocartoon, wony)와 동일해 장기 유지보수가 쉽다.

## 범위 (In-scope)
- 하단 5탭 모바일 퍼스트 UI: `feed | find | create | history | me`.
- 세로 캐러셀로 캐릭터 탐색(/find).
- 카카오톡 스타일 대화목록(/history) — 캐릭터당 최대 1세션.
- Google 로그인(NextAuth v5) + DEV 로그인(개발 환경 한정).
- 관리자 페이지(/admin): 캐릭터 CRUD, Asset, 시스템 프롬프트, LLM Config, RAG 지식.
- Gemini 기반 채팅 스트리밍(SSE).
- Caster 에이전트 스켈레톤(M1 시점은 대화만, 툴 세부는 M4에서 확정).
- LLM 웹검색 기반 RAG (파일 업로드 파서 없음).

## Non-goals (현 단계)
- 유저가 캐릭터를 직접 만드는 공개 크리에이터 기능.
- 다중 세션 / 여러 스레드.
- PDF/DOCX 등 문서 파일 업로드.
- 커뮤니티·피드·별점·댓글.
- 음성 통화, 실시간 음성 입력.
- 모바일 네이티브 앱.

## Crack / Character.ai / KakaoTalk 와의 차이
| 측면 | Crack | Character.ai | KakaoTalk | **CharacterChat** |
|---|---|---|---|---|
| 캐릭터 생성 | 사용자 누구나 | 사용자 누구나 | N/A | 관리자만(운영자 큐레이션) |
| 세션 수 | 다중 | 다중(메모리 분리) | 1:1 | **1 캐릭터 = 1 세션** |
| 탐색 UI | 그리드/피드 | 카루셀+그리드 | 대화 리스트 | **세로 캐러셀 + 대화 리스트** |
| RAG | 관리자가 수동 입력 | 정의(Definition) 필드 | N/A | **LLM이 웹검색해 자동 생성** |
| 자동 생성 | 간단한 프롬프트 도움 | 예시 대화·TTS·이미지 | N/A | **Caster 에이전트가 캐릭터 설계 전체 자동화** |

## 1-세션 규칙의 의도
"1 캐릭터 = 1 관계"라는 은유를 제품 컨셉으로 삼는다. 여러 대화방을 만들 수 없으므로, 대화 내용을 리셋하려면 **삭제**라는 명시적 행위가 필요하다. 이는 복잡한 스레드 관리 UI를 없애고, /history를 단순한 목록으로 유지하게 해준다. 트레이드오프는 "실험용 평행 대화"가 불가능하다는 점인데, 관리자 프리뷰 용도로는 `/admin/characters/[id]/preview` 를 별도로 제공한다(M2+).

## 관련 문서
- [01-tech-stack.md](01-tech-stack.md)
- [02-architecture.md](02-architecture.md)
- [05-ui-user.md](05-ui-user.md)
- [17-nav-and-tabs.md](17-nav-and-tabs.md)
