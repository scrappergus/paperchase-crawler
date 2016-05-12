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

Database.prototype.getArticles = function() {
	return this.connect()
		.then(function(db) {
			return new Promise(function(resolve, reject) {
				db.collection('articles').find({}).toArray(function(err, docs) {
					err? reject(err): resolve(docs);
				});
			});
		});
};

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

Database.prototype.getFigure = function(mongoId) {
	return this.connect()
		.then(function(db) {
			return new Promise(function(resolve, reject) {
				db.collection('figures').findOne({
					'ids.mongo_id': mongoId
				}, function(err, doc) {
					db.close();
					err ? reject(err) : resolve(doc);
				});
			});
		});
};

Database.prototype.updateFigure = function(id, figures) {
	return this.connect()
		.then(function(db) {
			return new Promise(function(resolve, reject) {
				db.collection('figures').updateOne({'ids.mongo_id': id}, {
					ids: {
						mongo_id: id,
					},
					figures: figures
	      		}, {
	      			upsert: true
	      		}, function(err, doc) {
					db.close();
					err ? reject(err) : resolve(doc);
				});
			});
		});
};

module.exports = Database;
