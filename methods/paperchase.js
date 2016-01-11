var config = require('../config');

var async = require('async');
var MongoClient = require('mongodb').MongoClient;
var xml2js = require('xml2js');
var request = require('request');
var journalSettings = config.journalSettings;

var paperchase = {};

paperchase.articleCount = function(journal,cb){
	var journalDb = journalSettings[journal].dbUrl;
	MongoClient.connect(journalDb, function(db_err, db) {
		if(db_err) { cb(db_err); return; }
		var coll = db.collection('articles');
		coll.find({}, function(find_err, cursor){
			cursor.toArray(function (arr_err, arr){
				cb(arr_err, arr.length);
				db.close();
			});
		});
	});
}

paperchase.insertArticle = function (articleData,journal,cb) {
	// can do multiple at once.
	var journalDb = journalSettings[journal].dbUrl;
	console.log(journalDb);
	MongoClient.connect(journalDb, function(db_err, db) {
		if(db_err) {
			console.error(db_err);
			cb(db_err);
			return;
		}
		var coll = db.collection('articles');
		coll.insert(articleData, function(err, docs){
			if(err){
				console.error(err);
			}
			if(docs){
				cb(false, docs.insertedCount);
			}
		});
	});
}

module.exports = paperchase;