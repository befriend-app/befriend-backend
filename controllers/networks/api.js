const networksPersonsService = require('../../services/networks/persons');


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
            let activity = req.body.activity;
            let persons = req.body.persons;

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
        });
    }
};
