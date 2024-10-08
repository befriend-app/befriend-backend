const { loadScriptEnv, getCoordsBoundBox, range, timeNow, getMetersFromMilesOrKm } = require("../services/shared");
const axios = require("axios");
loadScriptEnv();

const dbService = require("../services/db");

// # step 1
// run mock/add_person or mock/add_bulk_persons

(async function () {
    function testQuery() {
        return new Promise(async (resolve, reject) => {
            try {
                items = await conn("persons")
                    .whereIn("location_lat_1000", lats)
                    // .whereBetween('location_lat', [box.minLat, box.maxLon])
                    .whereBetween("location_lon", [box.minLon, box.maxLon])
                    .whereRaw("(ST_Distance_Sphere(point(location_lon, location_lat), point(?,?))) <= ?", [
                        coords.lon,
                        coords.lat,
                        getMetersFromMilesOrKm(max_miles),
                    ]);

                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }

    let items;
    let max_miles = 20;
    let parallel_queries = 10;

    //random location
    let r = await axios.get(`https://randomuser.me/api`);

    let person = r.data.results[0];

    let coords = {
        lat: parseFloat(person.location.coordinates.latitude),
        lon: parseFloat(person.location.coordinates.longitude),
    };

    let box = getCoordsBoundBox(coords.lat, coords.lon, max_miles);

    // Fill out the range of possibilities.
    let lats = range(box.minLat1000, box.maxLat1000);

    console.log({
        coords,
        box,
    });

    let conn = await dbService.conn();

    let promises = [];

    for (let i = 0; i < parallel_queries; i++) {
        promises.push(testQuery());
    }

    let t1 = timeNow();

    try {
        await Promise.all(promises);
    } catch (e) {
        console.error(e);
    }

    console.log({
        items: items.length,
    });

    console.log({
        qry_time: timeNow() - t1,
    });
})();
