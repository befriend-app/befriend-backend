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
                if (e.message) {
                    res.json(e.message, 400);
                } else {
                    res.json('Error creating person', 400);
                }
            }

            resolve();
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
                let response = await networksNotificationsService.sendNotifications(from_network,person_from_token,  activity, persons);

                res.json(response, 201);
            } catch (e) {
                if (e.message) {
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
            let accepted_at = req.body.accepted_at;

            try {
                let response = await networksNotificationsService.acceptNotification(from_network, activity_token, person_token, accepted_at);

                res.json(response, 202);
            } catch (e) {
                if (e.message) {
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
                if (e.message) {
                    res.json(e.message, 400);
                } else {
                    res.json('Error creating person', 400);
                }
            }
        });
    }
};
