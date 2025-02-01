const networksFiltersService = require('../../services/networks/filters');
const networksMeService = require('../../services/networks/me');
const networksPersonsService = require('../../services/networks/persons');

module.exports = {
    syncNetworksPersons: function(req, res) {
        return new Promise(async (resolve, reject) => {
            //received on befriend->home domain
            try {
                let response = await networksPersonsService.syncNetworksPersons(req.query);

                res.json(response, 202);
            } catch (e) {
                if (e.message) {
                    res.json(e.message, 400);
                } else {
                    res.json('Error syncing networks-persons', 400);
                }
            }

            resolve();
        });
    },
    syncPersons: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let response = await networksPersonsService.syncPersons(req.query);

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
                let response = await networksPersonsService.syncModes(req.query);

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
                let response = await networksMeService.syncMe(req.query);

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
                let response = await networksFiltersService.syncFilters(req.query);

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
