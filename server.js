#!/usr/bin/env node

require('dotenv').config();

let cacheService = require('./services/cache');
let networkService = require('./services/network');
let serverService = require('./services/server');

global.BE_TIMING = {};

(async function () {
    try {
        await cacheService.init();
    } catch (e) {
        console.error(e);
    }

    try {
        await serverService.init();
    } catch (e) {
        console.error(e);
    }

    try {
        await networkService.init();
    } catch (e) {
        console.error(e);
    }
})();
