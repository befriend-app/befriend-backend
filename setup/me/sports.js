const axios = require('axios');
const { loadScriptEnv, timeNow, dataEndpoint } = require('../../services/shared');
const dbService = require('../../services/db');
const cacheService = require('../../services/cache');
const { keys: systemKeys } = require('../../services/system');

loadScriptEnv();

function syncSports() {
    console.log('Sync sports');

    const main_table = 'sports';
    let added = 0;
    let updated = 0;
    let batch_insert = [];
    let batch_update = [];

    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            // Sports lookup
            let sports_dict = {};
            let sports = await conn(main_table);

            for (let sport of sports) {
                sports_dict[sport.token] = sport;
            }

            let endpoint = dataEndpoint(`/sports`);
            let r = await axios.get(endpoint);

            for (let item of r.data.items) {
                let existing = sports_dict[item.token];

                if (!existing) {
                    if (item.deleted) {
                        continue;
                    }

                    let new_item = {
                        token: item.token,
                        name: item.name,
                        is_play: item.is_play,
                        has_teams: item.has_teams,
                        is_active: item.is_active,
                        created: timeNow(),
                        updated: timeNow()
                    };

                    batch_insert.push(new_item);
                    added++;
                } else if (item.updated > existing.updated) {
                    let update_obj = {
                        id: existing.id,
                        name: item.name,
                        is_play: item.is_play,
                        has_teams: item.has_teams,
                        is_active: item.is_active,
                        updated: timeNow(),
                        deleted: item.deleted ? timeNow() : null
                    };

                    batch_update.push(update_obj);
                    updated++;
                }
            }

            if (batch_insert.length) {
                await dbService.batchInsert(main_table, batch_insert);
            }

            if (batch_update.length) {
                await dbService.batchUpdate(main_table, batch_update);
            }

            console.log({ added, updated });
            resolve();
        } catch (e) {
            console.error('Error syncing sports:', e);
            reject(e);
        }
    });
}

function syncSportsCountries() {
    console.log('Sync sports-countries');

    const main_table = 'sports_countries';
    let added = 0;
    let updated = 0;
    let batch_insert = [];
    let batch_update = [];

    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            // Get lookup data
            const [sports, countries] = await Promise.all([
                conn('sports').select('id', 'token'),
                conn('open_countries').select('id', 'country_code')
            ]);

            let sports_dict = sports.reduce((acc, s) => {
                acc[s.token] = s;
                return acc;
            }, {});

            let countries_dict = countries.reduce((acc, c) => {
                acc[c.country_code] = c;
                return acc;
            }, {});

            // Get existing associations
            let existing = await conn(main_table);
            let assoc_dict = {};

            for (let assoc of existing) {
                if (!assoc_dict[assoc.country_id]) {
                    assoc_dict[assoc.country_id] = {};
                }
                assoc_dict[assoc.country_id][assoc.sport_id] = assoc;
            }

            let endpoint = dataEndpoint(`/sports/countries`);
            let r = await axios.get(endpoint);

            for (let [country_code, country_sports] of Object.entries(r.data.items)) {
                const country = countries_dict[country_code];
                if (!country) continue;

                for (let [sport_token, data] of Object.entries(country_sports)) {
                    const sport = sports_dict[sport_token];
                    if (!sport) continue;

                    const existing_assoc = assoc_dict[country.id]?.[sport.id];

                    if (!existing_assoc) {
                        let new_item = {
                            country_id: country.id,
                            sport_id: sport.id,
                            position: data.position,
                            created: timeNow(),
                            updated: timeNow()
                        };

                        batch_insert.push(new_item);
                        added++;
                    } else if (data.updated > existing_assoc.updated) {
                        let update_obj = {
                            id: existing_assoc.id,
                            position: data.position,
                            updated: timeNow()
                        };

                        batch_update.push(update_obj);
                        updated++;
                    }
                }
            }

            if (batch_insert.length) {
                await dbService.batchInsert(main_table, batch_insert);
            }

            if (batch_update.length) {
                await dbService.batchUpdate(main_table, batch_update);
            }

            console.log({ added, updated });
            resolve();
        } catch (e) {
            console.error('Error syncing sports countries:', e);
            reject(e);
        }
    });
}

function syncLeagues() {
    console.log('Sync sports leagues');

    const main_table = 'sports_leagues';
    const countries_table = 'sports_leagues_countries';
    let added = {leagues: 0, countries: 0};
    let updated = {leagues: 0, countries: 0};
    let batch_insert = {leagues: [], countries: []};
    let batch_update = {leagues: [], countries: []};

    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            // Get lookup data
            const [sports, countries, existing_leagues, existing_countries] = await Promise.all([
                conn('sports').select('id', 'token'),
                conn('open_countries').select('id', 'country_code'),
                conn(main_table),
                conn(countries_table)
            ]);

            let sports_dict = sports.reduce((acc, s) => {
                acc[s.token] = s;
                return acc;
            }, {});

            let countries_dict = countries.reduce((acc, c) => {
                acc[c.country_code] = c;
                return acc;
            }, {});

            let leagues_dict = existing_leagues.reduce((acc, l) => {
                acc[l.token] = l;
                return acc;
            }, {});

            let countries_assoc_dict = existing_countries.reduce((acc, c) => {
                if (!acc[c.league_id]) acc[c.league_id] = {};
                acc[c.league_id][c.country_id] = c;
                return acc;
            }, {});

            let endpoint = dataEndpoint(`/sports/leagues`);
            let r = await axios.get(endpoint);
            let { leagues, countries: league_countries } = r.data.items;

            // Process leagues
            for (let [token, league] of Object.entries(leagues)) {
                const sport = sports_dict[league.sport_token];
                if (!sport) continue;

                const existing = leagues_dict[token];

                if (!existing) {
                    if (league.deleted) continue;

                    let new_item = {
                        token: token,
                        name: league.name,
                        short_name: league.short_name,
                        sport_id: sport.id,
                        external_id: league.external_id,
                        is_active: league.is_active,
                        position: league.position,
                        created: timeNow(),
                        updated: timeNow()
                    };

                    batch_insert.leagues.push(new_item);
                    added.leagues++;
                } else if (league.updated > existing.updated) {
                    let update_obj = {
                        id: existing.id,
                        name: league.name,
                        short_name: league.short_name,
                        is_active: league.is_active,
                        position: league.position,
                        updated: timeNow(),
                        deleted: league.deleted ? timeNow() : null
                    };

                    batch_update.leagues.push(update_obj);
                    updated.leagues++;
                }
            }

            // Process batches
            if (batch_insert.leagues.length) {
                await dbService.batchInsert(main_table, batch_insert.leagues, true);
            }

            if (batch_update.leagues.length) {
                await dbService.batchUpdate(main_table, batch_update.leagues);
            }

            for(let item of batch_insert.leagues) {
                if(!(leagues_dict[item.token])) {
                    leagues_dict[item.token] = item;
                }
            }
            // Process league countries
            for (let [country_code, country_leagues] of Object.entries(league_countries)) {
                const country = countries_dict[country_code];
                if (!country) continue;

                for (let [league_token, data] of Object.entries(country_leagues)) {
                    const league = leagues_dict[league_token];
                    if (!league) continue;

                    const existing = countries_assoc_dict[league.id]?.[country.id];

                    if (!existing) {
                        let new_item = {
                            league_id: league.id,
                            country_id: country.id,
                            position: data.position,
                            created: timeNow(),
                            updated: timeNow()
                        };

                        batch_insert.countries.push(new_item);
                        added.countries++;
                    } else if (data.updated > existing.updated) {
                        let update_obj = {
                            id: existing.id,
                            position: data.position,
                            updated: timeNow()
                        };

                        batch_update.countries.push(update_obj);
                        updated.countries++;
                    }
                }
            }

            if (batch_insert.countries.length) {
                await dbService.batchInsert(countries_table, batch_insert.countries);
            }

            if (batch_update.countries.length) {
                await dbService.batchUpdate(countries_table, batch_update.countries);
            }

            console.log({ added, updated });
            resolve();
        } catch (e) {
            console.error('Error syncing leagues:', e);
            reject(e);
        }
    });
}

function syncTeams() {
    console.log('Sync sports teams');

    const main_table = 'sports_teams';
    const leagues_table = 'sports_teams_leagues';
    let added = {teams: 0, leagues: 0};
    let updated = {teams: 0, leagues: 0};
    let batch_insert = {teams: [], leagues: []};
    let batch_update = {teams: [], leagues: []};

    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            // Get lookups
            const [sports, countries, leagues, existing_teams, existing_leagues] = await Promise.all([
                conn('sports').select('id', 'token'),
                conn('open_countries').select('id', 'country_code'),
                conn('sports_leagues').select('id', 'token'),
                conn(main_table),
                conn(leagues_table)
            ]);

            let lookups = {
                sports: sports.reduce((acc, s) => {
                    acc[s.token] = s;
                    return acc;
                }, {}),
                countries: countries.reduce((acc, c) => {
                    acc[c.country_code] = c;
                    return acc;
                }, {}),
                leagues: leagues.reduce((acc, l) => {
                    acc[l.token] = l;
                    return acc;
                }, {}),
                teams: existing_teams.reduce((acc, t) => {
                    acc[t.token] = t;
                    return acc;
                }, {}),
                leagues_assoc: existing_leagues.reduce((acc, l) => {
                    if (!acc[l.team_id]) acc[l.team_id] = {};
                    acc[l.team_id][l.league_id] = l;
                    return acc;
                }, {})
            };

            let endpoint = dataEndpoint(`/sports/teams`);
            let r = await axios.get(endpoint);

            // First pass: Process all teams
            for (let team of r.data.items) {
                const sport = lookups.sports[team.sport_token];
                const country = lookups.countries[team.country_code];
                if (!sport) continue;

                const existing = lookups.teams[team.token];

                if (!existing) {
                    if (team.deleted) continue;

                    let new_item = {
                        token: team.token,
                        name: team.name,
                        short_name: team.short_name,
                        sport_id: sport.id,
                        country_id: country?.id || null,
                        city: team.city,
                        external_id: team.external_id,
                        is_active: team.is_active,
                        popularity: team.popularity,
                        created: timeNow(),
                        updated: timeNow()
                    };

                    batch_insert.teams.push(new_item);
                    added.teams++;
                } else if (team.updated > existing.updated) {
                    let update_obj = {
                        id: existing.id,
                        name: team.name,
                        short_name: team.short_name,
                        country_id: country?.id || null,
                        city: team.city,
                        is_active: team.is_active,
                        popularity: team.popularity,
                        updated: timeNow(),
                        deleted: team.deleted ? timeNow() : null
                    };

                    batch_update.teams.push(update_obj);
                    updated.teams++;
                }
            }

            // Process team batches first
            if (batch_insert.teams.length) {
                await dbService.batchInsert(main_table, batch_insert.teams, true);
            }

            if (batch_update.teams.length) {
                await dbService.batchUpdate(main_table, batch_update.teams);
            }

            // Refresh teams lookup after inserts/updates
            let updated_teams = await conn(main_table);
            lookups.teams = updated_teams.reduce((acc, t) => {
                acc[t.token] = t;
                return acc;
            }, {});

            // Second pass: Process league associations
            for (let team of r.data.items) {
                if (!team.leagues) continue;

                const existing = lookups.teams[team.token];
                if (!existing || existing.deleted) continue;

                for (let [league_token, league_data] of Object.entries(team.leagues)) {
                    const league = lookups.leagues[league_token];
                    if (!league) continue;

                    const existing_league = lookups.leagues_assoc[existing.id]?.[league.id];

                    if (!existing_league) {
                        let new_item = {
                            team_id: existing.id,
                            league_id: league.id,
                            season: league_data.season,
                            is_active: league_data.is_active,
                            created: timeNow(),
                            updated: timeNow()
                        };

                        batch_insert.leagues.push(new_item);
                        added.leagues++;
                    } else if (league_data.updated > existing_league.updated) {
                        let update_obj = {
                            id: existing_league.id,
                            season: league_data.season,
                            is_active: league_data.is_active,
                            updated: timeNow()
                        };

                        batch_update.leagues.push(update_obj);
                        updated.leagues++;
                    }
                }
            }

            // Process league association batches
            if (batch_insert.leagues.length) {
                await dbService.batchInsert(leagues_table, batch_insert.leagues);
            }

            if (batch_update.leagues.length) {
                await dbService.batchUpdate(leagues_table, batch_update.leagues);
            }

            console.log({ added, updated });
            resolve();
        } catch (e) {
            console.error('Error syncing teams:', e);
            reject(e);
        }
    });
}

async function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Sync sports data');

            await cacheService.init();

            // Sync core sports data
            console.log('Syncing sports...');
            await syncSports();

            // Sync sports country associations
            console.log('Syncing sports countries...');
            await syncSportsCountries();

            // Sync leagues and their country associations
            console.log('Syncing leagues...');
            await syncLeagues();

            // Sync teams and their league associations
            console.log('Syncing teams...');
            await syncTeams();

            console.log('Sports sync completed');

            //index sports
            await require('../index/index_sports').main();
            resolve();
        } catch (e) {
            console.error('Error in main sync execution:', e);
            reject(e);
        }
    });
}

module.exports = {
    main,
    syncSports,
    syncSportsCountries,
    syncLeagues,
    syncTeams
};

if (require.main === module) {
    (async function () {
        try {
            await main();
            process.exit();
        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    })();
}