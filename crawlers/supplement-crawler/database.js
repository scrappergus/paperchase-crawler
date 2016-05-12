'use strict';

var config = require('../../config');
var Promise = require('bluebird');
var mongoClient = require('mongodb').MongoClient;

function Database(journalName) {
	this.url = config.journalSettings[journalName].dbUrl;
}

Database.prototype.connect = function() {
	return new Promise(function(resolve, reject) {
		mongoClient.connect(this.url, function(err, db) {
			err ? reject(err) : resolve(db);
		}.bind(this));
	}.bind(this));
}

Database.prototype.getArticle = function(pii) {
	return this.connect()
		.then(function(db) {
			return new Promise(function(resolve, reject) {
				db.collection('articles').findOne({'ids.pii': pii}, function(err, doc) {
					db.close();
					err ? reject(err) : resolve(doc);
				})
			});
		});
};

Database.prototype.updateArticle = function(id, supplements) {
  return this.connect()
    .then(function(db) {
      return new Promise(function(resolve, reject) {
        db.collection('articles').updateOne({
          _id: id
        }, {
          $set: {
            'files.supplemental': supplements
          }
        }, function(err, doc) {
          db.close();
          err ? reject(err) : resolve(doc);
        });
      });
    });
};

module.exports = Database;
