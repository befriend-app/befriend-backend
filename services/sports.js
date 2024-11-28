const cacheService = require('./cache');
const { normalizeSearch, timeNow } = require('./shared');
const { getCitiesByCountry } = require('./locations');
let sectionsData = require('./sections_data');

const MAX_PREFIX_LIMIT = 4;
const RESULTS_LIMIT = 50;
const TOP_TEAMS_COUNT = 100;

// Scoring weights for search results
const WEIGHTS = {
    COUNTRY_MATCH: 0.4,
    POPULARITY: 0.3,
    NAME_MATCH: 0.3
};

function getTopTeamsBySport(sport_token, country_code) {
    return new Promise(async (resolve, reject) => {
        try {
            //todo cache results
            if(!country_code) {
                country_code = sectionsData.sports.categories.defaultCountry;
            }

            const cache_key = cacheService.keys.sports_country_top_teams(sport_token, country_code);
            const data = await cacheService.getObj(cache_key);

            if (!data) {
                return reject('No teams found');
            }

            // Get full team data for each token
            const pipeline = cacheService.startPipeline();
            for (const team_token of data) {
                pipeline.hGet(cacheService.keys.sports_teams, team_token);
            }

            const teams = await pipeline.execAsPipeline();
            let results = teams
                .map(team => team ? JSON.parse(team) : null)
                .filter(team => team !== null);

            results.sort((a, b) => {
                return a.name.localeCompare(b.name);
            });

            resolve(results);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function calculateRelevanceScore(result, searchTerm, userCountryCode) {
    const countryScore = result.country_code === userCountryCode ? 1 : 0;
    const popularityScore = result.popularity ? result.popularity / 1000 : 0;

    // Calculate name match score
    let nameScore = 0;
    const resultName = result.name.toLowerCase();
    const searchTermLower = searchTerm.toLowerCase();

    if (resultName === searchTermLower) {
        nameScore = 1;
    } else if (resultName.startsWith(searchTermLower)) {
        nameScore = 0.8;
    } else if (resultName.includes(searchTermLower)) {
        nameScore = 0.6;
    }

    return (countryScore * WEIGHTS.COUNTRY_MATCH) +
        (popularityScore * WEIGHTS.POPULARITY) +
        (nameScore * WEIGHTS.NAME_MATCH);
}

function teamsAutoComplete(search_term, sport_token, user_location) {
    return new Promise(async (resolve, reject) => {
        try {
            search_term = normalizeSearch(search_term);
            if (search_term.length < 2) {
                return resolve([]);
            }

            const prefix = search_term.substring(0, MAX_PREFIX_LIMIT);
            const prefix_key = cacheService.keys.teams_prefix(prefix);

            // Get matching team tokens
            const team_tokens = await cacheService.getSetMembers(prefix_key);
            if (!team_tokens?.length) {
                return resolve([]);
            }

            // Get full team data
            const pipeline = cacheService.startPipeline();
            for (const token of team_tokens) {
                pipeline.hGet(cacheService.keys.teams, token);
            }

            let teams = await cacheService.execMulti(pipeline);
            teams = teams
                .map(team => {
                    try {
                        return JSON.parse(team);
                    } catch (e) {
                        return null;
                    }
                })
                .filter(team => team !== null);

            // Filter by sport if specified
            if (sport_token) {
                teams = teams.filter(team => team.sport_token === sport_token);
            }

            // Further filter if search term is longer than prefix
            if (search_term.length > MAX_PREFIX_LIMIT) {
                teams = teams.filter(team =>
                    team.name.toLowerCase().includes(search_term) ||
                    (team.short_name && team.short_name.toLowerCase().includes(search_term))
                );
            }

            // Score and sort results
            teams = teams
                .map(team => ({
                    ...team,
                    relevance: calculateRelevanceScore(
                        team,
                        search_term,
                        user_location?.country_code
                    )
                }))
                .sort((a, b) => b.relevance - a.relevance)
                .slice(0, RESULTS_LIMIT);

            // Add city data if available
            const citiesNeeded = teams
                .filter(team => team.city)
                .reduce((acc, team) => {
                    if (team.country_code) {
                        if (!acc[team.country_code]) {
                            acc[team.country_code] = new Set();
                        }
                        acc[team.country_code].add(team.city);
                    }
                    return acc;
                }, {});

            for (const [countryCode, cities] of Object.entries(citiesNeeded)) {
                const cityData = await getCitiesByCountry(
                    countryCode,
                    Array.from(cities)
                );

                teams = teams.map(team => {
                    if (team.country_code === countryCode && team.city) {
                        const city = cityData.find(c => c.name === team.city);
                        if (city) {
                            team.city_data = {
                                name: city.name,
                                lat: city.lat,
                                lon: city.lon
                            };
                        }
                    }
                    return team;
                });
            }

            resolve(teams);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function leaguesAutoComplete(search_term, sport_token) {
    return new Promise(async (resolve, reject) => {
        try {
            search_term = normalizeSearch(search_term);
            if (search_term.length < 2) {
                return resolve([]);
            }

            const prefix = search_term.substring(0, MAX_PREFIX_LIMIT);
            const prefix_key = cacheService.keys.sports_leagues_prefix(prefix);

            // Get matching league tokens
            const league_tokens = await cacheService.getSetMembers(prefix_key);
            if (!league_tokens?.length) {
                return resolve([]);
            }

            // Get full league data
            const pipeline = cacheService.startPipeline();
            for (const token of league_tokens) {
                pipeline.hGet(cacheService.keys.sports_leagues, token);
            }

            let leagues = await cacheService.execMulti(pipeline);
            leagues = leagues
                .map(league => {
                    try {
                        return JSON.parse(league);
                    } catch (e) {
                        return null;
                    }
                })
                .filter(league => league !== null);

            // Filter by sport if specified
            if (sport_token) {
                leagues = leagues.filter(league => league.sport_token === sport_token);
            }

            // Further filter if search term is longer than prefix
            if (search_term.length > MAX_PREFIX_LIMIT) {
                leagues = leagues.filter(league =>
                    league.name.toLowerCase().includes(search_term) ||
                    (league.short_name && league.short_name.toLowerCase().includes(search_term))
                );
            }

            // Sort by popularity
            leagues.sort((a, b) => b.popularity - a.popularity);
            leagues = leagues.slice(0, RESULTS_LIMIT);

            resolve(leagues);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

module.exports = {
    prefixLimit: MAX_PREFIX_LIMIT,
    topTeamsCount: TOP_TEAMS_COUNT,
    getTopTeamsBySport,
    teamsAutoComplete,
    leaguesAutoComplete
};