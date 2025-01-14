exports.up = async function (knex) {
    await knex.schema.alterTable('activities', (table) => {
        table.string('fsq_place_id').nullable().after('persons_qty');
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable('activities', (table) => {
        table.dropColumn('fsq_place_id');
    });
};
