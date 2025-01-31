const filtersSyncService = require('../services/sync/filters');
const meSyncService = require('../services/sync/me');
const personsSyncService = require('../services/sync/persons');

module.exports = {
    syncNetworksPersons: function(req, res) {
        return new Promise(async (resolve, reject) => {
            //received on befriend->home domain
            try {
                let response = await personsSyncService.syncNetworksPersons(req.query);

                res.json(response, 202);
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
    createPerson: function(req, res) {
        return new Promise(async (resolve, reject) => {
            //received on befriend->home domain from network that registered person
            try {
                let response = await personsSyncService.createPerson(req.from_network, req.body);

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
    syncPersons: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let response = await personsSyncService.syncPersons(req.query);

                res.json(response, 202);
            } catch (e) {
                if (e.message) {
                    res.json(e.message, 400);
                } else {
                    res.json('Error syncing persons', 400);
                }
            }

            resolve();
        });
    },
    syncPersonsModes: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let response = await personsSyncService.syncModes(req.query);

                res.json(response, 202);
            } catch (e) {
                if (e.message) {
                    res.json(e.message, 400);
                } else {
                    res.json('Error syncing modes', 400);
                }
            }

            resolve();
        });
    },
    syncMe: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let response = await meSyncService.syncMe(req.query);

                res.json(response, 202);
            } catch (e) {
                if (e.message) {
                    res.json(e.message, 400);
                } else {
                    res.json('Error syncing me', 400);
                }
            }

            resolve();
        });
    },
    syncPersonsFilters: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let response = await filtersSyncService.syncFilters(req.query);

                res.json(response, 202);
            } catch (e) {
                if (e.message) {
                    res.json(e.message, 400);
                } else {
                    res.json('Error syncing filters', 400);
                }
            }

            resolve();
        });
    }
};
