'use strict';

var fs = require('fs');
var unzip = require('unzip');
var Promise = require('bluebird');

module.exports.uploadStream = function(stream, filename) {
    var filepath = __dirname + '/upload/' + filename;
    var stream = stream.pipe(fs.createWriteStream(filepath));
    return new Promise(function(resolve) {
        stream.on('finish', function() {
            resolve(filepath);
        });
    });
};

module.exports.getStream = function(filepath) {
    return fs.createReadStream(filepath);
};

module.exports.extractMedia = function(filepath) {
    var read = fs.createReadStream(filepath);
    var write = unzip.Extract({
        path: 'output'
    });
    var stream = read.pipe(write);

    return new Promise(function(resolve, reject) {
        stream.on('finish', function() {
            fs.readdir(__dirname + '/output/word/media', function(err, fileNames) {
                err ? reject(err) : resolve(fileNames.map(function(fileName) {
                    return __dirname + '/output/word/media/' + fileName;
                }));
            });
        });
    });
};
