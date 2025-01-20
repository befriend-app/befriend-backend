exports.up = function(knex) {
    return knex.schema.renameTable('top_languages_countries', 'languages_countries_top');
};

exports.down = function(knex) {
    return knex.schema.renameTable('languages_countries_top', 'top_languages_countries');
};
