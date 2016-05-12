'use strict';

var s3 = require('./s3');
var request = require('./request');
var Database = require('./database');
var Promise = require('bluebird');

module.exports.crawlArticle = function (journal, pii) {
    var db = new Database(journal);
    var doc;
    return db.getArticle(pii)
        .then(function(article) {
            doc = article;
            return request.getPage(doc.ids.pmc);
        })
        .then(function(page) {
            var uploads = doc.files && doc.files.supplemental && doc.files.supplemental
                .map(function(supplement) {
                    var path = page('#' + supplement.id + '> div > a').attr('href');
                    var parts = path && path.split('.');
                    var extension = parts && parts[parts.length -1];
                    var supplementId = supplement.id.toLowerCase();
                    var mongoId = doc._id.toString();
                    var filename = mongoId + '_' + supplementId + '.' + extension;
                    supplement.file = filename;
                    return {
                        document: supplement,
                        filename: filename,
                        path: path
                    };
                })
                .filter(function(supplement) {
                    return supplement.path;
                })
                .map(function(supplement) {
                    return request.getFile(supplement.path)
                        .then(function(stream) {
                            return s3.upload(journal, supplement.filename, stream);
                        })
                        .then(function() {
                            return supplement.document;
                        });
                });

            return Promise.all(uploads);

        })
        .then(function(supplements) {
            return db.updateArticle(doc._id, supplements);
        })
        .catch(function (err) {
            console.log('==> ERR 2', err);
        });
}
