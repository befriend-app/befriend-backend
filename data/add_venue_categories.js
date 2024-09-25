const {loadScriptEnv, joinPaths, generateToken, timeNow} = require("../services/shared");
loadScriptEnv();

const dbService = require("../services/db");

(async function() {
    function getKey(categories, parent) {
        if(!parent) {
            return categories.join('-');
        }

        return categories.slice(0, -1).join('-');

    }

    let conn = await dbService.conn();

    let fsq_categories_data = require('fs').readFileSync(joinPaths(__dirname, './fsq-categories')).toString();

    let lines = fsq_categories_data.split('\n');

    let new_lines = [];

    for(let line of lines) {
        line = line.split('\t');

        new_lines.push({
            fsq_id: line[0],
            categories: line[1].split('>'),
        })
    }

    new_lines.sort(function (a, b) {
        return a.categories.length - b.categories.length;
    });

    let db_ids = {};

    for(let line of new_lines) {
        let existing_qry = await conn('venue_categories')
            .where('fsq_id', line.fsq_id)
            .first();

        //trim categories
        for(let i = 0; i < line.categories.length; i++) {
            line.categories[i] = line.categories[i].trim();
        }

        let db_key = getKey(line.categories);
        let parent_key = getKey(line.categories, true);

        let parent_id = db_ids[parent_key] || null;

        let category_name = line.categories[line.categories.length - 1];
        let parent_categories = line.categories.slice(0, -1);
        let category_full = `${category_name}`;

        if(parent_categories.length) {
            category_full += ` - ${parent_categories.join(' > ')}`;
        }

        if(existing_qry) {
            db_ids[db_key] = existing_qry.id;
        } else {
            let id = await conn('venue_categories')
                .insert({
                    parent_id: parent_id,
                    fsq_id: line.fsq_id,
                    category_token: generateToken(24),
                    category_name: category_name,
                    category_name_full: category_full,
                    created: timeNow(),
                    updated: timeNow()
                });

            db_ids[db_key] = id[0];
        }
    }

    process.exit();
})();