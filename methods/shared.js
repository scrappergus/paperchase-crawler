var config = require('../config');
var request = require('request');
var fs = require('fs');
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


shared.stripTitle = function(title){
	return title.replace(/(\r\n|\n|\r)/gm,' ').replace(/\./g,' ').replace(/ /g,'').replace(/-/g,'').replace(/,/g,'').replace(/'/g,'').replace(/’/g,'').replace('–','').replace(/<[^>]*>/g,'').replace(/(\()/g,'').replace(/(\))/g,'').replace(/</g,'').replace(/>/g,'').replace(/>/g,'').replace(/&amp;gt;/g,'').toLowerCase();
}

shared.matchPmidAndPii = function(pmidAndTitles,productionArticles,journalName,cb){
	// console.log('..matchPmidAndPii');
	var piiPmidPairs = [];
	var unmatched = [];
	for(var articleIdx=0 ; articleIdx < pmidAndTitles.length ; articleIdx++){
		// console.log(articleIdx,JSON.stringify(pmidAndTitles[articleIdx]));
		var articlePairsObject = pmidAndTitles[articleIdx];

		var articleTitlePubMed = shared.stripTitle(pmidAndTitles[articleIdx]['title']); // PubMed ends title with punctuation
		// console.log(articlePmid);

		// match PubMed title with Production DB title
		for(var productionArticleIdx = 0 ; productionArticleIdx < productionArticles.length ; productionArticleIdx++){
			// console.log(productionArticleIdx);
			var articleTitleProduction = shared.stripTitle(productionArticles[productionArticleIdx]['title']);

			if(articleTitleProduction.toLowerCase() == articleTitlePubMed.toLowerCase()){
				var legacyArticleIdField = config.journalSettings[journalName].mysql.articlesTable.articleId;
				var articlePii = productionArticles[productionArticleIdx][legacyArticleIdField];
				if(articlePii){
					articlePii = articlePii.toString();
				}
				articlePairsObject['ids']['pii'] = articlePii;
			}
		}

		if(!articlePairsObject['ids']['pii']){
			console.log('PII Missing: ' + articlePairsObject['ids']['pmid']);
		}

		// console.log('articlePairsObject',articlePairsObject);
		piiPmidPairs.push(articlePairsObject);


		if(articleIdx == parseInt(pmidAndTitles.length-1)){
			cb(null,piiPmidPairs,unmatched);
		}
	}
}

shared.getFileDataFromUrl = function(url, cb) {
	console.log('..getFileDataFromUrl: ' + url);
	setTimeout(function() {
		request.get(url, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				cb(null, body);
			} else {
				cb(error, "");
			}
		});
	}, 2500);
};

shared.getFileExtension = function(fileName,cb){
	console.log('..getFileExtension: '+ fileName);
	var fileNameParts = fileName.split('.');
	var fileNamePartsLength = fileNameParts.length;
	cb(fileNameParts[parseInt(fileNamePartsLength-1)])
}

shared.getFilesizeInBytes = function(filePath,cb) {
	var stats = fs.statSync(filePath)
	var fileSizeInBytes = stats["size"]
	cb(fileSizeInBytes);
}


module.exports = shared;