/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    return knex.schema.createTable("conversations", function (table) {
        table.increments("id").primary();
        table.integer("session_id").unsigned().notNullable().references('id').inTable('sessions').onDelete('CASCADE');
        table.string("unique_session_id").notNullable();
        table.string('audio_path').notNullable();
        table.string('status').notNullable(); // paus,end
        table.json("transcriptions").notNullable();
        table.timestamps(true, true);
    });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    return knex.schema.dropTableIfExists("conversations");
}
