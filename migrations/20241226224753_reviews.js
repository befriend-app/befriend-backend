/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    const hasColumn = await knex.schema.hasColumn('persons', 'reviews_rating');

    if (hasColumn) {
        await knex.schema.alterTable('persons', (table) => {
            table.dropColumn('reviews_rating');
        });
    }

    await knex.schema.alterTable('persons', (table) => {
        table.decimal('rating_safety', 5, 3).nullable().after('reviews_count');
        table.decimal('rating_trust', 5, 3).nullable().after('rating_safety');
        table.decimal('rating_timeliness', 5, 3).nullable().after('rating_trust');
        table.decimal('rating_friendliness', 5, 3).nullable().after('rating_timeliness');
        table.decimal('rating_fun', 5, 3).nullable().after('rating_friendliness');
    });

    await knex.schema.alterTable('reviews', (table) => {
        table.boolean('is_active').defaultTo(true).after('sort_position');
        table.boolean('is_safety').defaultTo(false).after('is_active');
        table.boolean('is_trust').defaultTo(false).after('is_safety');
        table.boolean('is_timeliness').defaultTo(false).after('is_trust');
        table.boolean('is_friendliness').defaultTo(false).after('is_timeliness');
        table.boolean('is_fun').defaultTo(false).after('is_friendliness');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    await knex.schema.alterTable('persons', (table) => {
        table.dropColumn('rating_fun');
        table.dropColumn('rating_friendliness');
        table.dropColumn('rating_timeliness');
        table.dropColumn('rating_trust');
        table.dropColumn('rating_safety');
    });

    await knex.schema.alterTable('reviews', (table) => {
        table.dropColumn('is_fun');
        table.dropColumn('is_friendliness');
        table.dropColumn('is_timeliness');
        table.dropColumn('is_trust');
        table.dropColumn('is_safety');
        table.dropColumn('is_active');
    });
};
