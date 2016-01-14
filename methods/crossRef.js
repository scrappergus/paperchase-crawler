var config = require('../config');
// var request = require('request');
var async = require('async');
var http = require('http-request'); // more error info than request
var crossRef = {};

crossRef.doiUrl = function(pii,journalName){
	return 'http://dx.doi.org/' + config.journalSettings[journalName]['doi'] + pii;
}

crossRef.allArticlesCheck = function(journalName,articles,cb){
	var doiUrlList = [];
	for(var a=0; a<articles.length ; a++){
		doiUrlList.push(crossRef.doiUrl(pii,journalName));
	}
	async.map(doiUrlList, crossRef.registered, function(err, registered) {
		if(err){
			console.error(err);
			cb(true,'Could not check articles');
		}else if (registered) {
					// console.log('DONE');
					// res.send(registered);
			cb(null,registered);
		}
	});
}

crossRef.registered = function(doiUrl, cb){
	// console.log('registered? ' + doiUrl);
	// console.log('            ' + doiUrl);
	var doiPieces = doiUrl.split('.');
	var article = {
		doi : doiUrl,
		pii : doiPieces[parseInt(doiPieces.length - 1)]
	}
	var error = false;
	var connectionRefused = false;
	// setTimeout(function(){
	http.get(doiUrl, function(err, res){
		// console.log('-------------------------------------'+doiUrl);
		if(err && err.code == '404'){
			// DOI is not registered
			article.registered = false;
			// cb(null, article);
			// console.log('error');
		}else if(err && err.code == 'ECONNREFUSED'){
			// could be that the connection was refused at publisher server, but we can still tell if the DOI was registered via header
			// console.error(doiUrl, err);
			// console.log('maybe');
			article.registered = 'Maybe. Connection to server refused';
			connectionRefused = true;
			error = true;
			// cb(null, article);
		}else if(err){
			// console.log('ERROR');
			console.error(doiUrl, err);
			error = true;
			article.registered = 'Cannot determine. Error while checking: ' + err.code;
			// cb(null, article);
		}else if(res && res.code == '200'){
			// console.log('Yes');
			article.registered = 'Registered';
			// cb(null, article); // DOI is regirested and we got redirected to publisher site
		}else{
			article.registered = 'Cannot determine';
			// cb(null, article);
			console.error(doiUrl, 'Cannot determine if registered');
		}
		if(connectionRefused){
			// if the publisher server refused connection then retry.
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
	// }, 3000);
}

module.exports = crossRef;