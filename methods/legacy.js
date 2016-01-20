// For connection with journal legacy DB
var legacy = {};

var config = require('../config');
var mysql = require('mysql');

legacy.getAllArticlesIdAndTitle = function(journal,cb){
	// console.log('..connect to legacy DB');
	// DB settings
	var connection = mysql.createConnection({
	  host     : config.journalSettings[journal].mysql.host,
	  user     : config.journalSettings[journal].mysql.user,
	  password : config.journalSettings[journal].mysql.password,
	  database : config.journalSettings[journal].mysql.database
	});
	// article table settings
	var articlesTable = config.journalSettings[journal].mysql.articlesTable.name;
	var articlesIdField = config.journalSettings[journal].mysql.articlesTable.articleId;
	var articlesTitleField = config.journalSettings[journal].mysql.articlesTable.articleTitle;
	// connect to mysql DB
	connection.connect(function(err) {
		if (err) {
			console.error('error connecting: ' + err.stack);
			return;
		}
		// console.log('connected as id ' + connection.threadId);
	});
	// query articles table
	connection.query('SELECT ' + articlesIdField + ',' + articlesTitleField + ' FROM ' + articlesTable , function(err, res, fields) {
		if (err){
			throw err;
		}
		if(res){
			// console.log('Number of rows: ', res.length);
			// console.log(res);
			cb(res,false); // error 2nd parameter
			connection.end();
		}

	});
}

legacy.getArticleDates = function(journal,cb){
	var connection = mysql.createConnection({
		host     : config.journalSettings[journal].mysql.host,
		user     : config.journalSettings[journal].mysql.user,
		password : config.journalSettings[journal].mysql.password,
		database : config.journalSettings[journal].mysql.database
	});
	// article table settings
	var articlesTable = config.journalSettings[journal].mysql.articlesTable.name;
	var articlesIdField = config.journalSettings[journal].mysql.articlesTable.articleId;
	var articlesTitleField = config.journalSettings[journal].mysql.articlesTable.articleTitle;
	var articlesEpubField = config.journalSettings[journal].mysql.articlesTable.epub;
	// connect to mysql DB
	connection.connect(function(err) {
		if (err) {
			console.error('error connecting: ' + err.stack);
			return;
		}
		// console.log('connected as id ' + connection.threadId);
	});
	// query articles table
	connection.query('SELECT ' + articlesEpubField + ',' + articlesTitleField + ',' + articlesIdField + ' FROM ' + articlesTable , function(err, res, fields) {
		if (err){
			throw err;
		}else if(res){
			// console.log('Number of rows: ', res.length);
			// console.log(res);
			cb(null,res);
			connection.end();
		}
	});
}

module.exports = legacy;