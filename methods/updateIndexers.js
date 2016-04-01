var request = require('request');
var xml2js = require('xml2js');
var async = require('async');
var shared = require('../methods/shared');
var crossRef = require('../methods/crossRef');

var updateIndexers = {
	createPmidDoiPairsFile: function(journal, articleList, cb){
		//articleList will contain title, pmid, and pii. use the pii to check if article is registered. if so then add to pairs file string
		var pairsFile = '';
		var doiUrlList = [];
		var pmidByDoi = {};
		for(var article=0 ; article < articleList.length ; article++){
			if(articleList[article].pii){
				var pmid = articleList[article].pmid;
				var pii = articleList[article].pii;
				var doiUrl = crossRef.doiUrl(pii,journal);
				doiUrlList.push(doiUrl);
				pmidByDoi[doiUrl] = pmid;
			}
		}
		async.map(doiUrlList, crossRef.registered, function(err, registered) {
			if(err){
				console.error('doiUrlList', err);
				cb(true,'Could not check articles');
			}else if (registered) {
				async.each(registered,function(article,callback){
					var pmid =  pmidByDoi[article.doi];
					pairsFile += pmid + '            ' + article.doi.replace('http://dx.doi.org/','') + '\n';
				});
				cb(null,pairsFile);
			}
		});
	}
}

module.exports = updateIndexers;