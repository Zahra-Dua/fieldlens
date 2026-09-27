import { Client as MinioClient } from "minio";

const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
const bucket = process.env.MINIO_BUCKET ?? "fieldlens-images";

const parsed = new URL(endpoint);

export const minioClient = new MinioClient({
  endPoint: parsed.hostname,
  port: parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80,
  useSSL: parsed.protocol === "https:",
  accessKey: process.env.MINIO_ROOT_USER ?? "fieldlens_minio",
  secretKey: process.env.MINIO_ROOT_PASSWORD ?? "change_me_locally_minio",
});

export async function ensureBucket() {
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    await minioClient.makeBucket(bucket, "us-east-1");
  }
}

export async function uploadToMinio(objectKey: string, buffer: Buffer, mimeType: string) {
  await ensureBucket();
  await minioClient.putObject(bucket, objectKey, buffer, buffer.length, {
    "Content-Type": mimeType,
  });
}

export { bucket as MINIO_BUCKET };
