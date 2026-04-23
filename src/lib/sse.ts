// Server-Sent Events helpers.
// 클라이언트 측은 fetch() + reader 방식으로 읽는다(EventSource보다 유연).
//
// 이전 구현엔 client-abort 후에도 `controller.enqueue()` 를 그대로 호출해
// "Cannot enqueue on a closed controller" 가 unhandled rejection 으로 새는
// 경로가 있었다. 이제 (a) `send()` 를 `try/catch` 로 감싸고, (b) cancel 핸들러
// 에서 AbortSignal 을 뒤집어 generator 가 원하면 조기 종료할 수 있게 한다.

export function sseChunk(event: string, data: unknown): string {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  return `event: ${event}\ndata: ${payload}\n\n`;
}

// generator 는 (send, signal) 을 받는다. signal 은 클라이언트가 연결을 끊으면
// aborted 가 된다. 기존 호출자(signal 미사용) 는 그대로 동작한다.
export function sseStream(
  generator: (
    send: (event: string, data: unknown) => void,
    signal: AbortSignal,
  ) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseChunk(event, data)));
        } catch {
          // 스트림이 이미 닫힘(클라 abort 직후의 경합 등). 이 이후의 send 는 무시.
          closed = true;
          abort.abort();
        }
      };
      try {
        await generator(send, abort.signal);
      } catch (err) {
        if (!closed) {
          send("error", {
            message: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
    cancel() {
      // 클라이언트가 fetch 를 abort 하면 여기로 온다. generator 가 signal 을
      // 관찰하고 있으면 외부 API 호출(Gemini 스트리밍 등) 도 조기 중단된다.
      closed = true;
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
