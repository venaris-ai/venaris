// Pure import orchestration, shared by the UI and regression tests.
export const MANUAL_IMPORT_CHUNK_SIZE = 10;
const RETRY_DELAYS = [1500, 4000, 9000, 15000, 30000, 45000];

export function isTransientUploadError(error: unknown) {
  const e = error as { status?: number | string; statusCode?: number | string } | null;
  const status = Number(e?.statusCode ?? e?.status);
  if ([429, 502, 503, 504].includes(status)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /http (429|502|503|504)|too many connections|max_client_conn|too many requests|connection pool|manual_import_busy|manual_import_object_missing|bad gateway|service unavailable|gateway timeout|failed to fetch|networkerror|network error|timeout|temporarily/i.test(message);
}

export async function withTransientRetry<T>(
  operation: () => Promise<T>,
  onRetry?: () => void,
  wait: (ms: number) => Promise<unknown> = ms => new Promise(resolve => setTimeout(resolve, ms))
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (!isTransientUploadError(error) || attempt >= RETRY_DELAYS.length) throw error;
      onRetry?.();
      await wait(RETRY_DELAYS[attempt] + Math.random() * 500);
    }
  }
}

type Prepared = { clientId: string; uploadId: string; status: "upload_required" | "already_uploaded" };
type Completion = { uploadId: string };

export async function runManualImport<T extends Prepared>(
  count: number,
  operations: {
    prepare: (offset: number) => Promise<{ batchId: string; files: T[] }>;
    upload: (index: number, file: T) => Promise<void>;
    complete: (batchId: string, items: Completion[]) => Promise<void>;
    phase: (phase: "preparing" | "uploading" | "finalizing") => void;
    progress: (uploaded: number) => void;
    retry: <V>(operation: () => Promise<V>) => Promise<V>;
    mappingError: string;
  }
) {
  let batchId: string | null = null;
  const pending: Completion[] = [];
  async function flush() {
    if (!batchId || !pending.length) return;
    const currentBatch = batchId;
    const chunk = [...pending];
    await operations.retry(() => operations.complete(currentBatch, chunk));
    pending.splice(0, chunk.length);
  }
  try {
    for (let offset = 0; offset < count; offset += MANUAL_IMPORT_CHUNK_SIZE) {
      operations.phase("preparing");
      const prepared = await operations.retry(() => operations.prepare(offset));
      if (batchId && batchId !== prepared.batchId) throw new Error(operations.mappingError);
      batchId = prepared.batchId;
      const mapped = new Map(prepared.files.map(file => [file.clientId, file]));
      for (let index = offset; index < Math.min(count, offset + MANUAL_IMPORT_CHUNK_SIZE); index++) {
        const file = mapped.get(String(index));
        if (!file) throw new Error(operations.mappingError);
        operations.phase("uploading");
        if (file.status === "upload_required") {
          await operations.retry(() => operations.upload(index, file));
          pending.push({ uploadId: file.uploadId });
        } else if (file.status !== "already_uploaded") {
          throw new Error(operations.mappingError);
        }
        operations.progress(index + 1);
      }
      operations.phase("finalizing");
      await flush();
    }
  } catch (error) {
    try { await flush(); } catch { /* worker recovers any committed objects */ }
    throw error;
  }
}
