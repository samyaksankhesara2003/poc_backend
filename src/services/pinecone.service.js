import dotenv from "dotenv";
dotenv.config();
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Pinecone } from "@pinecone-database/pinecone";
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});
const index = pinecone.index("restaurants");

const getNamespacesService = async () => {
    try {
        const stats = await index.describeIndexStats();

        const namespaces = Object.keys(stats.namespaces || {});

        return { message: 'Namespaces fetched successfully', data: namespaces };
    } catch (error) {
        throw new Error('Failed to fetch namespaces');
    }
};
const getRecordsService = async (query) => {
    try {
        const namespace = query.namespace;

        const ns = index.namespace(namespace);

        // Step 1: list ids
        const listResponse = await ns.listPaginated();

        const ids = listResponse.vectors.map(v => v.id);

        console.log(ids, "ids");

        // Step 2: fetch records
        const records = await ns.fetch({ ids });

        return {
            namespace,
            count: ids.length,
            records: records.records
        };

    } catch (error) {
        console.error("getRecordsService error:", error);
        throw new Error("Failed to fetch records");
    }
};

const searchMenuService = async (body) => {

    try {
        const { query, namespace } = body;
        const ns = index.namespace(namespace);

        const response = await ns.searchRecords({
            query: {
                topK: 10,
                inputs: { text: query },
            },
            rerank: {
                model: "bge-reranker-v2-m3",
                topN: 5,
                rankFields: ["text"],
            },
        });

        const results = response.result?.hits?.map((item) => ({
            id: item._id,
            score: item._score,
            category: item.fields.category,
            cuisine: item.fields.cuisine,
            dish: item.fields.dish,
            price: item.fields.price,
            description: item.fields.text,
            type: item.fields.type,
            tags: item.fields.tags,
        }));

        return results;
    } catch (error) {
        throw new Error(`Failed to search menu: ${error.message}`);

    }
}

const uploadMenuService = async () => {
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const menuPath = join(__dirname, '../scripts/modifyCasaSantiagoMenu.json');
        const menuData = JSON.parse(readFileSync(menuPath, 'utf-8'));

        const ns = index.namespace('casasantiago_menu');

        const records = menuData.map((item) => ({
            id: item.id,
            text: item.text,
            ...item.metadata,
        }));

        const BATCH_SIZE = 10;
        for (let i = 0; i < records.length; i += BATCH_SIZE) {
            const batch = records.slice(i, i + BATCH_SIZE);
            await ns.upsertRecords({ records: batch });
        }

        return {
            message: 'Menu uploaded to Pinecone successfully',
            totalRecords: records.length,
            index: 'restaurants',
            namespace: 'casasantiago_menu',
        };
    } catch (error) {
        console.error('uploadMenuService error:', error);
        throw new Error(`Failed to upload menu: ${error.message}`);
    }
};

// ─── OpenAI Self-Embedding POC ───
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const selfEmbeddingIndex = pinecone.index("servesense");

/**
 * Generate a 3072-dim embedding using OpenAI text-embedding-3-large.
 */
const generateEmbedding = async (text) => {
    const response = await openai.embeddings.create({
        model: "text-embedding-3-large",
        input: text,
        // dimensions: 1536

    });

    return response.data[0].embedding;
};

/**
 * Upload menu to the 'slefembedding' index using OpenAI-generated embeddings.
 */
const uploadMenuWithEmbeddingService = async () => {
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const menuPath = join(__dirname, '../scripts/modifyCasaSantiagoMenu.json');
        const menuData = JSON.parse(readFileSync(menuPath, 'utf-8'));

        const ns = selfEmbeddingIndex.namespace('casasantiago_menu_openai');

        const BATCH_SIZE = 10;
        let totalUpserted = 0;

        for (let i = 0; i < menuData.length; i += BATCH_SIZE) {
            const batch = menuData.slice(i, i + BATCH_SIZE);

            // Generate embeddings for the batch
            const vectors = await Promise.all(
                batch.map(async (item) => {
                    const embedding = await generateEmbedding(item.text);
                    return {
                        id: item.id,
                        values: embedding,
                        metadata: {
                            text: item.text,
                            ...item.metadata,
                        },
                    };
                })
            );

            await ns.upsert({ records: vectors });
            totalUpserted += vectors.length;
            console.log(`  ✅ Upserted batch ${Math.floor(i / BATCH_SIZE) + 1} (${vectors.length} records)`);
        }

        return {
            message: 'Menu uploaded to Pinecone with OpenAI embeddings successfully',
            totalRecords: totalUpserted,
            index: 'slefembedding',
            namespace: 'casasantiago_menu_openai',
            embeddingModel: 'text-embedding-3-large',
            dimensions: 3072,
        };
    } catch (error) {
        console.error('uploadMenuWithEmbeddingService error:', error);
        throw new Error(`Failed to upload menu with embeddings: ${error.message}`);
    }
};

// const QUERY_UNDERSTANDING_PROMPT = `You are a query understanding system for a restaurant menu semantic search engine.

// Your job is to convert a user's natural language food request into a structured query for vector search.

// Follow these rules:

// 1. Identify the main food intent - what the user WANTS to find.
// 2. Extract ingredients or food types the user wants in include_ingredients.
// 3. Extract ingredients or food types the user does NOT want in exclude_ingredients.
// 4. For search_query: write ONLY what the user wants to search for (positive intent or question intent).
// 5. Restaurant menus include: food dishes, drinks (wine, water, juice, soda, coffee, tea, beer ,etc.), desserts, appetizers, and beverages.
// 6. If the user only mentions what they DON'T want, or the query is not about food, set search_query to null.
// 7. The search_query should NOT contain negation words like "not", "don't", "without".
// 8. The search_query should describe the dish or food type they want to find, not what to exclude.

// Return ONLY valid JSON in this format:

// {
//   "search_query": "what user wants to find" OR null,
//   "include_ingredients": [],
//   "exclude_ingredients": []
// }

// `;

const QUERY_UNDERSTANDING_PROMPT = `You are a query understanding system for a restaurant menu semantic search engine.

Your job is to convert a user's natural language food request into a structured query for vector search.

Follow these rules:

1. Identify the main food/drink/menu item intent - what the user WANTS to find.
2. If the user asks for multiple items (e.g., "sandwich and wine"), combine them in the search_query.
3. Extract ingredients or food types the user wants in include_ingredients.
4. Extract ingredients or food types the user does NOT want in exclude_ingredients.
5. For search_query: write ONLY what the user wants to search for (positive intent).
6. Restaurant menus include: food dishes, drinks (wine, water, juice, soda, coffee, tea, beer, cocktails, etc.), desserts, appetizers, starters, main courses, sides, salads, soups, and beverages.
7. Understand menu categories: appetizers, starters, entrees, main courses, mains, sides, desserts, sweets, drinks, beverages, etc.
8. If the user only mentions what they DON'T want, or the query is not about menu items, set search_query to null.
9. The search_query should NOT contain negation words like "not", "don't", "without".
10. The search_query should describe the dish, drink, or menu item they want to find, not what to exclude.

Return ONLY valid JSON in this format:

{
  "search_query": "what user wants to find" OR null,
  "include_ingredients": [],
  "exclude_ingredients": []
}

Examples:
- "what desserts do you have" → {"search_query": "desserts", "include_ingredients": [], "exclude_ingredients": []}
- "show me your starters" → {"search_query": "starters", "include_ingredients": [], "exclude_ingredients": []}
- "I want sandwich and wine" → {"search_query": "sandwich and wine", "include_ingredients": [], "exclude_ingredients": []}
- "what kind of wine you have" → {"search_query": "wine", "include_ingredients": [], "exclude_ingredients": []}
- "I don't like fish" → {"search_query": null, "include_ingredients": [], "exclude_ingredients": ["fish"]}
`;

const understandQuery = async (userQuery) => {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: QUERY_UNDERSTANDING_PROMPT },
            { role: "user", content: userQuery },
        ],
    });
    return JSON.parse(response.choices[0].message.content);
};

/**
 * Search menu using OpenAI-generated query embedding against 'slefembedding' index.
 * Adds an LLM query understanding layer to handle negation and intent extraction.
 */
const searchMenuWithEmbeddingService = async (body) => {
    try {
        const { query, namespace } = body;

        // Step 1: LLM Query Understanding
        const understood = await understandQuery(query);
        console.log('🧠 Query understanding:', JSON.stringify(understood));

        // If search_query is empty, no food intent found — skip Pinecone
        if (!understood.search_query) {
            return {
                // originalQuery: query,
                // understood,
                results: [],
            };
        }

        // Step 2: Generate embedding from the rewritten search query
        const ns = selfEmbeddingIndex.namespace(namespace || 'casasantiago_menu_openai');
        const queryEmbedding = await generateEmbedding(understood.search_query);

        const response = await ns.query({
            vector: queryEmbedding,
            topK: 5,
            includeMetadata: true,
        });

        // Step 3: Filter out results that match exclude_ingredients
        const excludeSet = (understood.exclude_ingredients || []).map((i) => i.toLowerCase());

        const results = (response.matches || [])
            .map((match) => ({
                id: match.id,
                score: match.score,
                dish: match.metadata?.dish,
                category: match.metadata?.category,
                price: match.metadata?.price,
                description: match.metadata?.text,
            }))
        // .filter((item) => {
        //     if (excludeSet.length === 0) return true;
        //     const text = (item.description || '').toLowerCase();
        //     const dish = (item.dish || '').toLowerCase();
        //     return !excludeSet.some((exc) => text.includes(exc) || dish.includes(exc));
        // });

        return {
            // originalQuery: query,
            // understood,
            results,
        };
        // return "samyak"
    } catch (error) {
        console.error('searchMenuWithEmbeddingService error:', error);
        throw new Error(`Failed to search menu with embeddings: ${error.message}`);
    }
};

/**
 * Search menu from a raw transcript string (called by transcriptionLogger every ~6s).
 * Reuses the same query-understanding + OpenAI-embedding pipeline.
 */
const searchMenuFromTranscript = async (transcriptText) => {
    try {
        if (!transcriptText || transcriptText.trim().length === 0) return null;
        // console.log(transcriptText, "transcriptText");

        // Step 1: LLM Query Understanding
        const understood = await understandQuery(transcriptText);
        console.log('🧠 [TranscriptSearch] Query understanding:', JSON.stringify(understood));

        // No food intent detected — skip
        if (!understood.search_query) {
            // console.log('🔍 [TranscriptSearch] No food intent — skipping search');
            return null;
        }

        // Step 2: Generate embedding and query Pinecone
        const ns = selfEmbeddingIndex.namespace('casasantiago_menu_openai');
        const queryEmbedding = await generateEmbedding(understood.search_query);

        const response = await ns.query({
            vector: queryEmbedding,
            topK: 5,
            includeMetadata: true,
        });

        // Step 3: Map results
        const results = (response.matches || []).map((match) => ({
            id: match.id,
            score: match.score,
            dish: match.metadata?.dish,
            category: match.metadata?.category,
            price: match.metadata?.price,
            description: match.metadata?.text,
        }));

        // console.log(`🔍 [TranscriptSearch] Found ${results.length} results for "${understood.search_query}"`);
        // if (results.length > 0) {
        //     console.log('🔍 [TranscriptSearch] Top results:', JSON.stringify(results.slice(0, 3), null, 2));
        // }
        // console.log(results, ">>>>>>>>>>>>>>>>>>>>>.");

        return { understood, results };
        // return "samyak";
    } catch (error) {
        console.error('🔍 [TranscriptSearch] Error:', error.message);
        return null;
    }
};

export const pineconeService = {
    getNamespacesService,
    getRecordsService,
    searchMenuService,
    uploadMenuService,
    uploadMenuWithEmbeddingService,
    searchMenuWithEmbeddingService,
    searchMenuFromTranscript
};