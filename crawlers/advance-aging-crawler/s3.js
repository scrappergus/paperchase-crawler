'use strict';

var config = require('../../config');
var aws = require('aws-sdk');
var Promise = require('bluebird');

aws.config.update({
    accessKeyId: config.s3.key,
    secretAccessKey: config.s3.secret
});

var s3 = new aws.S3();

exports.uploadPdf = function(filename, stream) {
    return new Promise(function(resolve, reject) {
        s3.upload({
            Bucket: config.journalSettings.aging.bucket,
            Key: 'pdf/' + filename,
            Body: stream
        }, function(err, data) {
            err ? reject(err) : resolve(data);
        });
    });
};

exports.uploadSupplement = function(filename, stream) {
    return new Promise(function(resolve, reject) {
        s3.upload({
            Bucket: config.journalSettings.aging.bucket,
            Key: 'supplemental_materials/' + filename,
            Body: stream
        }, function(err, data) {
            err ? reject(err) : resolve(data);
        });
    });
};

exports.upload = function(filename, stream) {
    return new Promise(function(resolve, reject) {
        s3.upload({
            Bucket: config.journalSettings.aging.bucket,
            Key: 'advance_figures/' + filename,
            Body: stream
        }, function(err, data) {
            err ? reject(err) : resolve(data);
        });
    });
};
