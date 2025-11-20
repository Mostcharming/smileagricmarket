
function responseFormatter(req, res, next) {
    res.format = function ({ error = false, message = '', data = null, status = 200 } = {}) {
        const payload = {
            error: !!error,
            message: message || (error ? 'An error occurred' : 'Success'),
            data: data === undefined ? null : data
        };

        const statusCode = Number.isInteger(status) ? status : 200;
        res.status(statusCode).json(payload);
    };

    res.success = function (data = null, message = 'Success', status = 200) {
        return res.format({ error: false, message, data, status });
    };

    res.fail = function (message = 'Error', status = 400, data = null) {
        return res.format({ error: true, message, data, status });
    };

    next();
}

function errorHandler(err, req, res, next) {
    const status = err.statusCode || err.status || (err.status === 0 ? 0 : 500);
    const message = err.message || 'Internal Server Error';

    if (typeof res.format === 'function') {
        return res.format({ error: true, message, data: err.data || null, status });
    }

    res.status(status).json({ error: true, message, data: err.data || null });
}

module.exports = {
    responseFormatter,
    errorHandler
};
