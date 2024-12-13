// Migration for work industries and roles tables
exports.up = async function (knex) {
    const hasColumn = await knex.schema.hasColumn('persons_filters', 'industry_id');

    if (hasColumn) {
        await knex.schema.alterTable('persons_filters', (table) => {
            table.dropForeign('industry_id');
            table.dropColumn('industry_id');
        });
    }

    await Promise.all([
        knex.schema.dropTableIfExists('persons_industries'),
        knex.schema.dropTableIfExists('persons_roles'),
        knex.schema.dropTableIfExists('industries'),
        knex.schema.dropTableIfExists('work_industries'),
        knex.schema.dropTableIfExists('work_roles'),
    ]);

    return Promise.all([
        knex.schema.createTable('work_industries', function (table) {
            table.increments('id').primary();
            table.string('token', 32).notNullable().unique();
            table.string('name', 255).notNullable();
            table.boolean('is_visible').notNullable().defaultTo(true);
            table.integer('position').nullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.index('token');
        }),

        knex.schema.createTable('work_roles', function (table) {
            table.increments('id').primary();
            table.string('token', 32).notNullable().unique();
            table.string('name', 255).notNullable();
            table.string('category_token', 32).notNullable();
            table.string('category_name', 255).notNullable();
            table.boolean('is_visible').notNullable().defaultTo(true);
            table.integer('position').nullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.index('token');
            table.index('category_token');
        }),

        knex.schema.createTable('persons_industries', function (table) {
            table.bigIncrements('id').primary();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('industry_id').unsigned().notNullable();
            table.string('industry_token', 32).notNullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('industry_id').references('id').inTable('work_industries');
        }),

        knex.schema.createTable('persons_roles', function (table) {
            table.bigIncrements('id').primary();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('role_id').unsigned().notNullable();
            table.string('role_token', 32).notNullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('role_id').references('id').inTable('work_roles');
        }),
    ]);
};

exports.down = function (knex) {
    return Promise.all([
        knex.schema.dropTableIfExists('persons_roles'),
        knex.schema.dropTableIfExists('persons_industries'),
        knex.schema.dropTableIfExists('work_roles'),
        knex.schema.dropTableIfExists('work_industries'),
    ]);
};
