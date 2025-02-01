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
};
