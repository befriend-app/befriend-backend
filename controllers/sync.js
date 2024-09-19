const {getNetworkSelf} = require("../services/network");
module.exports = {
    limit: 10000,
    syncPersons: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let from_network = req.from_network;

                let my_network = await getNetworkSelf();

                let data_since_timestamp = req.body.since;



            } catch(e) {
                res.json("Error syncing persons", 400);
            }

            resolve();
        });
    }
};