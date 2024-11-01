/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

let table_name = 'activities';

exports.up = async function (knex) {
    let has_persons_qty_col = await knex.schema.hasColumn(table_name, 'persons_qty');

    if (!has_persons_qty_col) {
        await knex.schema.alterTable(table_name, (table) => {
            table.renameColumn('number_persons', 'persons_qty');
        });
    }

    return knex.schema.alterTable(table_name, (table) => {
        table.integer('persons_qty').notNullable().after('person_id').alter();
        table.string('location_name').nullable().after('custom_filters').alter();

        table.integer('activity_end').notNullable().after('activity_start');

        table.string('human_time').notNullable().after('no_end_time');
        table.string('human_date').notNullable().after('human_time');

        table.integer('in_min').notNullable().after('activity_duration_min');
        table.boolean('is_now').defaultTo(0).after('is_existing_friends');
        table.boolean('is_schedule').defaultTo(0).after('is_now');
        table.boolean('is_cancelled').defaultTo(0).after('is_public');

        table.string('location_address').nullable().after('location_name');
        table.string('location_address_2').nullable().after('location_address');
        table.string('location_locality').notNullable().after('location_address_2');
        table.string('location_region').nullable().after('location_locality');
        table.string('location_country').nullable().after('location_region');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    let cols = [
        'location_address',
        'location_address_2',
        'location_locality',
        'location_region',
        'location_country',
        'activity_end',
        'human_time',
        'human_date',
        'in_min',
        'is_now',
        'is_schedule',
        'is_cancelled',
    ];

    const existingCols = await Promise.all(
        cols.map((col) => knex.schema.hasColumn(table_name, col)),
    );

    return knex.schema.alterTable(table_name, (table) => {
        cols.forEach((col, index) => {
            if (existingCols[index]) {
                table.dropColumn(col);
            }
        });
    });
};
