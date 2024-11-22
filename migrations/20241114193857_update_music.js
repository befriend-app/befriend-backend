exports.up = async function (knex) {
    let has_old_name_col = await knex.schema.hasColumn('music_artists', 'artist_name');

    return Promise.all([
        knex.schema.alterTable('music_genres', function (table) {
            table.boolean('is_featured').notNullable().defaultTo(false).after('is_active');
            table.integer('position').nullable().after('is_featured');
            table.string('spotify_genres').nullable().after('parent_id');
        }),

        knex.schema.alterTable('music_artists', function (table) {
            if (has_old_name_col) {
                table.renameColumn('artist_name', 'name');
                table.string('sort_name').nullable().after('artist_name');
            } else {
                table.string('sort_name').nullable().after('name');
            }

            table.string('spotify_id', 100).nullable().after('sort_name');
            table.integer('spotify_popularity').nullable().after('spotify_id');
            table.integer('spotify_followers').nullable().after('spotify_popularity');
            table.string('spotify_type', 60).nullable().after('spotify_followers');
            table.string('spotify_genres', 1000).nullable().after('spotify_type');
            table.boolean('spotify_processed').notNullable().defaultTo(0).after('spotify_genres');

            table.string('mb_type').nullable().after('mb_id');
            table.string('mb_tags', 1000).nullable().after('mb_type');

            table.index('spotify_id');
        }),

        knex.schema.dropTableIfExists('music_artists_genres_countries'),
    ]);
};

exports.down = async function (knex) {
    const hasColumn = async (table, column) => {
        return await knex.schema.hasColumn(table, column);
    };

    const dropColumn = async (table, columns) => {
        const existingColumns = await Promise.all(
            columns.map(async (column) => ({
                column,
                exists: await hasColumn(table, column),
            })),
        );

        const columnsToDrop = existingColumns
            .filter(({ exists }) => exists)
            .map(({ column }) => column);

        if (columnsToDrop.length > 0) {
            await knex.schema.alterTable(table, (t) => {
                columnsToDrop.forEach((column) => {
                    t.dropColumn(column);
                });
            });
        }
    };

    await dropColumn('music_artists', [
        'sort_name',
        'spotify_id',
        'spotify_popularity',
        'spotify_followers',
        'spotify_type',
        'spotify_genres',
        'spotify_processed',
        'mb_id',
        'mb_type',
        'mb_tags',
    ]);

    await dropColumn('music_genres', ['is_featured', 'position', 'spotify_genres']);
};
