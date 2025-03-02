/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.dropTableIfExists('activities_filters');

    await knex.schema.alterTable('activities', (table) => {
        table
            .integer('network_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('networks')
            .after('activity_token');

        table.string('access_token').nullable().after('network_id');
        table.index('access_token');
    });

    await knex.schema.alterTable('activities_notifications', (table) => {
        table
            .integer('person_from_network_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('networks')
            .after('person_to_id');

        table.integer('person_to_network_id').unsigned().notNullable().alter();

        table
            .bigInteger('sent_at')
            .nullable()
            .alter()
            .comment(
                'If notification is being handled by 3rd party network, this field would be null at first',
            );

        table.boolean('did_network_receive').nullable().after('sent_to_network_at');

        table.string('access_token').nullable().after('did_network_receive');
        table.bigInteger('access_token_used_at').nullable().after('access_token');
        table.string('access_token_ip').nullable().after('access_token_used_at');

        table.index('access_token');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('activities', (table) => {
        table.dropForeign('network_id');

        table.dropColumn('network_id');
        table.dropColumn('access_token');
    });

    await knex.schema.alterTable('activities_notifications', (table) => {
        let cols = [
            'person_from_network_id',
            'did_network_receive',
            'access_token',
            'access_token_used_at',
            'access_token_ip',
        ];

        table.dropForeign('person_from_network_id');

        for (let col of cols) {
            table.dropColumn(col);
        }
    });
};
