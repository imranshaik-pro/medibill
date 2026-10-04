export class VisionRequestError extends Error {
  code: string;
  status: number;
  upstreamStatus?: number;
  providerStatus?: string;
  constructor(code: string, message: string, status: number, upstreamStatus?: number, providerStatus?: string) { super(message); this.code=code; this.status=status; this.upstreamStatus=upstreamStatus; this.providerStatus=providerStatus; }
}

// One shared deadline covers retries, backoff, and response decoding.
export async function requestVision(
  run: (signal: AbortSignal) => Promise<Response>,
  options: { timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {},
) {
  const timeoutMs = options.timeoutMs ?? 55000;
  const deadline = Date.now() + timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if(controller.signal.aborted) throw new VisionRequestError("VISION_TIMEOUT", "The vision service timed out. Please upload the photos again and retry.", 504);
      let response: Response;
      try { response = await run(controller.signal); }
      catch {
        if (controller.signal.aborted) throw new VisionRequestError("VISION_TIMEOUT", "The vision service timed out. Please upload the photos again and retry.", 504);
        if (attempt === 2) throw new VisionRequestError("VISION_NETWORK", "Could not reach the vision service. Please retry when your connection is stable.", 502);
        await sleep(attempt ? 2200 : 900);
        continue;
      }
      if (response.ok) {
        try { return await response.json(); }
        catch { throw new VisionRequestError("VISION_INVALID_RESPONSE", "The vision service returned an incomplete response. Please retry.", 502); }
      }
      const status = response.status;
      const retryable = [429, 500, 502, 503, 504].includes(status);
      const retryHeader = response.headers.get("retry-after");
      const seconds = retryHeader === null ? NaN : Number(retryHeader);
      const delay = retryHeader === null ? (attempt ? 2200 : 900)
        : Number.isFinite(seconds) ? Math.max(0, seconds * 1000)
        : Math.max(0, Date.parse(retryHeader) - Date.now());
      if (retryable && attempt < 2 && Number.isFinite(delay) && Date.now() + delay + 1000 < deadline) {
        await response.body?.cancel();
        await sleep(delay);
        continue;
      }
      // Retain only allowlisted machine codes. Never expose provider messages or request bodies.
      let providerStatus: string | undefined;
      try {
        const body = await response.json() as {error?:{status?:unknown;type?:unknown}};
        const token = body?.error?.status ?? body?.error?.type;
        if(typeof token==="string" && ["INTERNAL","UNAVAILABLE","DEADLINE_EXCEEDED","RESOURCE_EXHAUSTED","INVALID_ARGUMENT","NOT_FOUND","PERMISSION_DENIED","UNAUTHENTICATED","FAILED_PRECONDITION","api_error","service_unavailable","deadline_exceeded","rate_limit_exceeded","insufficient_quota"].includes(token))providerStatus=token;
      } catch { /* A gateway may return HTML instead of JSON. */ }
      const detail = ` Provider HTTP ${status}${providerStatus?" ("+providerStatus+")":""}.`;
      if (status === 429) throw new VisionRequestError("VISION_RATE_LIMITED", "The vision API quota or request limit was reached. Please wait before retrying; the administrator may need to check API quota."+detail, 429,status,providerStatus);
      if (status === 504) throw new VisionRequestError("VISION_PROVIDER_TIMEOUT", "The vision provider could not process these images within its deadline."+detail,504,status,providerStatus);
      if (status === 500) throw new VisionRequestError("VISION_PROVIDER_ERROR", "The vision provider encountered an internal error."+detail,502,status,providerStatus);
      if (retryable) throw new VisionRequestError("VISION_BUSY", "The vision service is temporarily unavailable. Retries were attempted where possible. Please try again shortly."+detail,503,status,providerStatus);
      throw new VisionRequestError("VISION_CONFIG_ERROR", "The vision provider rejected the request. Ask the administrator to check the API key, model, and image request configuration."+detail,503,status,providerStatus);
    }
    throw new VisionRequestError("VISION_NETWORK", "Could not reach the vision service. Please retry.", 502);
  } catch (error) {
    if (controller.signal.aborted) throw new VisionRequestError("VISION_TIMEOUT", "The vision service timed out. Please upload the photos again and retry.", 504);
    throw error;
  } finally { clearTimeout(timer); }
}
