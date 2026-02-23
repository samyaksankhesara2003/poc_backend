import { Client } from "minio";
import dotenv from "dotenv";
dotenv.config();

class ObjectStorage {
    constructor() {
        this.bucket = process.env.STORAGE_BUCKET;

        this.client = new Client({
            endPoint: process.env.STORAGE_ENDPOINT,
            port: Number(process.env.STORAGE_PORT) || 9000,
            useSSL: process.env.STORAGE_SSL === "true",
            accessKey: process.env.STORAGE_ACCESS_KEY,
            secretKey: process.env.STORAGE_SECRET_KEY,
        });
    }

    /* ================= UPLOAD BUFFER ================= */

    async uploadBuffer(key, buffer, contentType = "application/octet-stream") {
        await this.client.putObject(this.bucket, key, buffer, {
            "Content-Type": contentType,
        });
        return key;
    }

    /* ================= UPLOAD STREAM ================= */

    async uploadStream(key, stream, contentType = "application/octet-stream") {
        await this.client.putObject(this.bucket, key, stream, {
            "Content-Type": contentType,
        });
        return key;
    }

    /* ================= DOWNLOAD BUFFER ================= */

    async downloadBuffer(key) {
        const stream = await this.client.getObject(this.bucket, key);
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    }

    /* ================= DOWNLOAD STREAM ================= */

    async downloadStream(key) {
        return this.client.getObject(this.bucket, key);
    }

    /* ================= DELETE OBJECT ================= */

async deleteObject(key) {
    await this.client.removeObject(this.bucket, key);
    return key;
}
}



export default new ObjectStorage();
