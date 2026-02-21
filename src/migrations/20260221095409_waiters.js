/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    return knex.schema.createTable("waiters", function (table) {
        table.increments("id").primary();
        table.string("username").unique().notNullable();
        table.string("email").notNullable().unique();
        table.string("audio_path"); 
        table.timestamps(true, true);
    });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    return knex.schema.dropTableIfExists("waiters");
}
