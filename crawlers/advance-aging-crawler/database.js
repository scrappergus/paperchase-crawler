'use strict';

var config = require('../../config');
var Promise = require('bluebird');
var mongoClient = require('mongodb').MongoClient;

function Database() {
    this.url = config.journalSettings.aging.dbUrl;
}

Database.prototype.connect = function() {
    return new Promise(function(resolve, reject) {
        mongoClient.connect(this.url, function(err, db) {
            err ? reject(err) : resolve(db);
        }.bind(this));
    }.bind(this));
};

Database.prototype.getAdvanceArticles = function() {
    return this.connect()
        .then(function(db) {
            return new Promise(function(resolve, reject) {
                db.collection('articles').find({
                    advance: true
                }).toArray(function(err, docs) {
                    err ? reject(err) : resolve(docs);
                });
            });
        });
};

Database.prototype.getArticle = function(pii) {
    return this.connect()
        .then(function(db) {
            return new Promise(function(resolve, reject) {
                db.collection('articles').findOne({
                    'ids.pii': pii
                }, function(err, doc) {
                    db.close();
                    err ? reject(err) : resolve(doc);
                });
            });
        });
};

Database.prototype.updateArticle = function(pii, content, abstract, supplements, pdf) {
    var obj = {
        content: content
    };

    if (abstract) {
        obj.abstract = abstract;
    }

    if (pdf) {
        obj.pdf = pdf;
    }

    if (supplements) {
        obj.supplements = supplements;
    }

    return this.connect()
        .then(function(db) {
            return new Promise(function(resolve, reject) {
                db.collection('articles').updateOne({
                    'ids.pii': pii
                }, {
                    $set: obj
                }, function(err, doc) {
                    db.close();
                    err ? reject(err) : resolve(doc);
                });
            });
        });
};

module.exports = Database;
