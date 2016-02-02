var config = require('../config');

var async = require('async');
var Db = require('mongodb').Db;
var Server = require('mongodb').Server;
var MongoClient = require('mongodb').MongoClient;
var xml2js = require('xml2js');
var request = require('request');
var journalSettings = config.journalSettings;


var paperchase = {
	articleCount: function(journal,cb){
		console.log('...articleCount : ' + journal);
		paperchase.allArticles(journal, {}, {_id : true}, function(allArticlesError,articles){
			if(allArticlesError){
				cb(allArticlesError);
			}else if(articles){
				console.log('articles',articles);
				console.log('articles.length',articles.length);
				cb(null,articles.length);
			}
		});
	},
	// insertArticle: function (articleData,journal,cb) {
	// 	// console.log('..insertArticle');
	// 	var dbName = journalSettings[journal]['mongo']['name'];
	// 	var dbUser = journalSettings[journal]['mongo']['user'];
	// 	var dbPw = journalSettings[journal]['mongo']['password'];
	// 	var dbServer = journalSettings[journal]['mongo']['server'];
	// 	var dbPort= journalSettings[journal]['mongo']['port'];
	// 	var dbServer = journalSettings[journal]['mongo']['server'];

	// 	var db = new Db(dbName, new Server(dbServer, dbPort));
	// 	// Establish connection to db
	// 	db.open(function(err, db) {
	// 		if(err){
	// 			console.error('DB connection ERROR',err);
	// 		}else{
	// 			// Authenticate
	// 			db.authenticate(dbUser, dbPw, function(authenticateErr, authenticated) {
	// 				if(authenticateErr){
	// 					console.error('DB authenticate ERROR',authenticateErr);
	// 				}else if(authenticated){
	// 					// console.log('USER authenticated');
	// 					var articleCount = 0 ;
	// 					db.collection('articles').insert(articleData,function(errorInsert,inserted){
	// 						if(errorInsert){
	// 							console.error('ERROR inserting', errorInsert);
	// 						}else if(inserted){
	// 							cb(null,inserted);
	// 						}
	// 					});
	// 				}
	// 			});
	// 	    }
	// 	});
	// },
	// updateAssets: function (journal, assetType, assetData, cb) {
	// 	console.log('..updateAssets: ' + assetType);
	// 	// console.log('assetData, ' , assetData);
	// 	var dbName = journalSettings[journal]['mongo']['name'];
	// 	var dbUser = journalSettings[journal]['mongo']['user'];
	// 	var dbPw = journalSettings[journal]['mongo']['password'];
	// 	var dbServer = journalSettings[journal]['mongo']['server'];
	// 	var dbPort= journalSettings[journal]['mongo']['port'];
	// 	var dbServer = journalSettings[journal]['mongo']['server'];

	// 	var db = new Db(dbName, new Server(dbServer, dbPort));
	// 	// Establish connection to db
	// 	db.open(function(err, db) {
	// 		if(err){
	// 			console.error('DB connection ERROR',err);
	// 		}else{
	// 			// Authenticate
	// 			db.authenticate(dbUser, dbPw, function(authenticateErr, authenticated) {
	// 				if(authenticateErr){
	// 					console.error('DB authenticate ERROR',authenticateErr);
	// 				}else if(authenticated){
	// 					// console.log('USER authenticated');
	// 					var articleCount = 0 ;
	// 					db.collection(assetType).update({'ids.paperchase_id' : assetData.ids.paperchase_id}, assetData, {upsert: true}, function(errorUpdate,updated){
	// 						if(errorUpdate){
	// 							console.error('ERROR updating', errorUpdate);
	// 						}else if(updated){
	// 							// console.log('updated',updated);
	// 							cb(null,updated);
	// 						}
	// 					});
	// 				}
	// 			});
	// 	    }
	// 	});
	// },
	allArticles: function(journal, query, projection, cb){
		console.log('...allArticles: ' + journal + ',' , query);
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
						db.collection('articles').find(query,projection).toArray(function(articlesErr, articles){
							if(articlesErr){
								cb(articlesErr);
							}else if(articles){
								// cb(null,articles.slice(0,1)); //local testing
								cb(null,articles);
							}else{
								cb(null,null);
							}
						});
					}
				});
		    }
		});
	},
	allPmidAndPaperchaseIdPairs: function(journal,cb){
		console.log('...allPmidAndPaperchaseIdPairs: ' + journal);
		paperchase.allArticles(journal, {}, {ids: true}, function(allArticlesError,articles){
			if(allArticlesError){
				cb(allArticlesError);
			}else if(articles){
				var pairsObject = {};
				for(var articleIdx=0 ; articleIdx < articles.length ; articleIdx++){
					if(articles[articleIdx].ids.pmid){
						articles[articleIdx].ids.mongo_id = articles[articleIdx]._id;
						pairsObject[articles[articleIdx]['ids']['pmid']] = articles[articleIdx]['ids'];
					}
					if(articleIdx == parseInt(articles.length - 1)){
						// console.log('pairsObject',pairsObject)
						cb(null,pairsObject);
					}
				}
			}
		});
	},
	articlePiiViaPmid: function(pmid,journal,cb){
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
	},
	getArticlePaperchaseIdsViaPmid: function(pmid,journal,cb){
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
		    	console.error('DB Connection ERROR. Could not get article info : PMID ' + pmid ,err);
				cb(err);
		    }else{
		      // Authenticate
				db.authenticate(dbUser, dbPw, function(authenticateError, userAuthenticated) {
					if(authenticateError){
						console.error(authenticateError);
					}else if(userAuthenticated){
						// console.log('... user authenticated. Find PMID ' + pmid);
						db.collection('articles').findOne({'ids.pmid' : pmid},function(findError,findResult){
							if(findError){
								console.error('findError', findError);
								cb(findError);
							}else if(findResult){
								// console.log('findResult',findResult);
								cb(null,findResult.ids);
							}else{
								// console.log('Could Not find PMID ' + pmid + ' in the Paperchase DB');
								cb(null,null); // not found in DB
							}
						})
					}
				});
		    }
		});
	},
	getArticle: function(journal, query, projection, cb){
		// console.log('...getArticle: ' + journal + ',' , query);
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
						db.collection('articles').findOne(query, projection,function(findError,findResult){
							if(findError){
								console.error('findError', findError);
								cb(findError);
							}else if(findResult){
								cb(null,findResult);
							}else{
								// console.log('..not in DB');
								cb(null,null);
							}
						})
					}
				});
		    }
		});
	}
	// articleIdsViaPmid: function(pmid, pii, journal,cb){
	// 	// NOT USED
	// 	console.log('...articleUpdateViaPmid ' + pmid);
	// 	var dbUrl = journalSettings[journal].dbUrl;
	// 	var dbName = journalSettings[journal]['mongo']['name'];
	// 	var dbUser = journalSettings[journal]['mongo']['user'];
	// 	var dbPw = journalSettings[journal]['mongo']['password'];
	// 	var dbServer = journalSettings[journal]['mongo']['server'];
	// 	var dbPort= journalSettings[journal]['mongo']['port'];
	// 	var dbServer = journalSettings[journal]['mongo']['server'];

	// 	var db = new Db(dbName, new Server(dbServer, dbPort));
	// 	// Establish connection to db
	// 	db.open(function(err, db) {
	// 	    if(err){
	// 	    	console.error('DB Connection ERROR. Could not get list of PII in journal',err);
	// 			cb(err);
	// 	    }else{
	// 	      // Authenticate
	// 			db.authenticate(dbUser, dbPw, function(authenticateError, userAuthenticated) {
	// 				if(authenticateError){
	// 					console.error('User not authenticated',authenticateError);
	// 				}else if(userAuthenticated){
	// 					var art = db.collection('articles').findOne({'ids.pmid' : pmid});
	// 					if(art.ids){
	// 						art.ids.pii = pii;
	// 					}else{
	// 						art.ids = {};
	// 						art.ids.pii = pii;
	// 					}
	// 					if(art){
	// 						db.collection('articles').update({'_id' : art._id}, art,function(updateError,updated){
	// 							if(updateError){
	// 								console.error('updateError : ' + pmid, updateError);
	// 								cb(updateError);
	// 							}else if(updated){
	// 								console.log('updated PMID ' + pmid);
	// 								cb(null,updated);
	// 							}
	// 						});
	// 					}
	// 				}
	// 			});
	// 	    }
	// 	});
	// }
};

module.exports = paperchase;