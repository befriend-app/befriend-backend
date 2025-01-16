exports.up = async function(knex) {
    await knex.schema.alterTable('persons', (table) => {
        table.integer('prev_grid_id').unsigned().nullable().after('grid_id')
            .references('id').inTable('earth_grid');
    });
};

exports.down = async function(knex) {
    await knex.schema.alterTable('persons', (table) => {
        table.dropColumn('prev_grid_id');
    });
};
