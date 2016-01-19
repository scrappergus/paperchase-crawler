var config = require('../config');

var shared = {};

shared.removeEmptyFromArray = function(arr){
	temp = [];
	for(var i in arr){
		if(arr[i]){
			temp.push(arr[i]);
		}
	}
	return temp;
}

shared.matchPmidAndPii = function(pmidAndTitles,productionArticles,journalName,cb){
	var piiPmidPairs = [];
	var unmatched = [];
	for(var articleIdx=0 ; articleIdx < pmidAndTitles.length ; articleIdx++){
		// console.log(articleIdx + ': ' + pmidAndTitles[articleIdx]['title']);
		var articlePairsObject = {
			title: pmidAndTitles[articleIdx]['title']
		};
		var articlePmid;
			articlePmid = pmidAndTitles[articleIdx]['pmid']; //just title and PMID sent, as well as PII from prodution DB
		if(!articlePmid){
			articlePairsObject['ids'] = pmidAndTitles[articleIdx]['ids'];
			articlePmid = pmidAndTitles[articleIdx]['ids']['pmid']; // title and all IDs from PubMed sent, as well as PII from prodution DB
		}else{
			articlePairsObject['pmid'] = articlePmid;
		}
		var articleTitlePubMed = pmidAndTitles[articleIdx]['title'].replace(/(\r\n|\n|\r)/gm,' ').replace(/\./g,' ').replace(/ /g,''); // PubMed ends title with punctuation
		// console.log(articlePmid);

		// match PubMed title with Production DB title
		for(var productionArticleIdx = 0 ; productionArticleIdx < productionArticles.length ; productionArticleIdx++){
			// console.log(productionArticleIdx);
			var articleTitleProduction = productionArticles[productionArticleIdx]['title'].replace(/(\r\n|\n|\r)/gm,' ').replace(/\./g,' ').replace(/(<([^>]+)>)/gi,'').replace(/ /g,'');
			if(articleTitleProduction.toLowerCase() == articleTitlePubMed.toLowerCase()){
				var articlePii = productionArticles[productionArticleIdx][config.journalSettings[journalName].mysql.articlesTable.articleIdField];
				// console.log('MATCH : ' + articlePii + ' = ' + articlePmid);
				if(articlePairsObject['ids']){
					articlePairsObject['ids']['pii'] = articlePii;
				}else{
					articlePairsObject.pii = articlePii;
				}

			}
		}
		// console.log('articlePairsObject',articlePairsObject);
		piiPmidPairs.push(articlePairsObject);


		if(articleIdx == parseInt(pmidAndTitles.length-1)){
			cb(null,piiPmidPairs,unmatched);
		}
	}
}


module.exports = shared;