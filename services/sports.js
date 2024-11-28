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
            if (search_term.length < 2) return resolve([]);

            country_code = country_code || sectionsData.sports.categories.defaultCountry;
            const prefix = search_term.substring(0, MAX_PREFIX_LIMIT);
            const searchTermLower = search_term.toLowerCase();

            const pipeline = cacheService.startPipeline();
            pipeline.hGetAll(cacheService.keys.sports);
            pipeline.sMembers(cacheService.keys.sports_teams_prefix(prefix));
            pipeline.sMembers(cacheService.keys.sports_leagues_prefix(prefix));
            pipeline.get(cacheService.keys.sports_country_top_leagues(country_code));
            pipeline.hGetAll(cacheService.keys.sports_country_order(country_code));

            const [allSports, teamPrefixTokens, leaguePrefixTokens, rawTopLeagues, countryOrdering] =
                await pipeline.execAsPipeline();

            for(let k in allSports) {
                try {
                    allSports[k] = JSON.parse(allSports[k]);
                } catch(e) {}
            }

            if (!teamPrefixTokens?.length && !leaguePrefixTokens?.length) return resolve([]);

            const topLeagues = JSON.parse(rawTopLeagues || '[]');

            // Get leagues
            const leaguesPipeline = cacheService.startPipeline();
            for(let token of leaguePrefixTokens) {
                leaguesPipeline.hGet(cacheService.keys.sports_leagues, token);
            }

            const leaguesData = await leaguesPipeline.execAsPipeline();
            const leagues = leaguesData
                .map(l => l ? JSON.parse(l) : null)
                .filter(l => l && (
                    l.name.toLowerCase().includes(searchTermLower) ||
                    (l.short_name && l.short_name.toLowerCase().includes(searchTermLower))
                ))
                .map(league => ({
                    ...league,
                    type: 'league',
                    isContextSport: context?.token === league.sport_token
                }));

            // Get teams
            const teamsPipeline = cacheService.startPipeline();
            for(let token of teamPrefixTokens) {
                teamsPipeline.hGet(cacheService.keys.sports_teams, token);
            }

            const teamsData = await teamsPipeline.execAsPipeline();
            let teams = teamsData
                .map(t => t ? JSON.parse(t) : null)
                .filter(t => t && t.name.toLowerCase().includes(searchTermLower))
                .map(team => ({
                    ...team,
                    type: 'team',
                    isCountryTeam: team.country?.code === country_code,
                    isInTopLeague: Object.keys(team.leagues || {}).some(lt => topLeagues.includes(lt)),
                    topLeaguePosition: Object.keys(team.leagues || {}).findIndex(lt => topLeagues.includes(lt)),
                    isContextSport: context?.token === team.sport_token,
                    sportPosition: countryOrdering?.[team.sport_token] ? parseInt(countryOrdering?.[team.sport_token]) : 999999
                }));

            let sortedTeams = [
                ...teams.filter(t => t.isContextSport && t.isCountryTeam).sort(sortByPriority),
                ...teams.filter(t => t.isContextSport && !t.isCountryTeam).sort(sortByPriority),
                ...teams.filter(t => !t.isContextSport && t.isCountryTeam).sort(sortByPriority),
                ...teams.filter(t => !t.isContextSport && !t.isCountryTeam).sort(sortByPriority)
            ];

            sortedTeams.map(item => {
                item.table_key = 'teams';
                item.meta = item.country?.name || '';
                item.label = allSports?.[item.sport_token]?.name || '';
            })

            let sortedLeagues = leagues
                .sort((a, b) => {
                    if (a.isContextSport !== b.isContextSport) {
                        return a.isContextSport ? -1 : 1;
                    }
                    return a.name.localeCompare(b.name);
                });

            sortedLeagues.map(item => {
                const primaryCountry = item.countries?.[0];

                item.table_key = 'leagues';
                item.meta = primaryCountry ? `League: ${primaryCountry.name}` : 'League';
                item.label = allSports?.[item.sport_token]?.name || '';
            })

            const results = [...sortedTeams, ...sortedLeagues].slice(0, RESULTS_LIMIT);
            resolve(results);
        } catch (e) {
            console.error('Error in sportsAutoComplete:', e);
            reject(e);
        }
    });
}

function sortByPriority(a, b) {
    if (a.isInTopLeague && b.isInTopLeague) {
        if (a.topLeaguePosition === b.topLeaguePosition) {
            return a.name.localeCompare(b.name);
        }
        return a.topLeaguePosition - b.topLeaguePosition;
    }
    if (a.isInTopLeague !== b.isInTopLeague) {
        return a.isInTopLeague ? -1 : 1;
    }
    if (a.sportPosition === b.sportPosition) {
        return a.name.localeCompare(b.name);
    }
    return a.sportPosition - b.sportPosition;
}

module.exports = {
    prefixLimit: MAX_PREFIX_LIMIT,
    topTeamsCount: TOP_TEAMS_COUNT,
    getTopTeamsBySport,
    sportsAutoComplete,
};