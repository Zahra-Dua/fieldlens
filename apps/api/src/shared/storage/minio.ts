import { Client as MinioClient } from "minio";
// Credentials must come from the environment. No default value, so a
// forgotten variable fails loudly instead of using a weak password.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
const bucket = process.env.MINIO_BUCKET ?? "fieldlens-images";

const parsed = new URL(endpoint);

export const minioClient = new MinioClient({
  endPoint: parsed.hostname,
  port: parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80,
  useSSL: parsed.protocol === "https:",
  accessKey: requireEnv("MINIO_ROOT_USER"),
  secretKey: requireEnv("MINIO_ROOT_PASSWORD"),
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
export async function getFromMinio(objectKey: string) {
  return minioClient.getObject(bucket, objectKey);
}
export { bucket as MINIO_BUCKET };
