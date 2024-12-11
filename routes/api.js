let express = require('express');
let router = express.Router();
let apiController = require('../controllers/api');
let filtersController = require('../controllers/filters');
let personsController = require('../controllers/persons');

router.use(require('../middleware/auth'));

router.get('/me', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.getMe(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.get('/filters', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.getFiltersOptions(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/active', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.putActive(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/importance', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.putImportance(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/send-receive', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.putSendReceive(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/availability', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.putAvailability(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/modes', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.putModes(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/reviews', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.putReviewRating(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/age', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.putAge(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/gender', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.putGender(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/distance', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.putDistance(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/activity-types', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.putActivityTypes(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/instruments', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.putInstruments(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/work', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.putWork(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/life-stages', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.handleFilterUpdate(req, res, 'life_stages');
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/relationship', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.handleFilterUpdate(req, res, 'relationship');
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/languages', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.handleFilterUpdate(req, res, 'languages');
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/politics', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.handleFilterUpdate(req, res, 'politics');
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/religion', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.handleFilterUpdate(req, res, 'religion');
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/drinking', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.handleFilterUpdate(req, res, 'drinking');
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/filters/smoking', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await filtersController.handleFilterUpdate(req, res, 'smoking');
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});


router.put('/me/mode', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.putMeMode(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/me/country', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.putCountry(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/me/mode/partner', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.putMePartner(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.post('/me/mode/kids', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.postMeKids(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/me/mode/kids', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.putMeKids(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.delete('/me/mode/kids', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.removeMeKids(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.post('/me/sections', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.addMeSection(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/me/sections/positions', async (req, res) => {
    try {
        await personsController.updateMeSectionPositions(req, res);
    } catch (e) {
        console.error(e);
        res.status(400).json({
            error: 'Error updating section selection',
        });
    }
});

router.put('/me/sections/selection', async (req, res) => {
    try {
        await personsController.selectMeSectionOptionItem(req, res);
    } catch (e) {
        console.error(e);
        res.status(400).json({
            error: 'Error updating section selection',
        });
    }
});

router.delete('/me/sections/:section_key', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.deleteMeSection(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.post('/me/sections/item', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.addMeSectionItem(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/me/sections/item', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.updateMeSectionItem(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.post('/activities', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.createActivity(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.post('/devices', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.addDevice(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.get('/music/top/artists/genre', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.getTopMusicArtistsByGenre(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.get('/sports/top/teams', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.getTopTeamsBySport(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.get('/movies/category/top', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.getTopMoviesByCategory(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.get('/tv/category/top', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.getTopShowsByCategory(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.get('/autocomplete/instruments', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.instrumentsAutoComplete(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.get('/autocomplete/music', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.musicAutoComplete(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.get('/autocomplete/movies', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.moviesAutoComplete(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.get('/autocomplete/schools', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.schoolsAutoComplete(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.get('/autocomplete/sports', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.sportsAutoComplete(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.get('/autocomplete/tv', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.TVAutoComplete(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.get('/autocomplete/work', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.workAutoComplete(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

module.exports = router;
