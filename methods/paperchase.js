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


paperchase.allArticlesIds = function(journal,cb){
	console.log('...allArticlesIds ' + journal);
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

paperchase.articlePiiViaPmid = function(pmid,journal,cb){
	// console.log('...articlePiiViaPmid ' + journal);
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
					// console.log('... user authenticated');
					db.collection('articles').findOne({'ids.pmid' : pmid},function(findError,findResult){
						if(findError){
							console.error('findError', findError);
							cb(findError);
						}else if(findResult){
							// console.log(findResult);
							if(findResult.ids.pii){
								cb(null,findResult.ids.pii);
							}else{
								cb(null,null);
							}
						}else{
							// console.log('..not found');
							cb(null,null); // not found in DB
						}
					})
				}
			});
	    }
	});
}
paperchase.articleIdsViaPmid = function(pmid, pii, journal,cb){
	console.log('...articleUpdateViaPmid ' + pmid);
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
					console.error('User not authenticated',authenticateError);
				}else if(userAuthenticated){
					var art = db.collection('articles').findOne({'ids.pmid' : pmid});
					if(art.ids){
						art.ids.pii = pii;
					}else{
						art.ids = {};
						art.ids.pii = pii;
					}
					if(art){
						db.collection('articles').update({'_id' : art._id}, art,function(updateError,updated){
							if(updateError){
								console.error('updateError : ' + pmid, updateError);
								cb(updateError);
							}else if(updated){
								console.log('updated PMID ' + pmid);
								cb(null,updated);
							}
						});
					}
				}
			});
	    }
	});
}

module.exports = paperchase;