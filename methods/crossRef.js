var config = require('../config');
var request = require('request');
var async = require('async');
var http = require('http-request'); // more error info than request
var crossRef = {};

crossRef.doiUrl = function(pii,journalName){
//	return 'http://dx.doi.org/' + config.journalSettings[journalName]['doi'] + pii;
	return config.journalSettings[journalName]['doi'] + pii;
}

crossRef.allArticlesCheck = function(journalName,articles,cb){
	var doiUrlList = [];
	var doiTracker = {};
	for(var a=0; a<articles.length ; a++){
		if(articles[a]['ids']['doi']){
			doiTracker[articles[a]['ids']['doi']] = articles[a];
			doiUrlList.push(articles[a]['ids']['doi']);
		}else if(config.journalSettings[journalName]['doi'] && articles[a]['ids']['pii']){
			doiTracker[crossRef.doiUrl(articles[a]['ids']['pii'],journalName)] = articles[a];
			doiUrlList.push(crossRef.doiUrl(articles[a]['ids']['pii'],journalName)); // use PII to construct the DOI
		}
	}
	if(doiUrlList.length > 0){
		async.map(doiUrlList, crossRef.registered, function(err, registered) {
			if(err){
				console.error('doiUrlList', err);
				cb(true,'Could not check articles');
			}else if (registered) {
				cb(null,registered,doiTracker);
			}
		});
	}else{
		console.log('CANNOT get DOI. No DOI config stored and no DOI in article docs');
		cb(null,null);
	}
}

crossRef.registered = function(doiUrl, cb){
	// console.log('registered? ' + doiUrl);
	var doiPieces = doiUrl.split('.');
	var article = {
		doi : doiUrl
	}
	doiUrl = doiUrl.replace('http://dx.doi.org/','');
	var error = false;
	var connectionRefused = false;
	request.get('http://api.crossref.org/works/' + doiUrl, function(err, res){
		// console.log('-------------------------------------'+doiUrl);
		if(res === undefined) {
			article.registered = false;
		} else if(err && res.statusCode == '404'){
			// DOI is not registered
			article.registered = false;
		}else if(err && err.statusCode == 'ECONNREFUSED'){
			article.registered = 'Maybe. Connection to server refused';
			connectionRefused = true;
			error = true;
		}else if(res.statusCode == '404'){
			article.registered = false;
		}else if(err){
			console.error(doiUrl, err);
			error = true;
			article.registered = 'Cannot determine. Error while checking: ' + err.code;
		}else if(res && res.statusCode == '200'){
			article.registered = 'Registered';
			var responseJson = JSON.parse(res.body);
			responseJson = responseJson.message;
			article.indexed_date = responseJson.indexed.timestamp;
			article.volume = responseJson.volume;
			article.deposited = responseJson.deposited;
			if(responseJson['published-online']){
				article.crossref_epub_date = responseJson['published-online']['date-parts'][0].join('-');
			}
			if(responseJson['published-print']){
				article.crossref_print_date = responseJson['published-print']['date-parts'][0].join('-');
			}
		}else{
			article.registered = 'Cannot determine';
			console.error(doiUrl, 'Cannot determine if registered');
		}
		if(connectionRefused){
			// if the CrossRef server refused connection then retry.
			crossRef.registered(doiUrl,cb,function(e,r){
				if(e){

				}else if(r){
					connectionRefused = false;
					article = r;
				}
			})
		}else{
			 cb(error, article);
		}

	});
}

module.exports = crossRef;
