'use strict';

var cheerio = require('cheerio');
var Promise = require('bluebird');
var request = require('request');
var http = require('http');

var BASE_URL = 'http://impactaging.com/papers/v';

exports.getFile = function(vol, num, path) {
    return new Promise(function(resolve) {
        var url = BASE_URL + vol + '/n' + num + '/full/' + path;
        http.get(url, function(stream) {
            resolve(stream);
        });
    });
};

exports.getPage = function(vol, num, pii) {
    return new Promise(function(resolve, reject) {
        var url = BASE_URL + vol + '/n' + num + '/full/' + pii + '.html';
        request.get(url, function(err, response, body) {
            err ? reject(err) : resolve(cheerio.load(body));
        });
    });
};
