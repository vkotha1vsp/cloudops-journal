import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError, notFound } from "@/lib/errors";
import { presignGet, presignPut } from "@/lib/s3";

/** Allow-list of upload types (Section 15). Extension and MIME type must agree. */
export const ALLOWED_UPLOADS: Record<string, string[]> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "application/pdf": [".pdf"],
  "text/markdown": [".md", ".markdown"],
  "text/plain": [".txt", ".log", ".mmd"],
  "application/json": [".json"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

export function validateUpload(fileName: string, mimeType: string, sizeBytes: number, maxMb: number) {
  const exts = ALLOWED_UPLOADS[mimeType];
  if (!exts) throw new HttpError(415, `File type ${mimeType} is not allowed`);
  const lower = fileName.toLowerCase();
  if (!exts.some((e) => lower.endsWith(e))) throw new HttpError(415, "File extension does not match its type");
  if (sizeBytes <= 0 || sizeBytes > maxMb * 1024 * 1024) throw new HttpError(413, `Files must be under ${maxMb} MB`);
  if (/[\\/]/.test(fileName) || fileName.length > 200) throw new HttpError(400, "Invalid file name");
}

export async function createUpload(ownerId: string, input: { fileName: string; mimeType: string; sizeBytes: number; pageId?: string }) {
  const e = env();
  if (!e.S3_ATTACHMENTS_BUCKET) throw new HttpError(503, "Attachments are not configured (S3_ATTACHMENTS_BUCKET is empty)");
  validateUpload(input.fileName, input.mimeType, input.sizeBytes, e.MAX_UPLOAD_MB);
  if (input.pageId) {
    const page = await db().journalPage.findFirst({ where: { id: input.pageId, ownerId }, select: { id: true } });
    if (!page) throw notFound("Page");
  }
  const ext = input.fileName.slice(input.fileName.lastIndexOf(".")).toLowerCase();
  const key = `users/${ownerId}/${randomUUID()}${ext}`;
  const attachment = await db().attachment.create({
    data: { ownerId, pageId: input.pageId, s3Key: key, fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes },
  });
  const uploadUrl = await presignPut(key, input.mimeType, input.sizeBytes);
  return { attachmentId: attachment.id, uploadUrl, headers: { "Content-Type": input.mimeType } };
}

export async function confirmUpload(ownerId: string, id: string) {
  const a = await db().attachment.findFirst({ where: { id, ownerId } });
  if (!a) throw notFound("Attachment");
  await db().attachment.update({ where: { id }, data: { uploaded: true } });
  return { ok: true };
}

export async function downloadUrl(ownerId: string, id: string) {
  const a = await db().attachment.findFirst({ where: { id, ownerId, uploaded: true } });
  if (!a) throw notFound("Attachment");
  return { url: await presignGet(a.s3Key, a.fileName), fileName: a.fileName, mimeType: a.mimeType };
}
