import test from "node:test";
import assert from "node:assert/strict";
import { MANUAL_IMPORT_MAX_BYTES, MANUAL_IMPORT_MAX_FILES, manualImportLimitState } from "../src/lib/manualImportLimits.ts";
import { MANUAL_IMPORT_CHUNK_SIZE, runManualImport, withTransientRetry, isTransientUploadError } from "../src/lib/manualImportFlow.ts";

const retry = fn => withTransientRetry(fn, undefined, async () => {});

test("both import limits are enforced independently, inclusive at the boundaries", () => {
  assert.equal(manualImportLimitState(500, 50_000_000).withinLimits, true);
  assert.equal(manualImportLimitState(501, 1_000_000).tooManyFiles, true);
  assert.equal(manualImportLimitState(1, 50_000_001).importTooLarge, true);
  assert.equal(manualImportLimitState(501, 50_000_001).withinLimits, false);
  assert.equal(manualImportLimitState(499, 49_999_999).withinLimits, true);
});

test("500 files / exactly 50 MB, retry 429 during preparation, upload and completion", async () => {
  const files = Array.from({length: MANUAL_IMPORT_MAX_FILES}, () => new Uint8Array(100_000));
  assert.equal(files.reduce((sum, file) => sum + file.byteLength, 0), MANUAL_IMPORT_MAX_BYTES);
  const stored = new Set(), queued = new Set(), prepAttempts = new Set();
  const uploadAttempts = new Set(), completeAttempts = new Set();
  let maxChunk = 0, progress = 0;
  const transient = () => new Error("HTTP 429: Too many connections issued to the database");
  await runManualImport(files.length, {
    prepare: async offset => {
      if (!prepAttempts.has(offset)) { prepAttempts.add(offset); throw transient(); }
      const list = files.slice(offset, offset + MANUAL_IMPORT_CHUNK_SIZE).map((_, i) => {
        const id = String(offset+i);
        return {clientId:id, uploadId:id, status:queued.has(id) ? "already_uploaded" : "upload_required"};
      });
      maxChunk = Math.max(maxChunk, list.length);
      return {batchId:"same-batch", files:list};
    },
    upload: async (index, row) => {
      if (!uploadAttempts.has(index)) { uploadAttempts.add(index); throw transient(); }
      assert.equal(files[index].byteLength, 100_000);
      stored.add(row.uploadId);
    },
    complete: async (batch, rows) => {
      assert.equal(batch,"same-batch");
      for (const row of rows) { assert.ok(stored.has(row.uploadId)); queued.add(row.uploadId); }
      // Commit succeeded, but the response was lost: replay is idempotent.
      if (!completeAttempts.has(rows[0].uploadId)) {
        completeAttempts.add(rows[0].uploadId); throw transient();
      }
    },
    phase: () => {}, progress: n => {progress=n}, retry, mappingError:"mapping failed",
  });
  assert.equal(stored.size,500);
  assert.equal(queued.size,500);
  assert.equal(maxChunk,10);
  assert.equal(progress,500);
});

test("interrupt, flush successful transfers, resume same batch without reupload", async () => {
  const stored = new Set(), queued = new Set();
  let uploads = 0, interrupt = true;
  const ops = {
    prepare: async offset => ({batchId:"original", files:Array.from({length:Math.min(10,25-offset)},(_,i)=>{
      const id=String(offset+i);
      return {clientId:id,uploadId:id,status:queued.has(id)?"already_uploaded":"upload_required"};
    })}),
    upload: async (index, row) => {
      if (interrupt && index===13) throw new Error("connection interrupted");
      assert.ok(!stored.has(row.uploadId));
      stored.add(row.uploadId); uploads++;
    },
    complete: async (batch, rows) => {
      assert.equal(batch,"original");
      for (const row of rows) {assert.ok(stored.has(row.uploadId));queued.add(row.uploadId);}
    },
    phase:()=>{}, progress:()=>{}, retry, mappingError:"mapping failed",
  };
  await assert.rejects(runManualImport(25,ops), /connection interrupted/);
  assert.equal(queued.size,13);
  interrupt=false;
  await runManualImport(25,ops);
  assert.equal(queued.size,25);
  assert.equal(uploads,25);
});

test("temporary failures retry, permanent errors do not, retries are bounded", async () => {
  assert.ok(isTransientUploadError({status:429}));
  assert.ok(isTransientUploadError(new Error("HTTP 500: no more connections allowed (max_client_conn)")));
  assert.ok(isTransientUploadError(new Error("HTTP 409: MANUAL_IMPORT_BUSY")));
  assert.ok(!isTransientUploadError(new Error("HTTP 403: forbidden")));
  let count=0;
  await assert.rejects(retry(async()=>{count++;throw new Error("HTTP 403")}),/403/);
  assert.equal(count,1);
  count=0;
  await assert.rejects(retry(async()=>{count++;throw new Error("HTTP 429")}),/429/);
  assert.equal(count,7);
});
