let cookieParser = require('cookie-parser');
let createError = require('http-errors');
let express = require('express');
let expressLayouts = require('express-ejs-layouts');
const http = require("http");
let logger = require('morgan');
let sessionMid = require('../middleware/session');
let webRouter = require('../routes/web');

let httpServer;

let port = normalizePort(process.env.PORT || '3000');

let server = express();

server.set('views', joinPaths(getRepoRoot(), 'views'));
server.set('view engine', 'ejs');
server.set('trust proxy', true)

server.disable('x-powered-by');

server.use(function (req, res, next) {
    req.start_req_time = timeNow(true);
    next();
});

server.use(expressLayouts);

server.use(logger('dev'));

server.use(express.json({limit: '5mb'}));
server.use(express.urlencoded({limit: '5mb', extended: false}));

server.use(cookieParser());

server.use(sessionMid.handle);

server.use(express.static(joinPaths(getRepoRoot(), 'public')));

server.use('/', webRouter);

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