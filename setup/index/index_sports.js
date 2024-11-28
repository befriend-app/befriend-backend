const { loadScriptEnv } = require('../../services/shared');
const cacheService = require('../../services/cache');
const dbService = require('../../services/db');
const { prefixLimit, topTeamsCount } = require('../../services/sports');
const { getKeysWithPrefix, deleteKeys } = require('../../services/cache');

loadScriptEnv();

async function deletePreviousCustomKeys() {
    try {
        let keys = await getKeysWithPrefix('sports:');
        await deleteKeys(keys);
    } catch (e) {
        console.error(e);
    }
}

function indexSports() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            let pipeline = cacheService.startPipeline();

            // Get sports ordered by popularity
            const sports = await conn('sports')
                .whereNull('deleted')
                .orderBy('is_active', 'desc')
                .orderBy('name', 'asc')
                .select('id', 'token', 'name', 'is_play', 'has_teams', 'is_active');

            // Create sports lookup dictionary and store in Redis
            const sportsAll = {};
            for (const sport of sports) {
                sportsAll[sport.token] = JSON.stringify({
                    id: sport.id,
                    token: sport.token,
                    name: sport.name,
                    is_play: sport.is_play ? 1 : '',
                    has_teams: sport.has_teams ? 1 : '',
                    is_active: sport.is_active ? 1 : '',
                });
            }

            pipeline.hSet(cacheService.keys.sports, sportsAll);

            // Get sports by country ordering
            const sportsCountries = await conn('sports_countries AS sc')
                .join('sports AS s', 's.id', 'sc.sport_id')
                .join('open_countries AS oc', 'oc.id', 'sc.country_id')
                .whereNull('sc.deleted')
                .whereNull('s.deleted')
                .select('oc.country_code', 's.token', 'sc.position')
                .orderBy('sc.position');

            // Organize by country
            const countryOrdering = {};
            for (const sc of sportsCountries) {
                if (!countryOrdering[sc.country_code]) {
                    countryOrdering[sc.country_code] = {};
                }
                countryOrdering[sc.country_code][sc.token] = sc.position;
            }

            // Store country orderings
            for (const [countryCode, ordering] of Object.entries(countryOrdering)) {
                pipeline.hSet(cacheService.keys.sports_country_order(countryCode), ordering);
            }

            await pipeline.execAsPipeline();

            console.log({
                total_sports: Object.keys(sportsAll).length,
                countries: Object.keys(countryOrdering).length
            });
        } catch (e) {
            console.error('Error in indexSports:', e);
            return reject(e);
        }
        resolve();
    });
}

function indexLeagues() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            let pipeline = cacheService.startPipeline();

            // Get all active leagues with their sports and country associations
            const leagues = await conn('sports_leagues AS sl')
                .join('sports AS s', 's.id', 'sl.sport_id')
                .whereNull('sl.deleted')
                .orderBy('sl.position')
                .select(
                    'sl.id',
                    'sl.token',
                    'sl.name',
                    'sl.short_name',
                    's.token AS sport_token',
                    'sl.position',
                    'sl.is_active'
                );

            // Get country associations and positions
            const leagueCountries = await conn('sports_leagues_countries AS slc')
                .join('open_countries AS oc', 'oc.id', 'slc.country_id')
                .join('sports_leagues AS sl', 'sl.id', 'slc.league_id')
                .whereNull('slc.deleted')
                .whereNull('sl.deleted')
                .select(
                    'sl.token AS league_token',
                    'oc.country_code',
                    'oc.country_name',
                    'slc.position'
                )
                .orderBy('slc.position');

            // Create data structures
            const leaguesAll = {};
            const prefixGroups = {};
            const countryTopLeagues = {};

            // Group countries by league token
            const leagueCountriesMap = {};
            for (const assoc of leagueCountries) {
                if (!leagueCountriesMap[assoc.league_token]) {
                    leagueCountriesMap[assoc.league_token] = [];
                }
                leagueCountriesMap[assoc.league_token].push({
                    code: assoc.country_code,
                    name: assoc.country_name,
                    position: assoc.position
                });
            }

            // Process all leagues
            for (const league of leagues) {
                leaguesAll[league.token] = JSON.stringify({
                    id: league.id,
                    token: league.token,
                    name: league.name,
                    short_name: league.short_name || '',
                    sport_token: league.sport_token,
                    position: league.position,
                    is_active: league.is_active ? 1 : '',
                    countries: leagueCountriesMap[league.token] || []
                });

                // Index both full name and short name
                const names = [league.name.toLowerCase()];
                if (league.short_name) {
                    names.push(league.short_name.toLowerCase());
                }

                for (const name of names) {
                    const words = name.split(/\s+/);

                    // Process full name prefixes
                    for (let i = 1; i <= Math.min(name.length, prefixLimit); i++) {
                        const prefix = name.slice(0, i);
                        if (!prefixGroups[prefix]) {
                            prefixGroups[prefix] = new Set();
                        }
                        prefixGroups[prefix].add(league.token);
                    }

                    // Process word prefixes
                    for (const word of words) {
                        if (word.length < 2) continue;
                        for (let i = 1; i <= Math.min(word.length, prefixLimit); i++) {
                            const prefix = word.slice(0, i);
                            if (!prefixGroups[prefix]) {
                                prefixGroups[prefix] = new Set();
                            }
                            prefixGroups[prefix].add(league.token);
                        }
                    }
                }
            }

            // Process country-specific league rankings
            for (const assoc of leagueCountries) {
                const key = assoc.country_code;
                if (!countryTopLeagues[key]) {
                    countryTopLeagues[key] = [];
                }
                countryTopLeagues[key].push({
                    token: assoc.league_token,
                    position: assoc.position
                });
            }

            // Sort country leagues by position and store top leagues
            for (const [countryCode, leagues] of Object.entries(countryTopLeagues)) {
                // Sort by position
                leagues.sort((a, b) => a.position - b.position);

                // Store tokens of top leagues
                const topLeagueTokens = leagues.map(l => l.token);

                // Store in Redis
                pipeline.set(
                    cacheService.keys.sports_country_top_leagues(countryCode),
                    JSON.stringify(topLeagueTokens)
                );
            }

            // Store in Redis
            // 1. Store all leagues
            pipeline.hSet(cacheService.keys.sports_leagues, leaguesAll);

            // 2. Store prefix indexes
            for (const [prefix, tokens] of Object.entries(prefixGroups)) {
                pipeline.sAdd(cacheService.keys.sports_leagues_prefix(prefix), Array.from(tokens));
            }

            await pipeline.execAsPipeline();

            console.log({
                total_leagues: Object.keys(leaguesAll).length,
                prefixes: Object.keys(prefixGroups).length,
                countries_with_leagues: Object.keys(countryTopLeagues).length
            });

        } catch (e) {
            console.error('Error in indexLeagues:', e);
            return reject(e);
        }
        resolve();
    });
}

function indexTeams() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            let pipeline = cacheService.startPipeline();

            // Get teams data with league associations
            const teams = await conn('sports_teams AS st')
                .join('sports AS s', 's.id', 'st.sport_id')
                .leftJoin('open_countries AS oc', 'oc.id', 'st.country_id')
                .leftJoin('sports_teams_leagues AS stl', 'st.id', 'stl.team_id')
                .leftJoin('sports_leagues AS sl', 'stl.league_id', 'sl.id')
                .whereNull('st.deleted')
                .whereNull('stl.deleted')
                .orderBy('st.popularity', 'desc')
                .select(
                    'st.id',
                    'st.token',
                    'st.name',
                    'st.short_name',
                    's.token AS sport_token',
                    'oc.country_code',
                    'oc.country_name',
                    'st.city',
                    'st.popularity',
                    'st.is_active',
                    'sl.token AS league_token',
                    'sl.name AS league_name'
                );

            const teamsAll = {};
            const prefixGroups = {};
            const sportCountryTeams = {};

            // Group teams by ID to handle multiple league associations
            const teamsById = {};
            for (const team of teams) {
                if (!teamsById[team.id]) {
                    teamsById[team.id] = {
                        ...team,
                        leagues: {}
                    };
                }
                if (team.league_token) {
                    teamsById[team.id].leagues[team.league_token] = {
                        token: team.league_token,
                        name: team.league_name
                    }
                }
            }

            // Process grouped teams
            for (const team of Object.values(teamsById)) {
                teamsAll[team.token] = JSON.stringify({
                    id: team.id,
                    token: team.token,
                    name: team.name,
                    short_name: team.short_name || '',
                    sport_token: team.sport_token,
                    city: team.city || '',
                    popularity: team.popularity,
                    is_active: team.is_active ? 1 : '',
                    country: {
                        code: team.country_code || '',
                        name: team.country_name || '',
                    },
                    leagues: team.leagues
                });

                const key = `${team.sport_token}:${team.country_code}`;
                if (!sportCountryTeams[key]) {
                    sportCountryTeams[key] = [];
                }
                sportCountryTeams[key].push({
                    token: team.token,
                    popularity: team.popularity
                });

                // Index name prefixes
                const nameLower = team.name.toLowerCase();
                const words = nameLower.split(/\s+/);

                // Process full name prefixes
                for (let i = 1; i <= Math.min(nameLower.length, prefixLimit); i++) {
                    const prefix = nameLower.slice(0, i);
                    if (!prefixGroups[prefix]) {
                        prefixGroups[prefix] = new Set();
                    }
                    prefixGroups[prefix].add(team.token);
                }

                // Process word prefixes
                for (const word of words) {
                    if (word.length < 2) continue;
                    for (let i = 1; i <= Math.min(word.length, prefixLimit); i++) {
                        const prefix = word.slice(0, i);
                        if (!prefixGroups[prefix]) {
                            prefixGroups[prefix] = new Set();
                        }
                        prefixGroups[prefix].add(team.token);
                    }
                }
            }

            // Store in Redis
            pipeline.hSet(cacheService.keys.sports_teams, teamsAll);

            for (const [prefix, tokens] of Object.entries(prefixGroups)) {
                pipeline.sAdd(cacheService.keys.sports_teams_prefix(prefix), Array.from(tokens));
            }

            for (const [key, teams] of Object.entries(sportCountryTeams)) {
                const [sportToken, countryCode] = key.split(':');
                if (!countryCode) continue;

                const topTeams = teams
                    .sort((a, b) => b.popularity - a.popularity)
                    .slice(0, topTeamsCount)
                    .map(t => t.token);

                pipeline.set(
                    cacheService.keys.sports_country_top_teams(sportToken, countryCode),
                    JSON.stringify(topTeams)
                );
            }

            await pipeline.execAsPipeline();

            console.log({
                total_teams: Object.keys(teamsAll).length,
                prefixes: Object.keys(prefixGroups).length,
                sport_country_combinations: Object.keys(sportCountryTeams).length
            });

        } catch (e) {
            console.error('Error in indexTeams:', e);
            return reject(e);
        }
        resolve();
    });
}

module.exports = {
    main: async function () {
        return new Promise(async (resolve, reject) => {
            try {
                console.log('Indexing sports data');
                await cacheService.init();

                await deletePreviousCustomKeys();

                console.log('Indexing sports...');
                await indexSports();

                console.log('Indexing leagues...');
                await indexLeagues();

                console.log('Indexing teams...');
                await indexTeams();

                console.log('Sports indexing completed');
                resolve();
            } catch (e) {
                console.error('Error in main indexing execution:', e);
                reject(e);
            }
        });
    },
};

if (require.main === module) {
    (async function () {
        try {
            await module.exports.main();
            process.exit();
        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    })();
}