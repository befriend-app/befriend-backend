const axios = require('axios');
const { loadScriptEnv, timeNow, dataEndpoint } = require('../../services/shared');
const dbService = require('../../services/db');
const cacheService = require('../../services/cache');

loadScriptEnv();

function syncGenres() {
    return new Promise(async (resolve, reject) => {
        console.log("Sync genres");

        let main_table = 'music_genres';
        let countries_table = 'music_genres_countries';

        let batch_insert = [];
        let batch_update = [];

        let batch_insert_countries = [];
        let batch_update_countries = [];

        try {
            let conn = await dbService.conn();

            // Countries lookup
            let countries_dict = {
                byId: {},
                byToken: {}
            };
            let countries = await conn('open_countries');

            for(let country of countries) {
                countries_dict.byId[country.id] = country;
                countries_dict.byToken[country.country_code] = country;
            }

            // Existing genres lookup
            let genres_dict = {
                byId: {},
                byToken: {}
            };
            let genres = await conn(main_table);

            for(let genre of genres) {
                genres_dict.byId[genre.id] = genre;
                genres_dict.byToken[genre.token] = genre;
            }

            // country genres lookup
            let country_genres_dict = {};
            let country_genres = await conn(countries_table);

            for(let cg of country_genres) {
                let country = countries_dict.byId[cg.country_id];
                let genre = genres_dict.byId[cg.genre_id];

                if(!(country.country_code in country_genres_dict)) {
                    country_genres_dict[country.country_code] = {};
                }

                country_genres_dict[country.country_code][genre.token] = cg;
            }

            let endpoint = dataEndpoint(`/music/genres`);

            let r = await axios.get(endpoint);

            let { items } = r.data;

            // Process genres
            for(let [token, genre] of Object.entries(items.genres)) {
                let existing = genres_dict.byToken[token];

                if(!existing) {
                    // Skip if deleted
                    if(genre.deleted) {
                        continue;
                    }

                    let new_item = {
                        token: token,
                        name: genre.name,
                        parent_id: null, // Will update after all genres are inserted
                        is_active: genre.is_active,
                        is_featured: genre.is_featured,
                        created: timeNow(),
                        updated: timeNow()
                    };

                    //add to lookup for associations
                    genres_dict.byToken[token] = new_item;

                    batch_insert.push(new_item);
                } else if(genre.updated > existing.updated) {
                    let update_obj = {
                        id: existing.id,
                        name: genre.name,
                        is_active: genre.is_active,
                        is_featured: genre.is_featured,
                        updated: timeNow(),
                        deleted: genre.deleted ? timeNow() : null
                    };

                    batch_update.push(update_obj);
                }
            }

            // process main table
            if(batch_insert.length) {
                await dbService.batchInsert(main_table, batch_insert, true);
            }

            if(batch_update.length) {
                await dbService.batchUpdate(main_table, batch_update);
            }

            // Update parent relationships
            for(let [token, genre] of Object.entries(items.genres)) {
                if(genre.parent_token) {
                    let current = await conn(main_table)
                        .where('token', token)
                        .first();

                    let parent = await conn(main_table)
                        .where('token', genre.parent_token)
                        .first();

                    if(current && parent && current.parent_id !== parent.id) {
                        await conn(main_table)
                            .where('id', current.id)
                            .update({
                                parent_id: parent.id,
                                updated: timeNow()
                            });
                    }
                }
            }

            // Process country associations
            if(items.countries) {
                for(let [country_code, genres] of Object.entries(items.countries)) {
                    let country = countries_dict.byToken[country_code];

                    if(!country) {
                        console.warn(`Country not found: ${country_code}`);
                        continue;
                    }

                    for(let [genre_token, data] of Object.entries(genres)) {
                        let genre = genres_dict.byToken[genre_token];

                        if(!genre) {
                            console.warn(`Genre not found: ${genre}`);
                            continue;
                        }

                        //check if already in db
                        let existing_row = country_genres_dict[country_code]?.[genre_token];

                        delete data.token;

                        if(existing_row) {
                            if(data.updated > existing_row.updated) {
                                data.id = existing_row.id;
                                data.deleted = data.deleted ? timeNow() : null;
                                batch_update_countries.push(data);
                            }
                        } else {
                            batch_insert_countries.push({
                                country_id: country.id,
                                genre_id: genre.id,
                                position: data.position,
                                created: timeNow(),
                                updated: timeNow(),
                            });
                        }
                    }
                }
            }

            if(batch_insert_countries.length) {
                await dbService.batchInsert(countries_table, batch_insert_countries);
            }

            if(batch_update_countries.length) {
                await dbService.batchUpdate(countries_table, batch_update_countries);
            }

            console.log({
                genres: {
                    added: batch_insert.length,
                    updated: batch_update.length
                },
                genresByCountry: {
                    added: batch_insert_countries.length,
                    updated: batch_update_countries.length
                }
            });
        } catch(e) {
            console.error(e);
            return reject(e);
        }

        resolve();
    });
}

async function main() {
    return new Promise(async (resolve, reject) => {
        try {
            await cacheService.init();

            await syncGenres();

            console.log('Genres sync completed');

            // await require('../index/index_music').main();
        } catch(e) {
            console.error(e);
            return reject(e);
        }

        resolve();
    });
}

module.exports = {
    main: main
};

if (require.main === module) {
    (async function () {
        try {
            await main();
            process.exit();
        } catch (e) {
            console.error(e);
        }
    })();
}