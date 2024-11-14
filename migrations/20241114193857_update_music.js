exports.up = async function (knex) {
    let has_old_name_col = await knex.schema.hasColumn('music_artists', 'artist_name');

    return Promise.all([
        knex.schema.alterTable('music_genres', function (table) {
            table.boolean('is_featured').notNullable().defaultTo(false).after('is_active');
        }),

        knex.schema.alterTable('music_artists', function (table) {
            if(has_old_name_col) {
                table.renameColumn('artist_name', 'name');
                table.string('sort_name').nullable().after('artist_name');
            } else {
                table.string('sort_name').nullable().after('name');
            }

            table.string('mb_id').nullable().after('apple_id');

            table.string('type').nullable().after('mb_id');

            table.string('tags', 1000).nullable().after('type');

            table.index('mb_id');
        }),

        knex.schema.alterTable('music_artists_genres', function (table) {
            table.integer('popularity').nullable().defaultTo(0);
        }),

        knex.schema.dropTableIfExists('music_artists_genres_countries')
    ]);
};

exports.down = function (knex) {
    return Promise.all([
        knex.schema.alterTable('music_artists_genres', function (table) {
            table.dropColumn('popularity');
        }),

        knex.schema.alterTable('music_artists', function (table) {
            table.dropColumn('sort_name');
            table.dropColumn('mb_id');
            table.dropColumn('type');
            table.dropColumn('tags');
        }),

        knex.schema.alterTable('music_genres', function (table) {
            table.dropColumn('is_featured');
        }),
    ]);
};