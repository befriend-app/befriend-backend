exports.up = async function (knex) {
    await knex.schema.alterTable('persons_filters', (table) => {
        table.string('token').notNullable().after('person_id');

        table.index('token');
    });

    await knex.schema.alterTable('persons_availability', (table) => {
        table.string('token').notNullable().after('person_id');

        table.index('token');
    });

    await knex.schema.alterTable('persons_filters_networks', (table) => {
        table.string('token').notNullable().after('person_id');

        table.index('token');
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable('persons_filters', (table) => {
        table.dropColumn('token');
    });

    await knex.schema.alterTable('persons_availability', (table) => {
        table.dropColumn('token');
    });

    await knex.schema.alterTable('persons_filters_networks', (table) => {
        table.dropColumn('token');
    });
};
