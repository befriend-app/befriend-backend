const {getRepoRoot, joinPaths, normalizePort} = require("../services/shared");

const cookieParser = require('cookie-parser');
const createError = require('http-errors');
const express = require('express');
const http = require("http");
const logger = require('morgan');
const sessionMid = require('../middleware/session');
const apiRouter = require('../routes/api');
const personsRouter = require('../routes/persons');
const syncRouter = require('../routes/sync');

const {timeNow} = require("./shared");

let httpServer;

let port = normalizePort(process.env.PORT || '3000');

let server = express();

// server.set('view engine', 'ejs');
server.set('trust proxy', true)

server.disable('x-powered-by');

server.use(function (req, res, next) {
    req.start_req_time = timeNow(true);
    next();
});

server.use(logger('dev'));

server.use(express.json({limit: '5mb'}));
server.use(express.urlencoded({limit: '5mb', extended: false}));

server.use(cookieParser());

server.use(sessionMid.handle);

server.use(express.static(joinPaths(getRepoRoot(), 'public')));

server.use('/', apiRouter);
server.use('/sync', syncRouter);
server.use('/persons', personsRouter);

server.use(function(req, res, next) {
    next(createError(404));
});

// error handler
server.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;

    // console.log(err.message);

    res.locals.error = req.app.get('env') === 'development' ? err : {};

    if(err.status === 404) {
        return res.redirect('/')
    }

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});


module.exports = {
    init: function () {
        return new Promise(async (resolve, reject) => {
            server.set('port', port);

            httpServer = http.createServer(server);

            httpServer.listen(port);
            
            httpServer.on('error', function (error) {
                if (error.syscall !== 'listen') {
                    throw error;
                }

                let bind = typeof port === 'string'
                    ? 'Pipe ' + port
                    : 'Port ' + port;

                // handle specific listen errors with friendly messages
                switch (error.code) {
                    case 'EACCES':
                        console.error(bind + ' requires elevated privileges');
                        process.exit(1);
                        break;
                    case 'EADDRINUSE':
                        console.error(bind + ' is already in use');
                        process.exit(1);
                        break;
                    default:
                        throw error;
                }
            });
            
            httpServer.on('listening', function () {
                let addr = httpServer.address();

                let bind = typeof addr === 'string'
                    ? 'pipe ' + addr
                    : 'port ' + addr.port;

                console.log('Listening on ' + bind);
            });

            resolve();
        });
    },
    app: server
};