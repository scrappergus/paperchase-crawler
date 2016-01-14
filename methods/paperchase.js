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
	// console.log('...articleCount : ' + journal);
	var dbUrl = journalSettings[journal].dbUrl;
	if(config.live){
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
		    	console.error('DB connection ERROR',err);
		    }else{
		      // Authenticate
				db.authenticate(dbUser, dbPw, function(authenticateErr, authenticated) {
					if(authenticateErr){
						console.error('DB authenticate ERROR',authenticateErr);
					}else if(authenticated){
						// console.log('USER authenticated');
						var articleCount = 0 ;
						db.collection('articles').find({},{_id:1}).toArray(function(articlesCountErr, articles){
							if(articlesCountErr){
								console.error('Article Count ERROR',articlesCountErr);
								cb(articlesCountErr);
							}else if(articles){
								console.log(articles.length);
								cb(null,articles.length);
							}
						});
					}
				});
		    }
		});
	}else{
		cb(false, 0);//local env
	}
}

paperchase.insertArticle = function (articleData,journal,cb) {
	// console.log('..insertArticle');
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
			console.error('DB connection ERROR',err);
		}else{
			// Authenticate
			db.authenticate(dbUser, dbPw, function(authenticateErr, authenticated) {
				if(authenticateErr){
					console.error('DB authenticate ERROR',authenticateErr);
				}else if(authenticated){
					// console.log('USER authenticated');
					var articleCount = 0 ;
					db.collection('articles').insert(articleData,function(errorInsert,inserted){
						if(errorInsert){
							console.error('ERROR inserting', errorInsert);
						}else if(inserted){
							cb(null,inserted);
						}
					});
				}
			});
	    }
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
	    	console.error('DB Connection ERROR. Could not get list of PII in journal',err);
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