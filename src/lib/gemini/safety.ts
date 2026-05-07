// Gemini 호출의 4개 HARM_CATEGORY 안전 임계값을 모두 BLOCK_NONE 으로 둔
// 단일 상수. 채팅·캐스터·이미지·연구 등 모든 generative 호출이 import.
//
// 왜 한 곳에 모았나:
//   chat.ts / caster/stream.ts 만 BLOCK_NONE 이 적용돼 있고 portraits.ts /
//   portraits-stream.ts / knowledge/research/route.ts 는 누락되어 성인 컨텍스트
//   에서 빈 응답(0-byte) 으로 끝나는 사고가 있었다. 상수가 흩어져 있으면 또
//   누락되니 한 모듈에서만 정의해 import 한다.
//
// 한계 차단(미성년자/실제 인물 공격 등) 은 PERSONA redLines + 시스템 프롬프트
// "[금지]" 블록에서 처리하는 것이 본 프로젝트의 정책이므로 모델 안전 필터는
// 모두 풀어둔다.
import { HarmBlockThreshold, HarmCategory } from "@google/genai";

export const PERMISSIVE_SAFETY = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];
