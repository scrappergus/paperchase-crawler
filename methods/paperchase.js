var config = require('../config');

var async = require('async');
var Db = require('mongodb').Db;
var Server = require('mongodb').Server;
var MongoClient = require('mongodb').MongoClient;
var xml2js = require('xml2js');
var request = require('request');
var journalSettings = config.journalSettings;


var paperchase = {};

paperchase.articleCount = function(journal,cb){
	console.log('...articleCount : ' + journal);
	var dbUrl = journalSettings[journal].dbUrl;
	var dbName = journalSettings[journal]['mongo']['name'];
	var dbUser = journalSettings[journal]['mongo']['user'];
	var dbPw = journalSettings[journal]['mongo']['password'];
	var dbServer = journalSettings[journal]['mongo']['server'];
	var dbPort= journalSettings[journal]['mongo']['port'];
	var dbServer = journalSettings[journal]['mongo']['server'];

	var db = new Db(dbName, new Server(dbServer, dbPort));
	// Establish connection to db
	db.open(function(err, db) {
	    // assert.equal(null, err);
	    if(err){
	    	console.error(err);
	    }else{
	      // Authenticate
			db.authenticate(dbUser, dbPw, function(err, result) {
				if(result){
					// console.log('USER authenticated');
					var articleCount = 0 ;
					db.collection('articles').find({},{_id:1}).toArray(function(articlesCountErr, articles){
						// do something with items
						if(articlesCountErr){
							console.log(articlesCountErr);
							cb(articlesCountErr);
						}
						if(articles){
							// console.log('articles');console.log(articles);
							cb(null,articles.length);
						}
					});
				}
			});
	    }
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
		}else{
			var coll = db.collection('articles');
			coll.insert(articleData, function(err, docs){
				if(err){
					console.error(err);
				}
				if(docs){
					cb(false, docs.insertedCount);
				}
			});
		}
		db.close();
	});
}

paperchase.allArticlesPii = function(journal,cb){
	console.log('...allArticlesPii ' + journal);
	var dbUrl = journalSettings[journal].dbUrl;
	var dbName = journalSettings[journal]['mongo']['name'];
	var dbUser = journalSettings[journal]['mongo']['user'];
	var dbPw = journalSettings[journal]['mongo']['password'];
	var dbServer = journalSettings[journal]['mongo']['server'];
	var dbPort= journalSettings[journal]['mongo']['port'];
	var dbServer = journalSettings[journal]['mongo']['server'];

	var db = new Db(dbName, new Server(dbServer, dbPort));
	// Establish connection to db
	db.open(function(err, db) {
	    if(err){
	    	console.error(err);
			cb(err);
	    }else{
	      // Authenticate
			db.authenticate(dbUser, dbPw, function(authenticateError, userAuthenticated) {
				if(authenticateError){
					console.error(authenticateError);
				}else if(userAuthenticated){
					var articleCount = 0 ;
					db.collection('articles').find().toArray(function(articlesErr, articles){
						// do something with items
						if(articlesErr){
							console.error(articlesErr);
							cb(articlesErr);
						} else if(articles){
							// console.log('articles');console.log(articles);
							cb(null,articles);
						}
					});
				}
			});
	    }
	});
}

module.exports = paperchase;