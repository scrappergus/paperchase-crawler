'use strict';

const cheerio = require('cheerio');
const request = require('request');

module.exports = (url) => new Promise((resolve, reject) => {
    request.get(url, (err, res, body) => {
        err ? reject(err) : resolve(cheerio.load(body));
    });
});
