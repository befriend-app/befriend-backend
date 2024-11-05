const axios = require('axios');
const dbService = require('../../services/db');
const { generateToken, timeNow, loadScriptEnv } = require('../../services/shared');
const excludedNames = require('./excluded_school_names');

loadScriptEnv();

let exclude_school_types = ['driving_school'];

const COORDINATE_THRESHOLD = 0.01; // Roughly 1km
const DEFAULT_SCHOOL_TYPE = 'school';

// Education level mappings remain the same
const EDUCATION_LEVELS = {
    osm: {
        'primary school': 'middle_school',
        'middle school': 'middle_school',
        'middle_school': 'middle_school',
        'secondary': 'high_school',
        'high_school': 'high_school',
        'secondary_school': 'high_school',
        'college': 'college',
        'university': 'college'
    },
    wikidata: {
        'Q3914': 'school',
        'Q2385804': 'school',
        'Q23002054': 'school',
        'Q9842': 'middle_school',
        'Q149566': 'middle_school',
        'Q159334': 'high_school',
        'Q9826': 'high_school',
        'Q3918': 'college',
        'Q189004': 'college',
        'Q1244277': 'college',
        'Q15936437': 'college'
    }
};

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
const WIKIDATA_API = 'https://query.wikidata.org/sparql';

let countries_dict = {};

const usStates = {
    // "Illinois": "Q1204",

    "Alabama": "Q173",
    "Alaska": "Q797",
    "Arizona": "Q816",
    "Arkansas": "Q1612",
    "California": "Q99",
    "Colorado": "Q1261",
    "Connecticut": "Q779",
    "Delaware": "Q1393",
    "Florida": "Q812",
    "Georgia": "Q1428",
    "Hawaii": "Q782",
    "Idaho": "Q1221",
    "Illinois": "Q1204",
    "Indiana": "Q1415",
    "Iowa": "Q1546",
    "Kansas": "Q1558",
    "Kentucky": "Q1603",
    "Louisiana": "Q1588",
    "Maine": "Q724",
    "Maryland": "Q1391",
    "Massachusetts": "Q771",
    "Michigan": "Q1166",
    "Minnesota": "Q1527",
    "Mississippi": "Q1494",
    "Missouri": "Q1581",
    "Montana": "Q1212",
    "Nebraska": "Q1553",
    "Nevada": "Q1227",
    "New Hampshire": "Q759",
    "New Jersey": "Q1408",
    "New Mexico": "Q1522",
    "New York": "Q1384",
    "North Carolina": "Q1454",
    "North Dakota": "Q1207",
    "Ohio": "Q1397",
    "Oklahoma": "Q1649",
    "Oregon": "Q824",
    "Pennsylvania": "Q1400",
    "Rhode Island": "Q1387",
    "South Carolina": "Q1456",
    "South Dakota": "Q1211",
    "Tennessee": "Q1509",
    "Texas": "Q1439",
    "Utah": "Q829",
    "Vermont": "Q16551",
    "Virginia": "Q1370",
    "Washington": "Q1223",
    "West Virginia": "Q1371",
    "Wisconsin": "Q1537",
    "Wyoming": "Q1214"
};

async function fetchUSOsm() {
    let allElements = [];

    for (let state in usStates) {
        console.log(`Fetching data for ${state}`);

        const query = `
            [out:json][timeout:300];
            area["name"="${state}"]["admin_level"="4"]->.searchArea;
            (
                // Educational institutions
            way["amenity"~"school|college|university"](area.searchArea);
            node["amenity"~"school|college|university"](area.searchArea);
            
            // Additional university-related tags
            way["building"="university"](area.searchArea);
            node["building"="university"](area.searchArea);
            
            // Campus buildings and grounds
            way["landuse"="education"](area.searchArea);
            way["landuse"="university"](area.searchArea);
            
            // General education tags
            way["education"](area.searchArea);
            node["education"](area.searchArea);
            
            way["amenity"="school"](area.searchArea);
            way["amenity"="college"](area.searchArea);
            node["amenity"="school"](area.searchArea);
            node["amenity"="college"](area.searchArea);
            );
            out center body;
            >;
            out skel qt;
        `;

        try {
            const response = await axios.post(OVERPASS_API, query, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 120000
            });

            if (response.data && response.data.elements) {
                const elements = response.data.elements;
                allElements = allElements.concat(elements);
                console.log(`Found ${elements.length} elements in ${state}`);

                // Add a delay between requests
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error(`Error fetching data for ${state}:`, error.message);
        }
    }

    return parseOverpassData({ elements: allElements });
}

async function fetchFromOverpass(countryName) {
    console.log(`${countryName}: OSM`);

    if (countryName === "United States") {
        return await fetchUSOsm();
    }

    const query = `
        [out:json][timeout:300];
        area["name:en"="${countryName}"][admin_level=2]->.searchArea;
        (
            way["amenity"~"school|college|university"](area.searchArea);
            node["amenity"~"school|college|university"](area.searchArea);
            way["building"~"school|university|college"](area.searchArea);
        );
        out center body;
        >;
        out skel qt;
        `;

    try {
        const response = await axios.post(OVERPASS_API, query, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        return parseOverpassData(response.data);
    } catch (error) {
        console.error('Error fetching from Overpass API:', error.message);
        return [];
    }
}

async function fetchUSWiki() {
    // Expanded query to ensure we get educational institutions and their parts
    let allResults = [];

    for(let state in usStates) {
        let code = usStates[state];

        const query = `
        SELECT DISTINCT ?school ?schoolLabel ?type ?typeLabel ?coordinates WHERE {
            ?school wdt:P31/wdt:P279* ?type ;
                    wdt:P131*/wdt:P131 wd:${code} . 
            
            VALUES ?type { 
                wd:Q3914     # school
                wd:Q2385804  # school
                wd:Q23002054 # private non-profit school

                wd:Q9842     # ms
                wd:Q149566   # ms
                
                wd:Q9826     # hs
                wd:Q159334   # secondary school/hs
                
                wd:Q3918     # university
                wd:Q189004   # college
                wd:Q1244277  # higher education institution
                wd:Q15936437 # university campus
            }
            
            OPTIONAL { ?school wdt:P625 ?coordinates }
            SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
        }
    `;

        try {
            const response = await axios.get(WIKIDATA_API, {
                params: {
                    query,
                    format: 'json'
                },
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'SchoolDataFetcher/1.0 (educational research)'
                }
            });

            let results = parseWikidataResponse(response.data);

            console.log({
                wiki_count: results.length,
                state: state
            });

            allResults = allResults.concat(results);
        } catch (error) {
            console.error('Error fetching from Wikidata:', error.message);
            return [];
        }
    }

    return allResults;
}


async function fetchFromWikidata(countryName, offset = 0, accumulated = []) {
    if (countryName === "United States") {
        return await fetchUSWiki();
    }

    console.log(`${countryName}: Wiki (offset: ${offset})`);

    const countryId = countries_dict[countryName]?.wiki_code;
    const BATCH_SIZE = 3000;
    const DETAILS_BATCH_SIZE = 200;

    if (!countryId) {
        console.error(`Missing Wikidata country code for ${countryName}`);
        return [];
    }

    // Simpler base query without coordinates and location info
    const baseQuery = `
        SELECT DISTINCT ?school ?schoolLabel ?type ?typeLabel WHERE {
            ?school wdt:P31 ?type ;
                    wdt:P17 wd:${countryId} .
            
            VALUES ?type { 
                # wd:Q3914 wd:Q2385804 wd:Q23002054 
                # wd:Q9842 wd:Q149566 
                # wd:Q9826 wd:Q159334 
                # wd:Q3918 wd:Q189004 wd:Q1244277 wd:Q15936437
                
                wd:Q2385804    # Educational institution (most general)
                wd:Q3914       # University
                wd:Q9842       # Secondary school
                wd:Q159334     # School
            }
            
            SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
        }
        ORDER BY ?school
        LIMIT ${BATCH_SIZE}
        OFFSET ${offset}
    `;

    async function fetchSchoolDetails(schoolIds) {
        const batches = [];

        for (let i = 0; i < schoolIds.length; i += DETAILS_BATCH_SIZE) {
            const batch = schoolIds.slice(i, i + DETAILS_BATCH_SIZE);
            const valuesClause = batch
                .map(url => `wd:${url.split('/').pop()}`)
                .join(' ');

            const detailQuery = `
                SELECT ?school ?coordinates ?city ?cityLabel ?state ?stateLabel WHERE {
                    VALUES ?school { ${valuesClause} }
                    OPTIONAL { ?school wdt:P625 ?coordinates }
                    OPTIONAL { 
                        ?school wdt:P131 ?city .
                        ?city wdt:P31 wd:Q515 .
                    }
                    OPTIONAL {
                        ?school wdt:P131 ?state .
                        ?state wdt:P31 wd:Q7275 .
                    }
                    SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
                }
            `;

            try {
                const response = await axios.post(WIKIDATA_API,
                    new URLSearchParams({
                        query: detailQuery,
                        format: 'json'
                    }).toString(),
                    {
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'User-Agent': 'SchoolDataFetcher/1.0 (educational research)'
                        },
                        timeout: 120000
                    }
                );

                batches.push(response.data?.results?.bindings || []);
                console.log(`Processed batch ${i/DETAILS_BATCH_SIZE + 1}/${Math.ceil(schoolIds.length/DETAILS_BATCH_SIZE)}`);

                // Add small delay between batch requests
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`Error fetching details batch ${i/DETAILS_BATCH_SIZE + 1}:`, error.message);
                if (error.response?.data) {
                    console.error('Error details:', error.response.data);
                }
                batches.push([]);
            }
        }

        return batches.flat();
    }

    try {
        const baseResponse = await axios.post(WIKIDATA_API,
            new URLSearchParams({
                query: baseQuery,
                format: 'json'
            }).toString(),
            {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'SchoolDataFetcher/1.0 (educational research)'
                },
                timeout: 120000
            }
        );

        if (!baseResponse.data?.results?.bindings) {
            throw new Error('Invalid response structure');
        }

        const baseResults = baseResponse.data.results.bindings;

        const schoolIds = baseResults.map(result => result.school.value);

        const detailResults = await fetchSchoolDetails(schoolIds);
        console.log(`Fetched details`);

        const mergedResults = baseResults.map(baseResult => {
            const schoolId = baseResult.school.value;
            const details = detailResults.find(detail => detail.school?.value === schoolId) || {};

            return {
                ...baseResult,
                ...details
            };
        });

        const results = parseWikidataResponse({ results: { bindings: mergedResults } });
        const allResults = accumulated.concat(results);

        if (baseResults.length === BATCH_SIZE) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return fetchFromWikidata(countryName, offset + BATCH_SIZE, allResults);
        }

        console.log(`${countryName}: Total schools found: ${allResults.length}`);
        return allResults;
    } catch (error) {
        console.error(`Error fetching from Wikidata for ${countryName} (offset: ${offset}):`, error.message);
        if (error.response?.data) {
            console.error('Error details:', error.response.data);
        }
        return accumulated.length > 0 ? accumulated : [];
    }
}

// Parsing functions remain the same
function determineEducationLevel(data, source) {
    if (source === 'OpenStreetMap') {
        const schoolType = data.tags['school:type'] ||
            data.tags.amenity ||
            data.tags.education ||
            data.tags['education:level'] ||
            (data.tags.building === 'university' ? 'university' : null);
        return EDUCATION_LEVELS.osm[schoolType] || 'unknown';
    } else if (source === 'Wikidata') {
        const typeId = data.type?.value.split('/').pop();
        return EDUCATION_LEVELS.wikidata[typeId] || 'unknown';
    }
    return 'unknown';
}

function parseOverpassData(data) {
    return data.elements
        .filter(element => element.tags)
        .map(element => {
            const city = element.tags['addr:city'] ||
                element.tags.city ||
                element.tags['is_in:city'] ||
                null;

            const state = element.tags['addr:state'] ||
                element.tags.state ||
                element.tags['is_in:state'] ||
                element.tags['is_in:province'] ||
                element.tags.province ||
                null;

            // Handle coordinates based on element type
            let coordinates = null;

            if (element.type === 'node') {
                // For nodes, use direct lat/lon
                coordinates = {
                    lat: element.lat,
                    lon: element.lon
                };
            } else if (element.type === 'way') {
                // For ways, use center coordinates
                if (element.center) {
                    coordinates = {
                        lat: element.center.lat,
                        lon: element.center.lon
                    };
                }
            }

            return {
                name: element.tags.name || element.tags['name:en'] || 'Unknown',
                type: element.tags.amenity || element.tags.education || element.tags.building || 'Unknown',
                educationLevel: determineEducationLevel(element, 'OpenStreetMap'),
                source: 'OpenStreetMap',
                id: element.id,
                coordinates: coordinates,
                location: {
                    city: city,
                    state: state
                },
                tags: element.tags
            };
        });
}

function parseWikidataResponse(data) {
    return data.results.bindings.map(result => ({
        name: result.schoolLabel?.value || 'Unknown',
        type: result.typeLabel?.value || 'Unknown',
        educationLevel: determineEducationLevel(result, 'Wikidata'),
        source: 'Wikidata',
        id: result.school?.value,
        coordinates: parseWikidataCoordinates(result.coordinates?.value),
        location: {
            city: result.cityLabel?.value || null,
            state: result.stateLabel?.value || null
        }
    }));
}

function parseWikidataCoordinates(coordinatesString) {
    if (!coordinatesString) return undefined;
    const match = coordinatesString.match(/Point\(([^ ]+) ([^)]+)\)/);
    if (match) {
        return {
            lon: parseFloat(match[1]),
            lat: parseFloat(match[2])
        };
    }
    return undefined;
}

async function fetchSchoolsByCountry(countryName) {
    try {
        const [osmSchools, wikidataSchools] = await Promise.all([
            fetchFromOverpass(countryName),
            fetchFromWikidata(countryName)
        ]);

        console.log({
            wikiSchools: wikidataSchools.length,
            osmSchools: osmSchools.length
        });

        const allSchools = [...osmSchools, ...wikidataSchools];

        return {
            all: allSchools,
            osm: osmSchools,
            wiki: wikidataSchools,
        };
    } catch (error) {
        console.error('Error fetching schools:', error.message);
        throw error;
    }
}

function isSameLocation(school1, school2) {
    // If both schools have no location and no coordinates, consider them the same
    const hasNoLocation1 = !school1.coordinates && (!school1.location?.city && !school1.location?.state);
    const hasNoLocation2 = !school2.coordinates && (!school2.location?.city && !school2.location?.state);

    if (hasNoLocation1 && hasNoLocation2) {
        return true;
    }

    // If schools have coordinates, check if they're close together
    if (school1.coordinates && school2.coordinates) {
        const latDiff = Math.abs(school1.coordinates.lat - school2.coordinates.lat);
        const lonDiff = Math.abs(school1.coordinates.lon - school2.coordinates.lon);

        if (latDiff < COORDINATE_THRESHOLD && lonDiff < COORDINATE_THRESHOLD) {
            return true;
        }
    }

    // If schools have city information, check if they're in the same city
    if (school1.location?.city && school2.location?.city) {
        return school1.location.city.toLowerCase() === school2.location.city.toLowerCase();
    }

    return false;
}

function isValidSchoolName(name) {
    // Check if the name is just a Q-ID
    if (/^Q\d+$/.test(name)) {
        return false;
    }

    // Check if name is too short or just "Unknown"
    if (!name || name.length < 2 || name === 'Unknown') {
        return false;
    }

    if(name.toLowerCase() in excludedNames) {
        return false;
    }

    return true;
}

function processCountry(country) {
    return new Promise(async (resolve, reject) => {
        console.log(`Fetching schools`);

        let unique = {
            schools: {},
            types: {},
            el: {},
        };

        let schools_distinct = [];

        let schools;

        try {
            schools = await fetchSchoolsByCountry(country.country_name);
        } catch(e) {
            console.error(e);
            return reject();
        }

        for(let school of schools.all) {
            if(exclude_school_types.includes(school.type)) {
                continue;
            }

            if(!isValidSchoolName(school.name)) {
                continue;
            }

            if(!(school.type in unique.types)) {
                unique.types[school.type] = {
                    osm: 0,
                    wiki: 0
                }
            }

            if(!(school.educationLevel in unique.el)) {
                unique.el[school.educationLevel] = {
                    osm: 0,
                    wiki: 0
                }
            }

            if(school.source === 'Wikidata') {
                unique.types[school.type].wiki += 1;
                unique.el[school.educationLevel].wiki += 1;
            } else {
                unique.types[school.type].osm += 1;
                unique.el[school.educationLevel].osm += 1;
            }

            if(!(school.name in unique.schools)) {
                unique.schools[school.name] = [];
            }

            unique.schools[school.name].push(school);
        }

        for(let school_name in unique.schools) {
            let schoolList = unique.schools[school_name];

            if(schoolList.length === 1) {
                schools_distinct.push(schoolList[0]);
                continue;
            }

            const distinctLocations = [];

            for (const school of schoolList) {
                // Check if we already have a school at this location
                const existingLocation = distinctLocations.find(existing =>
                    isSameLocation(existing, school)
                );

                if (!existingLocation) {
                    // New distinct location
                    distinctLocations.push(school);
                } else {
                    // Merge information
                    if (school.type && school.type !== DEFAULT_SCHOOL_TYPE) {
                        existingLocation.type = school.type;
                    }
                    // Merge other relevant information
                    if (!existingLocation.coordinates && school.coordinates) {
                        existingLocation.coordinates = school.coordinates;
                    }
                    if (!existingLocation.location && school.location) {
                        existingLocation.location = school.location;
                    }
                    // Mark as merged entry
                    existingLocation.sources = existingLocation.sources || [existingLocation.source];
                    if (!existingLocation.sources.includes(school.source)) {
                        existingLocation.sources.push(school.source);
                    }
                }
            }

            for (const distinctSchool of distinctLocations) {
                schools_distinct.push(distinctSchool);
            }
        }

        //add to db
        let batch_insert = [];

        console.log({
            all: schools.all.length,
            distinct: schools_distinct.length
        });

        for(let school of schools_distinct) {
            //college
            if(school.type === 'university' || school.educationLevel === 'college') {
                school.is_college = true;
            }
            //hs
            else if(school.educationLevel === 'high_school') {
                school.is_high_school = true;
            }
            //middle
            else if(school.educationLevel === 'middle_school') {
                school.is_grade_school = true;
            }

            batch_insert.push({
                token: generateToken(10),
                name: school.name,
                city: school.location?.city ? school.location.city : null,
                state: school.location?.state ? school.location.state : null,
                country_id: country.id,
                lat: school.coordinates?.lat ? school.coordinates.lat : null,
                lon: school.coordinates?.lon ? school.coordinates.lon : null,
                is_grade_school: school.is_grade_school,
                is_high_school: school.is_high_school,
                is_college: school.is_college,
                created: timeNow(),
                updated: timeNow(),
            })
        }

        try {
             await dbService.batchInsert('schools', batch_insert);
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
}

function processSchools() {
    return new Promise(async (resolve, reject) => {
        let countries;

        try {
            let conn = await dbService.conn();

            // redo
            //indonesia, india
            let ids = [4370];

            countries = await conn('open_countries');

            if(typeof ids !== 'undefined' && ids.length) {
                await conn('schools')
                    .whereIn('country_id', ids)
                    .delete();

                countries = await conn('open_countries')
                    .whereIn('id', ids);
            } else {
                countries = await conn('open_countries')
            }

            for(let c of countries) {
                countries_dict[c.country_name] = c;
            }
        } catch(e) {
            console.error(e);
        }

        try {
            for(let country of countries) {
                console.log({
                    id: country.id,
                    name: country.country_name,
                });

                try {
                    await processCountry(country);
                } catch(e) {
                    console.error(e);
                }
            }
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
}

function main() {
    return new Promise(async (resolve, reject) => {
        try {
            await processSchools();
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
}

module.exports = {
    main
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