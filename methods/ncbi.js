var request = require('request');
var xml2js = require('xml2js');
var async = require('async');
var shared = require('../methods/shared');
var ncbi = {
	getPmidListForIssn: function(issn, cb) {
		// via PubMed
		// console.log('... getPmidListForIssn : ' + issn);
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
						// cb(null, pmidList.slice(0,10));
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
	getArticleTitleAndIdsFromPmid: function(pmid,cb){
		// console.log('..getArticleTitleAndIdsFromPmid : ' + pmid );
		var articleJsonUrl = 'http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=' + pmid;
		request(articleJsonUrl, function(err, res, body){
			if(err) {
				cb(err);
			}
			if(res){
				var articleJson = JSON.parse(res.body);
					articleJson = articleJson.result[pmid],
					articleIdList = articleJson['articleids'];
				var artObj = {};
					artObj['ids'] = {};
				for(var i = 0 ; i < articleIdList.length ; i ++){
					// artObj['ids'][articleIdList[i]['idtype']] = articleIdList[i]['value']; // do not want to get ALL IDs.
					var idType;
					idType = articleIdList[i]['idtype'];
					if(idType == 'pmc'){
						artObj['ids'][articleIdList[i]['idtype']] = articleIdList[i]['value'];
					}else if(idType == 'doi'){
						artObj['ids'][articleIdList[i]['idtype']] = articleIdList[i]['value'];
					}else if(idType == 'pii'){
						artObj['ids'][articleIdList[i]['idtype']] = articleIdList[i]['value'];
					}else if(idType == 'pubmed'){
						artObj['ids']['pmid'] = articleIdList[i]['value']; //keep consistent with paperchase
					}
				}
				artObj['title'] = articleJson['title'];
				// console.log(artObj);
				cb(null,artObj);
			}
		});
	},
	allArticlesTitleAndIds: function(journal,journalSettings,cbBatch){
		// console.log('..allArticlesTitleAndIds');
		// via PubMed
		// var journalDb = journalSettings[journal].dbUrl,
		journalIssn = journalSettings[journal].issn;
		console.log('--- Begin PMID/Title Crawler : ' + journal);
		ncbi.getPmidListForIssn(journalIssn, function(err, list){
			console.log('     PubMed Article Count: ' + list.length);
			// List = All PMID retrieved from PubMed query using Journal ISSN (limit set to 80000 in API request to PubMed DB. updated getPmidListForIssn if archive larger than 80k)
			async.mapSeries(list, function(pmid, map_cb){
				// console.log('---- PMID: ' + pmid);
				// Using PMID, retrieve article Title and ID list

				ncbi.getArticleTitleAndIdsFromPmid(pmid, function(articleTitleError, articlePubMedData){
					if(articleTitleError) {
						console.error('ERROR', articleTitleError);
						// map_cb();
					}else if(articlePubMedData){
						map_cb(null, articlePubMedData);
					}
				});
			}, function(err, articles){
				if(err) {
					console.error('ERROR',err);
					cbBatch(err);
				} else {
					articles = shared.removeEmptyFromArray(articles);
					// console.log('articles',articles);
					cbBatch(null, articles);
				}
			});
		});
	},
	titleAndIdsViaPmidList: function(pmidList, cb){
			async.mapSeries(pmidList, function(pmid, map_cb){
				console.log('---- PMID: ' + pmid);
				// Using PMID, retrieve article Title and ID list

				ncbi.getArticleTitleAndIdsFromPmid(pmid, function(articleTitleError, articlePubMedData){
					if(articleTitleError) {
						console.error('ERROR', articleTitleError);
						// map_cb();
					}else if(articlePubMedData){
						map_cb(null, articlePubMedData);
					}
				});
			}, function(err, articles){
				if(err) {
					console.error('ERROR',err);
					cb(err);
				} else {
					articles = shared.removeEmptyFromArray(articles);
					// console.log('articles',articles);
					cb(null, articles);
				}
			});

	},
	allArticlesTitleAndPMID: function(journal,journalSettings,cbBatch){
		// console.log('..allArticlesTitleAndPMID');
		// via PubMed
		var journalDb = journalSettings[journal].dbUrl,
			journalIssn = journalSettings[journal].issn;
			console.log('--- Begin PMID/Title Crawler : ' + journal);
			ncbi.getPmidListForIssn(journalIssn, function(err, list){
				console.log('     PubMed Article Count: ' + list.length);
				// List = All PMID retrieved from PubMed query using Journal ISSN (limit set to 80000 in API request to PubMed DB. updated getPmidListForIssn if archive larger than 80k)
				async.mapSeries(list, function(pmid, map_cb){
					console.log('---- PMID: ' + pmid);
					// Using PMID, retrieve article Title and ID list

					ncbi.getTitleByPMID(pmid, function(articleTitleError, articleTitle){
						if(articleTitleError) {
							console.error('ERROR', articleTitleError);
							// map_cb();
						}else if(articleTitle){
							var articleObj = {
								pmid : pmid,
								title : articleTitle
							}
							map_cb(null, articleObj);
						}
					});
				}, function(err, articles){
					if(err) {
						console.error('ERROR',err);
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
	},
	getPmcPdfUrl: function(ids, cb){
		// via PMC
		// console.log('...getPmcPdfUrl: '+ JSON.stringify(ids));
		var pdfUrl = 'http://www.ncbi.nlm.nih.gov/pmc/articles/' + ids.pmc + '/pdf/' + ids.pmc + '.pdf';
		// console.log('pdfUrl',pdfUrl);
		if(ids.pmc){
			if(ids.pii || ids['publisher-id']){
				var pii = ids.pii ? ids.pii : ids['publisher-id'];
				if(ids.pmc.indexOf('PMC') == -1){
					ids.pmc = 'PMC' + ids.pmc;
				}
				var pdfUrl = 'http://www.ncbi.nlm.nih.gov/pmc/articles/' + ids.pmc + '/pdf/' + pii + '.pdf';
				// console.log('   ' + pdfUrl);
				cb(null, pdfUrl);
			}else{
				// console.log('MISSING PII')
				cb('Paperchase MISSING PII');
			}
		}else{
			// console.log('MISSING PMC ID')
			cb('Paperchase Missing PMC ID');
		}
		// cb(null,pdfUrl);
	},
	getPmcPdf: function(ids,cb){
		// via PMC
		// console.log('...getPdfViaIds: '+ JSON.stringify(ids));
		ncbi.getPmcPdfUrl(ids,function(urlErr,pdfUrl){
			if(urlErr){
				console.error('urlErr');
				cb(urlErr);
			}else if(pdfUrl){
				// console.log('   ' + pdfUrl);
				request({url: pdfUrl, encoding: 'binary'}, function(pdfErr, response, body){
					if(pdfErr) {
						cb(pdfErr);
					}else if(response){
						// console.log('..... ' + pdfUrl + ' : ' + response.headers['content-type']);
						cb(null, body);
					}
				});
			}
		});
	}
}

module.exports = ncbi;