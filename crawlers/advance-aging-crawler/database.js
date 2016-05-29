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
}

Database.prototype.updateArticle = function(pii, content) {
    return this.connect()
        .then(function(db) {
            return new Promise(function(resolve, reject) {
                db.collection('articles').updateOne({
                    'ids.pii': pii
                }, {
                    $set: {
                        advanceContent: content
                    }
                }, function(err, doc) {
                    db.close();
                    err ? reject(err) : resolve(doc);
                });
            });
        });
};

module.exports = Database;
