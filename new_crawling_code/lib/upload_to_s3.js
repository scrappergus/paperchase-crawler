'use strict';

const Promise = require('./promise');
const config = require('../config');
const aws = require('aws-sdk');
const http = require('http');

aws.config.update({
    accessKeyId: config.s3.key,
    secretAccessKey: config.s3.secret
});

const s3 = new aws.S3;

module.exports = (url, filename) => new Promise((resolve, reject) => {
    http.get(url, (stream) => s3.upload({
        Bucket: config.s3.bucket,
        Key: filename,
        Body: stream
    }, (err, data) => err ? reject(err) : resolve(data)));
});
