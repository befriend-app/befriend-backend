let express = require('express');
let router = express.Router();
let apiController = require('../controllers/api');
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

router.get('/autocomplete/instruments', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.autoCompleteInstruments(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.get('/autocomplete/music', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.autoCompleteMusic(req, res);
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


router.get('/autocomplete/movies', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.autoCompleteMovies(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.get('/movies/top/genre', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.getTopMoviesByGenre(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.get('/autocomplete/schools', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.autoCompleteSchools(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

module.exports = router;
