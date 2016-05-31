'use strict';

var config = require('../../config');
var cheerio = require('cheerio');
var Promise = require('bluebird');
var request = require('request');
var http = require('http');

var BASE_URL = 'http://impactaging.com/papers/v';

var aws = require('aws-sdk');

aws.config.update({
    accessKeyId: config.s3.key,
    secretAccessKey: config.s3.secret
});

var s3 = new aws.S3;

exports.getPdf = function(url, filename) {
    return new Promise(function(resolve, reject) {
        http.get(url, function(stream) {
            s3.upload({
                Bucket: config.journalSettings.aging.bucket,
                Key: filename,
                Body: stream
            }, function(err, data) {
                err ? reject(err) : resolve(data);
            });
        });
    });
};

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
