const networksMatchingService = require('../../services/networks/matching');
const networksPersonsService = require('../../services/networks/persons');
const networksNotificationsService = require('../../services/networks/notifications');


module.exports = {
    createPerson: function(req, res) {
        return new Promise(async (resolve, reject) => {
            //received on befriend->home domain from network that registered person
            try {
                let response = await networksPersonsService.createPerson(req.from_network, req.body);

                res.json(response, 201);
            } catch (e) {
                if (e?.message) {
                    res.json(e.message, 400);
                } else {
                    res.json('Error creating person', 400);
                }
            }

            resolve();
        });
    },
    activityMatchingExclude: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //received on my network from 3rd-party network->person that is creating activity
            //this enables us to filter by distance without sharing location cross-network

            try {
                let response = await networksMatchingService.excludeMatches(req.from_network, req.body.person, req.body.activity_location, req.body.person_tokens);

                res.json(response, 202);
            } catch (e) {
                if (e?.message) {
                    res.json(e.message, 400);
                } else {
                    res.json('Error filtering persons', 400);
                }
            }
        });
    },
    sendNotifications: function(req, res) {
        return new Promise(async (resolve, reject) => {
            //received on my network from 3rd-party network person
            let from_network = req.from_network;
            let person_from_token = req.body.person_from_token;
            let activity = req.body.activity;
            let persons = req.body.persons;

            try {
                let response = await networksNotificationsService.sendNotifications(from_network, person_from_token, activity, persons);

                res.json(response, 201);
            } catch (e) {
                if (e?.message) {
                    res.json(e.message, 400);
                } else {
                    res.json('Error creating person', 400);
                }
            }
        });
    },
    putNotificationSpots: function(req, res) {
        return new Promise(async (resolve, reject) => {
            let from_network = req.from_network;
            let activity_token = req.params.activity_token;
            let spots = req.body.spots;

            try {
                let response = await networksNotificationsService.onSpotsUpdate(from_network, activity_token, spots);

                res.json(response, 202);
            } catch (e) {
                if (e?.message) {
                    res.json(e.message, 400);
                } else {
                    res.json('Error creating person', 400);
                }
            }
        });
    },
    putAcceptNotification: function(req, res) {
        return new Promise(async (resolve, reject) => {
            let from_network = req.from_network;
            let activity_token = req.params.activity_token;
            let person_token = req.body.person_token;
            let access_token = req.body.access_token;
            let accepted_at = req.body.accepted_at;

            try {
                let response = await networksNotificationsService.acceptNotification(from_network, activity_token, person_token, access_token, accepted_at);

                res.json(response, 202);
            } catch (e) {
                if (e?.message) {
                    res.json(e.message, 400);
                } else {
                    res.json('Error creating person', 400);
                }
            }
        });
    },
    putDeclineNotification: function(req, res) {
        return new Promise(async (resolve, reject) => {
            let from_network = req.from_network;
            let activity_token = req.params.activity_token;
            let person_token = req.body.person_token;
            let declined_at = req.body.declined_at;

            try {
                let response = await networksNotificationsService.declineNotification(from_network, activity_token, person_token, declined_at);

                res.json(response, 202);
            } catch (e) {
                if (e?.message) {
                    res.json(e.message, 400);
                } else {
                    res.json('Error creating person', 400);
                }
            }
        });
    },
    putActivity: function(req, res) {
        return new Promise(async (resolve, reject) => {
            let from_network = req.from_network;
            let activity_token = req.params.activity_token;
            let data = req.body;

            try {
                let response = await networksNotificationsService.updateActivity(from_network, activity_token, data);

                res.json(response, 202);
            } catch (e) {
                if (e?.message) {
                    res.json(e.message, 400);
                } else {
                    res.json('Error updating activity', 400);
                }
            }
        });
    },

};
