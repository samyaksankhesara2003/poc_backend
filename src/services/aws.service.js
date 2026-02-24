import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
  } from "@aws-sdk/client-s3";
  import dotenv from "dotenv";
  
  dotenv.config();
  
  class ObjectStorage {
    constructor() {
      this.bucket = process.env.S3_BUCKET_NAME;
      this.region = process.env.AWS_REGION;
  
      this.client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId: process.env.S3_BUCKET_ACCESS_KEY,
          secretAccessKey: process.env.S3_BUCKET_SECRET_ACCESS_KEY,
        },
      });
    }
  
    /* ================= UPLOAD BUFFER ================= */
    async uploadBuffer(key, buffer, contentType = "application/octet-stream") {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        })
      );
  
      return key;
    }
  
    /* ================= UPLOAD STREAM ================= */
    async uploadStream(key, stream, contentType = "application/octet-stream") {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: stream,
          ContentType: contentType,
        })
      );
  
      return key;
    }
  
    /* ================= DOWNLOAD BUFFER ================= */
    async downloadBuffer(key) {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
  
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
  
      return Buffer.concat(chunks);
    }
  
    /**
     * Download an audio file from S3 by key
     * @param {string} key
     * @returns {Promise<Buffer|null>}
     */
    async downloadAudioBuffer(key) {
      if (!key || typeof key !== "string") return null;
  
      try {
        const buffer = await this.downloadBuffer(key);
        return buffer && buffer.length > 0 ? buffer : null;
      } catch (err) {
        console.warn("[S3] downloadAudioBuffer failed:", key, err?.message);
        return null;
      }
    }
  
    /* ================= DOWNLOAD STREAM ================= */
    async downloadStream(key) {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
  
      return response.Body; // Readable stream
    }
  
    /* ================= DELETE OBJECT ================= */
    async deleteObject(key) {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
  
      return key;
    }
  }
  
  export default new ObjectStorage();
  