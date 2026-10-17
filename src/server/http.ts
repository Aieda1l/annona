import { HTTP_STATUS_BY_ERROR_CODE, type Result } from "@/contracts";

/** Maps a Result to an HTTP response (CONTRACTS §3.15). Success is 200 with `{ ok: true, data }`. */
export function toResponse<T>(result: Result<T>, init: { headers?: HeadersInit } = {}): Response {
  const status = result.ok ? 200 : HTTP_STATUS_BY_ERROR_CODE[result.error.code];
  return Response.json(result, { status, headers: init.headers });
}

/** 501 `{ ok:false, error:{ code:"NOT_IMPLEMENTED", ... } }` for lane handlers that are still stubs. */
export function notImplemented(route: string, owner: string): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code: "NOT_IMPLEMENTED",
        message: `${route} is not implemented yet (owner ${owner})`,
        retryable: false,
      },
    },
    { status: HTTP_STATUS_BY_ERROR_CODE.NOT_IMPLEMENTED },
  );
}
