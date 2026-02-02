import dotenv from "dotenv";
dotenv.config();

import { Pinecone } from "@pinecone-database/pinecone";

// 1️⃣ Init Pinecone client
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

// 2️⃣ Get index
const index = pinecone.index(process.env.PINECONE_INDEX);


const menuData = [
    {
        "id": "dish_001",
        "name": "Veg Manchurian",
        "category": "Chinese",
        "type": "Veg",
        "spiceLevel": "Medium",
        "ingredients": [
            "Cabbage",
            "Carrot",
            "Garlic",
            "Ginger",
            "Soy Sauce",
            "Corn Flour"
        ],
        "recipe": "Vegetable balls fried and tossed in spicy soy-garlic sauce.",
        "price": 180,
        "tags": [
            "chinese",
            "starter",
            "spicy"
        ]
    },
    {
        "id": "dish_002",
        "name": "Hakka Noodles",
        "category": "Chinese",
        "type": "Veg",
        "spiceLevel": "Low",
        "ingredients": [
            "Noodles",
            "Capsicum",
            "Onion",
            "Soy Sauce",
            "Cabbage"
        ],
        "recipe": "Stir-fried noodles with vegetables and Chinese sauces.",
        "price": 220,
        "tags": [
            "chinese",
            "noodles",
            "main-course"
        ]
    },
    {
        "id": "dish_003",
        "name": "Chicken Fried Rice",
        "category": "Chinese",
        "type": "Non-Veg",
        "spiceLevel": "Medium",
        "ingredients": [
            "Rice",
            "Chicken",
            "Garlic",
            "Soy Sauce",
            "Spring Onion"
        ],
        "recipe": "Rice stir-fried with chicken and Chinese seasonings.",
        "price": 260,
        "tags": [
            "chinese",
            "rice",
            "nonveg"
        ]
    },
    {
        "id": "dish_004",
        "name": "Paneer Chilli",
        "category": "Chinese",
        "type": "Veg",
        "spiceLevel": "High",
        "ingredients": [
            "Paneer",
            "Capsicum",
            "Onion",
            "Chilli Sauce",
            "Soy Sauce"
        ],
        "recipe": "Crispy paneer cubes tossed in spicy chilli sauce.",
        "price": 240,
        "tags": [
            "chinese",
            "paneer",
            "spicy"
        ]
    },
    {
        "id": "dish_005",
        "name": "Butter Paneer Masala",
        "category": "North Indian",
        "type": "Veg",
        "spiceLevel": "Medium",
        "ingredients": [
            "Paneer",
            "Tomato",
            "Butter",
            "Cream",
            "Cashew"
        ],
        "recipe": "Paneer cooked in rich tomato butter gravy.",
        "price": 280,
        "tags": [
            "north-indian",
            "paneer",
            "gravy"
        ]
    },
    {
        "id": "dish_006",
        "name": "Dal Makhani",
        "category": "North Indian",
        "type": "Veg",
        "spiceLevel": "Low",
        "ingredients": [
            "Black Lentils",
            "Butter",
            "Cream",
            "Garlic"
        ],
        "recipe": "Slow cooked lentils with butter and cream.",
        "price": 200,
        "tags": [
            "north-indian",
            "dal",
            "comfort-food"
        ]
    },
    {
        "id": "dish_007",
        "name": "Shahi Paneer",
        "category": "North Indian",
        "type": "Veg",
        "spiceLevel": "Medium",
        "ingredients": [
            "Paneer",
            "Cashew",
            "Cream",
            "Spices"
        ],
        "recipe": "Paneer in royal cashew-based gravy.",
        "price": 290,
        "tags": [
            "north-indian",
            "paneer",
            "rich"
        ]
    },
    {
        "id": "dish_008",
        "name": "Chicken Tikka Masala",
        "category": "North Indian",
        "type": "Non-Veg",
        "spiceLevel": "Medium",
        "ingredients": [
            "Chicken",
            "Tomato",
            "Cream",
            "Spices"
        ],
        "recipe": "Grilled chicken cooked in creamy tomato gravy.",
        "price": 320,
        "tags": [
            "north-indian",
            "chicken",
            "gravy"
        ]
    },
    {
        "id": "dish_009",
        "name": "Masala Dosa",
        "category": "South Indian",
        "type": "Veg",
        "spiceLevel": "Low",
        "ingredients": [
            "Rice Batter",
            "Potato",
            "Mustard Seeds",
            "Curry Leaves"
        ],
        "recipe": "Crispy dosa filled with spiced potato filling.",
        "price": 150,
        "tags": [
            "south-indian",
            "dosa",
            "breakfast"
        ]
    },
    {
        "id": "dish_010",
        "name": "Idli Sambhar",
        "category": "South Indian",
        "type": "Veg",
        "spiceLevel": "Low",
        "ingredients": [
            "Rice Batter",
            "Lentils",
            "Vegetables"
        ],
        "recipe": "Steamed rice cakes served with sambhar.",
        "price": 120,
        "tags": [
            "south-indian",
            "healthy",
            "breakfast"
        ]
    },
    {
        "id": "dish_011",
        "name": "Vada Sambhar",
        "category": "South Indian",
        "type": "Veg",
        "spiceLevel": "Medium",
        "ingredients": [
            "Urad Dal",
            "Spices",
            "Lentils"
        ],
        "recipe": "Fried lentil donuts soaked in sambhar.",
        "price": 130,
        "tags": [
            "south-indian",
            "snack"
        ]
    },
    {
        "id": "dish_012",
        "name": "Margherita Pizza",
        "category": "Italian",
        "type": "Veg",
        "spiceLevel": "Low",
        "ingredients": [
            "Pizza Base",
            "Cheese",
            "Tomato Sauce"
        ],
        "recipe": "Classic cheese pizza with tomato sauce.",
        "price": 300,
        "tags": [
            "italian",
            "pizza",
            "cheese"
        ]
    },
    {
        "id": "dish_013",
        "name": "Pasta Alfredo",
        "category": "Italian",
        "type": "Veg",
        "spiceLevel": "Low",
        "ingredients": [
            "Pasta",
            "Cream",
            "Garlic",
            "Cheese"
        ],
        "recipe": "Creamy white sauce pasta.",
        "price": 280,
        "tags": [
            "italian",
            "pasta",
            "creamy"
        ]
    },
    {
        "id": "dish_014",
        "name": "Chicken Pepperoni Pizza",
        "category": "Italian",
        "type": "Non-Veg",
        "spiceLevel": "Medium",
        "ingredients": [
            "Pizza Base",
            "Chicken Pepperoni",
            "Cheese"
        ],
        "recipe": "Pizza topped with chicken pepperoni and cheese.",
        "price": 350,
        "tags": [
            "italian",
            "pizza",
            "nonveg"
        ]
    },
    {
        "id": "dish_015",
        "name": "Veg Burger",
        "category": "Fast Food",
        "type": "Veg",
        "spiceLevel": "Low",
        "ingredients": [
            "Bun",
            "Veg Patty",
            "Lettuce",
            "Cheese"
        ],
        "recipe": "Grilled veg patty burger.",
        "price": 120,
        "tags": [
            "fast-food",
            "burger"
        ]
    },
    {
        "id": "dish_016",
        "name": "Chicken Burger",
        "category": "Fast Food",
        "type": "Non-Veg",
        "spiceLevel": "Medium",
        "ingredients": [
            "Bun",
            "Chicken Patty",
            "Cheese"
        ],
        "recipe": "Crispy chicken burger.",
        "price": 160,
        "tags": [
            "fast-food",
            "burger",
            "nonveg"
        ]
    },
    {
        "id": "dish_017",
        "name": "French Fries",
        "category": "Fast Food",
        "type": "Veg",
        "spiceLevel": "Low",
        "ingredients": [
            "Potato",
            "Salt"
        ],
        "recipe": "Deep fried crispy potato fries.",
        "price": 100,
        "tags": [
            "fast-food",
            "snack"
        ]
    },
    {
        "id": "dish_018",
        "name": "Chocolate Brownie",
        "category": "Dessert",
        "type": "Veg",
        "spiceLevel": "None",
        "ingredients": [
            "Chocolate",
            "Flour",
            "Butter",
            "Sugar"
        ],
        "recipe": "Soft chocolate brownie.",
        "price": 150,
        "tags": [
            "dessert",
            "sweet"
        ]
    },
    {
        "id": "dish_019",
        "name": "Ice Cream Sundae",
        "category": "Dessert",
        "type": "Veg",
        "spiceLevel": "None",
        "ingredients": [
            "Ice Cream",
            "Chocolate Syrup",
            "Nuts"
        ],
        "recipe": "Ice cream topped with chocolate and nuts.",
        "price": 140,
        "tags": [
            "dessert",
            "cold"
        ]
    }
];
// 4️⃣ Upload function
async function uploadMenu() {
    const records = menuData.map((dish) => ({
        id: dish.id,

        // 🔥 This text is what Pinecone embeds & searches
        text: `
${dish.name}.
Category: ${dish.category}.
Type: ${dish.type}.
Spice Level: ${dish.spiceLevel}.
Ingredients: ${dish.ingredients.join(", ")}.
Recipe: ${dish.recipe}.
`.trim(),
    }));

    await index.upsertRecords({
        records,
    });

    console.log("✅ Menu uploaded to Pinecone successfully");
}

uploadMenu().catch(console.error);
