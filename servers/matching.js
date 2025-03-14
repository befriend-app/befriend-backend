const express = require('express');
const logger = require('morgan');
const matchingService = require('../services/matching');

const {
    loadScriptEnv,
} = require('../services/shared');

loadScriptEnv();

const router = express.Router();

const server = express();
const port = require('../servers/ports').matching;

server.use(logger('dev'));
server.use(express.json());
server.use('/', router);


router.put('/matches', async (req, res) => {
    try {
        let { person, params, custom_filters, initial_person_tokens } = req.body;

        let matches = await matchingService.getMatches(person, params, custom_filters, initial_person_tokens);

        res.json(matches);
    } catch (error) {
        console.error(error);

        res.status(400).json({ error });
    }
});

async function main() {
    try {
        server.listen(port, () => {
            console.log(`Matching server listening on port: ${port}`);
        });
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

module.exports = {
    router,
    main,
};

if (require.main === module) {
    main();
}
