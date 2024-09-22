const axios = require('axios');
const tldts = require('tldts');

const cacheService = require('../services/cache');
const dbService = require('../services/db');
const networkService = require('../services/network');
const bcrypt = require("bcryptjs");

const {timeNow, generateToken} = require("../services/shared");

module.exports = {
    createActivity: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                //login token, person token, activity object
                let person_token = req.body.person_token;
                let activity = req.body.activity;

                // unique across systems
                let activity_token = generateToken();

                let conn = await dbService.conn();

                // get person id from person token
                let person_obj = await conn('persons')
                            .where('person_token', person_token)
                            .first();

                if(!person_obj) {
                    res.json({message: "person token not found"}, 400)
                    return resolve();
                }
                
                let person_id = person_obj.id;

                //todo
                //add logic to prevent person from creating activities with overlapping times

                let id = await conn('activities')
                        .insert({
                            activity_token: activity_token,
                            activity_type_id: activity.activity_type_id,
                            person_id: person_id,
                            location_lat: activity.location_lat,
                            location_lon: activity.location_lon,
                            location_name: activity.location_name,
                            activity_start: activity.activity_start,
                            activity_duration_min: activity.activity_duration_min,
                            no_end_time: activity.no_end_time,
                            number_persons: activity.number_persons,
                            is_public: activity.is_public,
                            is_new_friends: activity.is_new_friends,
                            is_existing_friends: activity.is_existing_friends,
                            custom_filters: activity.custom_filters,
                            created: timeNow(),
                            updated: timeNow()
                        });
                
                id = id[0];

                //todo
                //algorithm/logic to select persons to send this activity to

                res.json({"created activity id": id}, 201)
                resolve(id);
            } catch(e) {
                reject(e);
            }
        });
    }
}