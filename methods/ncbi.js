var request = require('request');
var xml2js = require('xml2js');
var async = require('async');
var shared = require('../methods/shared');
var ncbi = {
	get_pmid_list_for_issn: function(issn, cb) {
		// via PubMed
		// console.log('... get_pmid_list_for_issn : ' + issn);
		var pmidListUrl = "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term="+issn+"&RetMax=80000";
		// var pmidListUrl = "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term="+issn+"&RetMax=10"; // for testing locally, smaller response
		request(pmidListUrl, function(err, res, body){
			if(err) {
				cb(err);
			} else {
				xml2js.parseString(body,function(parseErr, parseRes){
					if(parseErr) {
						cb(parseErr);
					}
					else {
						var pmidList = parseRes.eSearchResult.IdList[0].Id;
						// console.log(JSON.stringify(pmidList));
						cb(null, pmidList);
					}
				});
			}
		});
	},
	getTitleByPMID: function(pmid,cb){
		// console.log('getTitleByPMID: ' + pmid);
		// via PubMed
		var articleJsonUrl = 'http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=' + pmid;
		request(articleJsonUrl, function(err, res, body){
			if(err) {
				cb(err);
			}
			if(res){
				var articleJson = JSON.parse(res.body);
					articleJson = articleJson.result[pmid];
				// return articleJson['title'];
				cb(null,articleJson['title']);
			}
		});
	},
	allArticlesTitleAndPMID: function(journal,journalSettings,cbBatch){
		// via PubMed
		var journalDb = journalSettings[journal].dbUrl,
			journalIssn = journalSettings[journal].issn;
			console.log('--- Begin PMID/Title Crawler : ' + journal);
			ncbi.get_pmid_list_for_issn(journalIssn, function(err, list){
				console.log('     PubMed Article Count: ' + list.length);
				// List = All PMID retrieved from PubMed query using Journal ISSN (limit set to 80000 in API request to PubMed DB. updated get_pmid_list_for_issn if archive larger than 80k)
				async.mapSeries(list, function(pmid, map_cb){
					// console.log('---- PMID: ' + pmid);
					// Using PMID, retrieve article Title and ID list

					ncbi.getTitleByPMID(pmid, function(articleTitleError, articleTitle){
						if(articleTitleError) {
							console.log('     ERROR');
							console.error(articleTitleError);
							map_cb();
						}
						if(articleTitle){
							var articleObj = {
								pmid : pmid,
								title : articleTitle
							}
							map_cb(null, articleObj);
						}
					});
				}, function(err, articles){
					if(err) {
						console.log('     ERROR:');
						console.log(err);
						cbBatch(err);
					} else {
						// articlesXmlList = list of all XML uploaded to S3. Contains article IDs and XML URLs
						// All XML uploaded. Now return the array of articles to Paperchase to then update the DB
						articles = shared.removeEmptyFromArray(articles);
						// console.log('articles');
						// console.log(articles);
						cbBatch(null, articles); // remove empty before returning to Paperchase
					}
				});
			});
	}
}

module.exports = ncbi;