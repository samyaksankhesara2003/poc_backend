// ----------------------------------open ai embade
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load menu
const menu = JSON.parse(
    fs.readFileSync(path.join(__dirname, "menu.json"), "utf-8")
);

// OpenAI embeddings
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Pinecone
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});
const index = pinecone.index(process.env.PINECONE_INDEX);

function dishToText(dish) {
    return `
    ${dish.name}.
    Category ${dish.category}.
    ${dish.type} dish.
    Spice level ${dish.spiceLevel}.
    Ingredients ${dish.ingredients.join(", ")}.
    Tags ${dish.tags.join(", ")}.
    Description ${dish.recipe}.
  `.trim();
}

async function uploadMenu() {
    if (!Array.isArray(menu) || menu.length === 0) {
        throw new Error("menu.json is empty or invalid");
    }

    const vectors = [];

    for (const dish of menu) {
        const text = dishToText(dish);

        const embedding = await openai.embeddings.create({
            model: "text-embedding-3-small", // 1536 dims
            input: text,
        });

        vectors.push({
            id: dish.id,
            values: embedding.data[0].embedding, // ✅ REQUIRED
            metadata: {
                name: dish.name,
                category: dish.category,
                type: dish.type,
                spiceLevel: dish.spiceLevel,
                price: dish.price,
            },
        });
    }

    console.log("Uploading vectors:", vectors);
    console.log("Uploading vectors:", vectors.length);

    //   await index.upsert(vectors);
    // await index.upsert({
    //     vectors: vectors
    // });
    await index.upsert({
        records: vectors.map(v => ({
            id: v.id,
            embedding: v.values,
            metadata: v.metadata
        }))
    });

    console.log("✅ Menu uploaded successfully (classic vector index)");
}

uploadMenu();
