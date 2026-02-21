/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    return knex.schema.createTable("sessions", function (table) {
        table.increments("id").primary();
        table.integer("waiter_id").unsigned().notNullable().references('id').inTable('waiters').onDelete('CASCADE');
        table.integer("table_id").unsigned().notNullable().references('id').inTable('tables').onDelete('CASCADE');
        table.string("unique_session_id").unique().notNullable();
        table.timestamps(true, true);
    });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    return knex.schema.dropTableIfExists("sessions");
}
