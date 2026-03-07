import dotenv from "dotenv";
dotenv.config();

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Pinecone } from "@pinecone-database/pinecone";

// 1️⃣ Init Pinecone client
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

// 2️⃣ Get the "restaurants" index and target the "casasantiago_menu" namespace
const index = pinecone.index("restaurants").namespace("casasantiago_menu");

// 3️⃣ Load menu data from JSON file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const menuData = JSON.parse(
    readFileSync(join(__dirname, "modifyCasaSantiagoMenu.json"), "utf-8")
);

// 4️⃣ Upload function
async function uploadCasaSantiagoMenu() {
    console.log(`📋 Loaded ${menuData.length} menu items from modifyCasaSantiagoMenu.json`);

    // Each record already has: id, text, metadata
    // Pinecone's integrated embedding (llama-text-embed-v2) will auto-embed the "text" field
    const records = menuData.map((item) => ({
        id: item.id,
        text: item.text,
        ...item.metadata,
    }));

    console.log("⏳ Upserting records into Pinecone (restaurants / casasantiago_menu)...");

    // Upsert in batches of 10 to avoid hitting limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        await index.upsertRecords({ records: batch });
        console.log(`  ✅ Upserted batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} records)`);
    }

    console.log(`\n🎉 All ${records.length} menu items uploaded to Pinecone successfully!`);
    console.log(`   Index: restaurants`);
    console.log(`   Namespace: casasantiago_menu`);
}

uploadCasaSantiagoMenu().catch(console.error);
