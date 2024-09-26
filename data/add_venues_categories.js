const {loadScriptEnv, generateToken, timeNow} = require("../services/shared");
loadScriptEnv();

const dbService = require("../services/db");
const categories_str = require("./fsq-categories-str.json");

(async function() {
    function getCategoryStr(category_name) {
        for(let item of categories_str) {
            if(item['Category Label'].includes(category_name)) {
                return item['Category ID'];
            }
        }

        //try category variation with "ies"
        let category_split = category_name.split(' ');

        for(let i = 0; i < category_split.length; i++) {
            let word = category_split[i];

            if(word.endsWith('y')) {
                word = word.substring(0, word.length - 1);
                word += 'ies';
            }

            category_split[i] = word;
        }

        let category_var = category_split.join(' ');

        for(let item of categories_str) {
            if(item['Category Label'].includes(category_var)) {
                return item['Category ID'];
            }
        }

        //handle few remaining
        let dict = {
            "Online Advertising Service": "63be6904847c3692a84b9b77",
            "Video Games Store": "4bf58dd8d48988d10b951735",
            "Print, TV, Radio and Outdoor Advertising Service": "63be6904847c3692a84b9b7f",
            "Home (private)": "4bf58dd8d48988d103941735",
            "Utility Company": "63be6904847c3692a84b9bb4",
            "Apartment or Condo": "4d954b06a243a5684965b473",
            "Cafe, Coffee, and Tea House": "63be6904847c3692a84b9bb6",
            "Market Research and Consulting Service": "63be6904847c3692a84b9b71",
            "College and University": "4d4b7105d754a06372d81259",
            "Harbor or Marina": "4bf58dd8d48988d1e0941735",
            "Obstetrician Gynecologist (Ob-gyn)": "63be6904847c3692a84b9bd1",
            "Writing, Copywriting and Technical Writing Service": "63be6904847c3692a84b9b99",
            "Car Wash and Detail": "4f04ae1f2fb6e1c99f3db0ba",
            "Boat or Ferry": "4bf58dd8d48988d12d951735",
            "Psychic and Astrologer": "52f2ab2ebcbc57f1066b8b43",
            "Search Engine Marketing and Optimization Service": "63be6904847c3692a84b9b8e",
            "Ski Resort and Area": "4bf58dd8d48988d1e9941735",
            "Promotional Item Service": "63be6904847c3692a84b9b80"
        };

        return dict[category_name] || null;
    }

    function getKey(categories, parent) {
        if(!parent) {
            return categories.join('-');
        }

        return categories.slice(0, -1).join('-');
    }

    let conn = await dbService.conn();

    let categories = require('./fsq-categories.json');

    let categories_str = require('./fsq-categories-str.json');

    let new_lines = [];

    for(let line of categories) {
        new_lines.push({
            fsq_id: line.category_id,
            categories: line.category_label.split('>'),
        });
    }

    new_lines.sort(function (a, b) {
        return a.categories.length - b.categories.length;
    });

    let db_ids = {};

    for(let line of new_lines) {
        let existing_qry = await conn('venues_categories')
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

        let fsq_id_str = getCategoryStr(category_name);

        if(existing_qry) {
            db_ids[db_key] = existing_qry.id;
        } else {
            let id = await conn('venues_categories')
                .insert({
                    parent_id: parent_id,
                    fsq_id: line.fsq_id,
                    fsq_id_str: fsq_id_str,
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