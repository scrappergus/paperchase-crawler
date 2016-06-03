'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const unzip = require('unzip');
const aws = require('aws-sdk');
const crypto = require('crypto');
const config = require('../config');
const Promise = require('./promise');

aws.config.update({
    accessKeyId: config.s3.key,
    secretAccessKey: config.s3.secret
});

const s3 = new aws.S3;

module.exports = (url, partialName) => new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const mediaDir = 'output/' + hash + '/word/media';
    const write = unzip.Extract({
        path: 'output/' + hash
    });

    http.get(url, (read) => {
        read.pipe(write);
        write.on('finish', () => fs.readdir(mediaDir, (e, files) => {
            e ? reject(e) : resolve(Promise.all(files.map((fileName, index) => {
                const read = fs.createReadStream(`${mediaDir}/${fileName}`);
                const extension = path.extname(fileName);
                return new Promise((resolve, reject) => s3.upload({
                    Bucket: config.s3.bucket,
                    Key: `${partialName}${index + 1}${extension}`,
                    Body: read
                }, (e, data) => e ? reject(e) : resolve({
                    id: 'SD' + (index + 1),
                    file: data.Key
                })));
            })));
        }));
    });
});
