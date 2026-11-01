import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

let client: S3Client | undefined;

/** Uses the ECS task role / EC2 instance profile. No static keys in the app. */
export function s3(): S3Client {
  client ??= new S3Client({ region: env().AWS_REGION });
  return client;
}

export async function presignPut(key: string, contentType: string, contentLength: number) {
  const cmd = new PutObjectCommand({
    Bucket: env().S3_ATTACHMENTS_BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
    ServerSideEncryption: "AES256",
  });
  return getSignedUrl(s3(), cmd, { expiresIn: 300, signableHeaders: new Set(["content-type", "content-length"]) });
}

export async function presignGet(key: string, fileName: string) {
  const cmd = new GetObjectCommand({
    Bucket: env().S3_ATTACHMENTS_BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${fileName.replace(/[^\w.\- ]/g, "_")}"`,
  });
  return getSignedUrl(s3(), cmd, { expiresIn: 300 });
}
