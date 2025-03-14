const express = require('express');
const logger = require('morgan');

const {
    loadScriptEnv,
} = require('../services/shared');

loadScriptEnv();

const router = express.Router();

const server = express();
const port = require('../servers/ports').matching;

server.use(logger('dev'));
server.use('/', router);
server.use(express.json());


router.get('/matches', async (req, res) => {
    try {

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
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

function getPort() {
    return port;
}

module.exports = {
    router,
    getPort,
    main,
};

if (require.main === module) {
    main();
}
