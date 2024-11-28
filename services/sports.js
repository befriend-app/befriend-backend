const cacheService = require('./cache');
const { normalizeSearch, timeNow } = require('./shared');
const { getCitiesByCountry } = require('./locations');
let sectionsData = require('./sections_data');
const { hGetAllObj } = require('./cache');

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

function sportsAutoComplete(search_term, context = null, country_code = null) {
    return new Promise(async (resolve, reject) => {
        try {
            search_term = normalizeSearch(search_term);

            if (search_term.length < 2) {
                return resolve([]);
            }

            let allSports = await hGetAllObj(cacheService.keys.sports);

            country_code = country_code || sectionsData.sports.categories.defaultCountry;

            // Get teams prefix matches
            const teamPrefix = search_term.substring(0, MAX_PREFIX_LIMIT);
            const teamPrefixTokens = await cacheService.getSetMembers(
                cacheService.keys.sports_teams_prefix(teamPrefix)
            );

            if (!teamPrefixTokens?.length) {
                return resolve([]);
            }

            // Get top leagues for country to identify priority teams
            const topLeagues = await cacheService.getObj(
                cacheService.keys.sports_country_top_leagues(country_code)
            ) || [];

            // Fetch team data and league associations
            const pipeline = cacheService.startPipeline();

            // Get team data
            for(let token of teamPrefixTokens) {
                pipeline.hGet(cacheService.keys.sports_teams, token);
            }

            const teamsData = await pipeline.execAsPipeline();

            let teams = teamsData
                .map(t => t ? JSON.parse(t) : null)
                .filter(t => t && t.name.toLowerCase().includes(search_term));

            // Teams with league and country data
            teams = teams.map((team, index) => {
                const topLeagueIndex = Object.keys(team.leagues || {})
                    .findIndex(league_token => topLeagues.includes(league_token));

                return {
                    ...team,
                    type: 'team',
                    isCountryTeam: team.country?.code === country_code,
                    isInTopLeague: topLeagueIndex !== -1,
                    topLeaguePosition: topLeagueIndex,
                    isContextSport: context?.token === team.sport_token
                };
            });

            const sortTeams = (a, b) => {
                // First by top league position if both are in top leagues
                if (a.isInTopLeague && b.isInTopLeague) {
                    return a.topLeaguePosition - b.topLeaguePosition;
                }
                // Then by whether they're in a top league at all
                if (a.isInTopLeague !== b.isInTopLeague) {
                    return a.isInTopLeague ? -1 : 1;
                }
                // Then alphabetically
                return a.name.localeCompare(b.name);
            };

            let sortedTeams = [
                // Context sport teams
                ...teams.filter(t => t.isContextSport && t.isCountryTeam).sort(sortTeams),
                ...teams.filter(t => t.isContextSport && !t.isCountryTeam).sort(sortTeams),
                // Non-context sport teams
                ...teams.filter(t => !t.isContextSport && t.isCountryTeam).sort(sortTeams),
                ...teams.filter(t => !t.isContextSport && !t.isCountryTeam).sort(sortTeams)
            ];

            sortedTeams.map(item => {
                item.meta = item.country?.name || '';
                item.label = allSports?.[item.sport_token]?.name || '';
            });

            resolve(sortedTeams.slice(0, RESULTS_LIMIT));
        } catch (e) {
            console.error('Error in sportsAutoComplete:', e);
            reject(e);
        }
    });
}

module.exports = {
    prefixLimit: MAX_PREFIX_LIMIT,
    topTeamsCount: TOP_TEAMS_COUNT,
    getTopTeamsBySport,
    sportsAutoComplete,
};