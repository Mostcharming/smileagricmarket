'use strict';

const http = require('node:http');

const port = Number(process.env.FAKE_PAYSTACK_PORT || 5999);
const secretKey = process.env.PAYSTACK_SECRET_KEY || 'sk_test_endpoint';
const transactionId = process.env.PAYSTACK_TEST_TRANSACTION_ID
    || '18446744073709551610';
const transactions = new Map();

function sendJson(res, statusCode, body) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${secretKey}`) {
        return sendJson(res, 401, {
            status: false,
            message: 'Invalid key'
        });
    }

    if (req.method === 'POST' && req.url === '/transaction/initialize') {
        const body = await readBody(req);
        transactions.set(body.reference, body);

        return sendJson(res, 200, {
            status: true,
            message: 'Authorization URL created',
            data: {
                authorization_url: `https://checkout.paystack.test/${body.reference}`,
                access_code: `ACCESS_${body.reference}`,
                reference: body.reference
            }
        });
    }

    const verifyMatch = req.method === 'GET'
        ? req.url.match(/^\/transaction\/verify\/([^/?]+)$/)
        : null;
    if (verifyMatch) {
        const reference = decodeURIComponent(verifyMatch[1]);
        const transaction = transactions.get(reference);
        if (!transaction) {
            return sendJson(res, 404, {
                status: false,
                message: 'Transaction reference not found'
            });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
            `{"status":true,"message":"Verification successful","data":{`
            + `"id":${transactionId},`
            + '"domain":"test",'
            + '"status":"success",'
            + `"reference":${JSON.stringify(reference)},`
            + `"amount":${Number(transaction.amount)},`
            + `"currency":${JSON.stringify(transaction.currency)},`
            + `"paid_at":${JSON.stringify(new Date().toISOString())}`
            + '}}'
        );
    }

    return sendJson(res, 404, {
        status: false,
        message: 'Not found'
    });
});

server.listen(port, '127.0.0.1', () => {
    console.log(`Fake Paystack listening on http://127.0.0.1:${port}`);
});
