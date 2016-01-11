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
		// console.log(articleIdx);
		var articlePmid = pmidAndTitles[articleIdx]['pmid'];
		var articleTitlePubMed = pmidAndTitles[articleIdx]['title'].replace(/(\r\n|\n|\r)/gm,' ').replace(/\./g,' ').replace(/ /g,''); // PubMed ends title with punctuation
		console.log(articlePmid);
		var articlePairsObject = {
			pmid :  articlePmid,
			title: pmidAndTitles[articleIdx]['title']
		};

		// match PubMed title with Production DB title
		for(var productionArticleIdx = 0 ; productionArticleIdx < productionArticles.length ; productionArticleIdx++){
			// console.log(productionArticleIdx);
			var articleTitleProduction = productionArticles[productionArticleIdx]['title'].replace(/(\r\n|\n|\r)/gm,' ').replace(/\./g,' ').replace(/(<([^>]+)>)/gi,'').replace(/ /g,'');
			if(articleTitleProduction.toLowerCase() == articleTitlePubMed.toLowerCase()){
				var articlePii = productionArticles[productionArticleIdx][config.journalSettings[journalName].mysql.articlesTable.articleIdField];
				// console.log('MATCH : ' + articlePii + ' = ' + articlePmid);
				articlePairsObject.pii = articlePii;
			}
		}

		if(articlePairsObject.pii){
			piiPmidPairs.push(articlePairsObject);
		}else{
			unmatched.push(articlePairsObject);
		}

		if(articleIdx == parseInt(pmidAndTitles.length-1)){
			// console.log(piiPmidPairs);
			// res.send(piiPmidPairs);
			console.log(unmatched);
			// res.send(pairsFile);
			cb(null,piiPmidPairs);
		}
	}
}


module.exports = shared;