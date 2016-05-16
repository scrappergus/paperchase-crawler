var fs = require('fs');
var async = require('async');
var request = require('request');
var express = require('express');
var MongoClient = require('mongodb').MongoClient;
// Custom
var config = require('./config');
var shared = require('./methods/shared');
var journalSettings = config.journalSettings;
var xmlPdfCrawler = require('./crawlers/xml-pdf-crawler');
var figureCrawler = require('./crawlers/figure-crawler');
var supplementalCrawler = require('./crawlers/supplement-crawler');
var xmlCrawler = require('./crawlers/xmlCrawler');
var pdfCrawler = require('./crawlers/pdfCrawler');
var ncbi = require('./methods/ncbi');
var legacy = require('./methods/legacy');
var paperchase = require('./methods/paperchase');
var crossRef = require('./methods/crossRef');
var updateIndexers = require('./methods/updateIndexers');

var app = express();
app.use(express.static('public'));

function mongo_query(journal, collection_name, query, cb) {
	// console.log('... mongo_query : ' + collection_name);
	// console.log('.... ' + JSON.stringify(query));
	var journalDb = journalSettings[journal].dbUrl;
	MongoClient.connect(journalDb, function(db_err, db) {
		if(db_err) { cb(db_err); return; }
		var coll = db.collection(collection_name);
		coll.find(query, function(find_err, cursor){
			cursor.toArray(function (arr_err, arr){
				cb(arr_err, arr);
				db.close();
			});
		});
	});
}

// XML AND PDF
// ---------------------------------------
// Single article scraping by pii
app.get('/crawl_content/:journalname/:pii', function(req, res) {
	var journal = req.params.journalname;
	var pii = req.params.pii;
	xmlPdfCrawler.crawlArticle(journal, pii)
        .then(function (val) {
            res.status(200).send(val);
        })
        .catch(function(err) {
            res.status(400).send(err);
        });
})

// SUPPLEMENTAL
// ---------------------------------------
// Single article scraping by pii
app.get('/crawl_supplemental/:journalname/:pii', function(req, res) {
	var journal = req.params.journalname;
	var pii = req.params.pii;
	supplementalCrawler.crawlArticle(journal, pii)
        .then(function (val) {
            res.status(200).send(val);
        })
        .catch(function(err) {
            res.status(400).send(err);
        });
})

// FIGURES
// ---------------------------------------
// Single article scraping by pii
app.get('/crawl_figures/:journalname/:pii', function(req, res) {
	var journal = req.params.journalname;
	var pii = req.params.pii;
	figureCrawler.crawlArticle(journal, pii, function(err, val) {
		err ? res.status(400).send(err) : res.status(200).send(val);
	});
})

// XML
// ---------------------------------------
// Batch crawler to upload all journal PMC XML to S3
app.get('/crawl_xml/:journalname/', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader("Access-Control-Allow-Origin", "*");
	var journalName = req.params.journalname;
	// console.log('.. crawl : ' + journalName);
	xmlCrawler.batchByJournal(journalName, function(crawlXmlErr, crawlXmlRes) {
		if(crawlXmlErr) {
			console.error('ERROR',crawlXmlErr);
			res.send(JSON.stringify(crawlXmlErr));
		} else {
			// console.log('crawlXmlRes');console.log(crawlXmlRes);
			res.send(JSON.stringify(crawlXmlRes));
		}
	});
});
// Per article, get PMC article XML
app.get('/get_article_pmc_xml/:journalname/:articleMongoId', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	var journalName = req.params.journalname;
	var articleMongoId = req.params.articleMongoId;
	console.log('.. get xml : ' + journalName + ' - ' + articleMongoId);
	xmlCrawler.getByArticle(journalName, articleMongoId, function(crawlXmlErr, crawlXmlRes) {
		if(crawlXmlErr) {
			console.error('ERROR',crawlXmlErr);
			res.send(JSON.stringify(crawlXmlErr));
		} else {
			// console.log('crawlXmlRes',crawlXmlRes);
			res.send(crawlXmlRes);
		}
	});
});


// PDF
// ---------------------------------------
// Batch crawler to upload all journal PDF via PMC to S3
app.get('/crawl_pdf/:journalname/', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Connection', 'keep-alive');
	var journalName = req.params.journalname;
	console.log('.. crawl : ' + journalName);
	pdfCrawler.batchByJournal(journalName, function(crawlPdfErr, crawlPdfRes) {
		if(crawlPdfErr) {
			console.error('ERROR',crawlPdfErr);
			res.send(JSON.stringify(crawlPdfErr));
		} else {
			// console.log('crawlXmlRes');console.log(crawlXmlRes);
			res.send(JSON.stringify(crawlPdfRes));
		}
	});
});
// Per article
app.get('/get_article_pmc_pdf/:journalname/:articleMongoId', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	var journalName = req.params.journalname;
	var articleMongoId = req.params.articleMongoId;
	console.log('.. get pdf : ' + journalName + ' - ' + articleMongoId);
	pdfCrawler.getByArticle(journalName, articleMongoId, function(crawlXmlErr, crawlPdfRes) {
		if(crawlXmlErr) {
			console.error('ERROR',crawlXmlErr);
			res.send(JSON.stringify(crawlXmlErr));
		} else {
			// console.log('crawlXmlRes',crawlXmlRes);
			res.send(crawlPdfRes);
		}
	});
});


// DOI
// ---------------------------------------
// DOI Status - for ALL articles in journal
app.get('/doi_status/:journalname/', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	var journalName = req.params.journalname;
	var journalPublisher = journalSettings[journalName]['publisher'];
	console.log('...fetching status for : ' + journalName);
	var query = {};
	var projection = {ids: true, publisher: true, dates: true};
	if(journalPublisher){
		query = {publisher : journalPublisher}
	}
	var journalPiiList = paperchase.allArticles(journalName, query, projection, function(articlesError, articles) {
		if(articlesError){
			console.error(articlesError);
			res.send('ERROR : ' + JSON.stringify(articlesError));
		}else if(articles){
			console.log('   article count = ' + articles.length);
			crossRef.allArticlesCheck(journalName,articles,function(e,registeredRes,doiTracker){
				if(e){
					console.error(e);
					res.send('ERROR: ' + JSON.stringify(e));
				}
				if(registeredRes){
					// combine crossref res with db info
					for(var registeredResIdx = 0 ; registeredResIdx < registeredRes.length ; registeredResIdx++){
						var doi = registeredRes[registeredResIdx]['doi'];
						registeredRes[registeredResIdx]['paperchase'] = doiTracker[doi];
					}
					res.send(registeredRes);
				}else{
					var paperchaseArticles = [];
					for(var artIdx = 0 ; artIdx < articles.length ; artIdx++){
						var paperchaseArticleObj = {};
						paperchaseArticleObj.paperchase = articles[artIdx];
						paperchaseArticles.push(paperchaseArticleObj);
					}
					res.send(paperchaseArticles); // just end paperchase articles back. cannot determine if registered
				}
			});
		}
	});
});
// DOI Status - per article
app.get('/article/:journalname/:pii/doi_status', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	var journalName = req.params.journalname;
	var pii = req.params.pii;
	var doiUrl = crossRef.doiUrl(pii,journalName);
	crossRef.registered(doiUrl,function(error,result){
		if(error){
			console.error(error);
			res.send(error);
		}else if(result){
			res.send(result);
		}
	});
});


// PubMed Queries
// ---------------------------------------
// Get PMID/Title pair
app.get('/titles/:journalname', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader("Access-Control-Allow-Origin", "*");
	var journalName = req.params.journalname;
	console.log('.. crawl : ' + journalName);
	ncbi.allArticlesTitleAndPMID(journalName, journalSettings, function(titlesErr, pmidAndTitles) {
		if(titlesErr) {
			console.error('ERROR:');
			res.send(JSON.stringify(titlesErr));
		}
		if(pmidAndTitles){
			res.send(JSON.stringify(pmidAndTitles));
		}
	});
});
app.get('/pubmed/all_titles_and_all_ids/:journalname', function(req, res) {
	// this takes too long to respond for large journals
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('CONNECTION', 'keep-alive');
	var journalName = req.params.journalname;
	var journalIssn = journalSettings[journalName].issn;
	console.log('.. crawl : ' + journalName);
	ncbi.getPmidListForIssn(journalIssn, function(pmidListError, pmidList) {
		if(pmidListError) {
			console.error('pmidListError',pmidListError);
			res.send(pmidListError);
		}else if(pmidList){
			ncbi.titleAndIdsViaPmidList(pmidList,function(resultError,result){
				if(resultError){
					console.error('titles_and_all_ids',resultError);
				}else{
					res.send(result)
				}
			});
		}
	});
});
app.get('/pubmed/ids_via_pii/:journalname/:pii', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	var journalName = req.params.journalname;
	var pii = req.params.pii;
	var journalIssn = journalSettings[journalName].issn;
	console.log('.. get IDs for PII ' + pii + ' in ' + journalName);
	ncbi.getIdsViaPii(journalIssn, pii, function(pubMedError, pubMedRes) {
		if(pubMedError) {
			console.error('ids_via_pii',pubMedError);
			res.send(pubMedError);
		}else if(pubMedRes){
			if(!pubMedRes.ids.pii){
				pubMedRes.ids.pii = pii;
			}
			res.send(pubMedRes)
		}
	});
});
app.get('/ncbi/article_count/:db/:journalname/', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	var journalName = req.params.journalname;
	var pii = req.params.pii;
	var ncbiDb = req.params.db;
	var journalIssn = journalSettings[journalName].issn;
	console.log('.. ' +ncbiDb+ ' article count for ' + journalName);
	ncbi.articleCount(ncbiDb, journalIssn, function(pubMedError, pubMedRes) {
		if(pubMedError) {
			console.error('pubmed article_count',pubMedError);
			res.send(pubMedError);
		}else if(pubMedRes){
			res.send(pubMedRes)
		}
	});
});

// Paperchase Queries
// ---------------------------------------
app.get('/article_count/:journalname', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	var journalName = req.params.journalname;
	console.log('.. article_count : ' + journalName);
	paperchase.articleCount(journalName, function(countErr, count) {
		if(countErr) {
			console.error('ERROR:');
			res.sendStatus(JSON.stringify(countErr));
		}else if(count){
			res.sendStatus(count,200);
		}
	});
});

// Paperchase Setup
// ---------------------------------------
// Legacy: for when PubMed XML does not contain PII, use the legacy DB to get PII/title and use PubMed to get PMID/title. Matched PII/PMID will be pushed to an array. Then this will be used to create the output pairs file. Unmatched PMID are logged in the console
app.get('/pmid_pii_pairs/:journalname', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader("Access-Control-Allow-Origin", "*");
	var journalName = req.params.journalname;
	console.log('.. crawl : ' + journalName);
	ncbi.allArticlesTitleAndPMID(journalName, journalSettings, function(titlesErr, pmidAndTitles) {
		if(titlesErr) {
			console.error('ERROR:');
			res.send(JSON.stringify(titlesErr));
		}
		if(pmidAndTitles){
			// console.log('crawlXmlRes');console.log(crawlXmlRes);
			// res.send(JSON.stringify(titles));
			legacy.getAllArticlesIdAndTitle(journalName, function(legacyArticles, mysqlErr ){
				if(mysqlErr){
					console.error('ERROR');
					console.error(mysqlErr);
				}
				if(legacyArticles){
					// console.log('legacyArticles count = ' + legacyArticles.length);
					// now we have PII/title via legacy AND PMID/title from PubMed. Now compare titles and create pairs file
					// loop throug PubMed array, because this will have less than legacy DB. Also, we are submitting to PubMed, so we can only submit pairs file for when PMID exists
					shared.matchPmidAndPii(pmidAndTitles,legacyArticles,journalName,function(matchError,piiPmidPairs){
						if(matchError){
							console.error(matchError);
						}
						if(piiPmidPairs){
							var pairsFile = '';
							for(var matched=0 ; matched < piiPmidPairs.length ; matched++){
								if(piiPmidPairs[matched].pii){
									pairsFile += piiPmidPairs[matched].pmid + '            ' + piiPmidPairs[matched].pii + '\n';
								}
							}
							res.send(pairsFile);
						}
					})
				}
			})
		}
	});
});
app.get('/pmid_doi_pairs/:journalname', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader("Access-Control-Allow-Origin", "*");
	var journalName = req.params.journalname;
	console.log('.. PMID/DOI Pairs for : ' + journalName);
	ncbi.allArticlesTitleAndPMID(journalName, journalSettings, function(titlesErr, pmidAndTitles) {
		if(titlesErr) {
			console.error('ERROR:');
			res.send(JSON.stringify(titlesErr));
		}
		if(pmidAndTitles){
			// console.log('crawlXmlRes');console.log(crawlXmlRes);
			// res.send(JSON.stringify(titles));
			legacy.getAllArticlesIdAndTitle(journalName, function(legacyArticles, mysqlErr ){
				if(mysqlErr){
					console.error('ERROR');
					console.error(mysqlErr);
				}
				if(legacyArticles){
					// console.log('legacyArticles count = ' + legacyArticles.length);
					// now we have PII/title via legacy AND PMID/title from PubMed. Now compare titles and create pairs file
					// loop throug PubMed array, because this will have less than legacy DB. Also, we are submitting to PubMed, so we can only submit pairs file for when PMID exists
					shared.matchPmidAndPii(pmidAndTitles,legacyArticles,journalName,function(matchError,piiPmidPairs){
						if(matchError){
							console.error(matchError);
						}
						if(piiPmidPairs){
							updateIndexers.createPmidDoiPairsFile(journalName, piiPmidPairs,function(error,pairsFile){
								if(error){
									console.error(error);
									res.send(error);
								}else if(pairsFile){
									res.send(pairsFile);
								}
							});
						}
					})
				}
			})
		}
	});
});
// Articles Collection: for getting PMID, PII, title into MongoLab DB. Sends to Paperchase to insert so that _id has same type. Via shell _id is Object. Via Mongo default is strig. the rest of the data is process in Paperchase via articleMethods.processXML
app.get('/initiate_articles_collection/:journalname',function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader("Access-Control-Allow-Origin", "*");
	var journalName = req.params.journalname;

	var unmatched = [];
	console.log('.. initiate DB : ' + journalName);
	ncbi.allArticlesTitleAndIds(journalName, journalSettings, function(titlesErr, pubMedIdsAndTitles) {
		if(titlesErr) {
			console.error('ERROR',titlesErr);
			res.send(JSON.stringify(titlesErr));
		}else if(pubMedIdsAndTitles){
			// res.send(pubMedIdsAndTitles);
			// we have all the titles/pmid from PubMed. Now query the production MySQL DB
			if(journalSettings.mysql){ // legacy DB
				legacy.getAllArticlesIdAndTitle(journalName, function(productionArticles, mysqlErr ){
					if(mysqlErr){
						console.error('ERROR',mysqlErr);
					}else if(productionArticles){
						// now we have PII/title via production AND PMID/title from PubMed. Now compare titles to pair PII to PMID
						// loop throug PubMed array, because this will have less than production DB. Also, we are submitting to PubMed, so we can only submit pairs file for when PMID exists
						shared.matchPmidAndPii(pubMedIdsAndTitles,productionArticles,journalName,function(matchError,piiPmidPairs){
							if(matchError){
								console.error(matchError);
							}else if(piiPmidPairs){
								// console.log('piiPmidPairs',piiPmidPairs)
								res.send(piiPmidPairs);
							}
						})
					}
				})
			}else{
				res.send(pubMedIdsAndTitles); // No Legacy DB. Use PubMed to setup articles collection
			}

		}
	});
});
// Epub dates
app.get('/articles_epub_legacy/:journalname',function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	var journalName = req.params.journalname;
	console.log('.. Get article dates for : ' + journalName);
	legacy.getArticleDates(journalName, function(articleDatesErr, articleDates) {
		if(articleDatesErr) {
			console.error('ERROR',articleDatesErr);
			res.send(JSON.stringify(articleDatesErr));
		}else if(articleDates){
			res.send(articleDates);
		}
	});
});
// PubMed fill in aricles
app.get('/fill_in_articles_from_pubmed/:journalname',function(req, res) {

	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Connection', 'keep-alive');
	var journalName = req.params.journalname;

	console.log('.. Fill in article for : ' + journalName);
	// get articles from PubMed that are missing in Paperchase
	// res.setTimeout(120000, function(){
		var result = {};
		var paperchaseByPii = {};
		var paperchasePmidList = [];
		result.paperchaseWithoutPmid = []; // all Paperchase articles without PMID
		result.paperchaseUpdatePmid = []; // Paperchase articles without PMID but one found
		result.missingInPaperchase = []; // no record at all found via PII check

		paperchase.allArticles(journalName, {}, {ids:true}, function(paperchaseArticlesError,paperchaseArticles){
			if(paperchaseArticlesError) {
				console.error('paperchaseArticlesError',paperchaseArticlesError);
			}else if(paperchaseArticles){
				console.log('Paperchase All Articles = ' + paperchaseArticles.length);
				// paperchaseByPii
				paperchaseArticles.forEach(function(paperchaseA){
					if(paperchaseA.ids.pii){
						paperchaseByPii[paperchaseA.ids.pii] = paperchaseA;
					}
					if(!paperchaseA.ids.pmid){
						// console.log('missing pmid: ',paperchaseA.ids);
						result.paperchaseWithoutPmid.push(paperchaseA);
					}else{
						paperchasePmidList.push(paperchaseA.ids.pmid);
					}
				});
				var journalIssn = journalSettings[journalName].issn
				ncbi.getPmidListForIssn(journalIssn, function(pmidListErr, pubMedPmidList) {
					if(pmidListErr) {
						console.error('ERROR',pmidListErr);
					}else if(pubMedPmidList){
						// using this to compare articles in paperchase, legacy and pubmed.
						// pubMedPmidList = shared.arrayRemoveDuplicate(pubMedPmidList); //PubMed API was returning an article twice, so remove duplicates to avoid this function thinking the pmid is missing
						console.log(result.paperchaseWithoutPmid.length + ' = Paperchase Articles without PMID ');
						console.log(paperchasePmidList.length + ' = Paperchase Articles with PMID ');
						console.log(pubMedPmidList.length + ' = PubMed' );
						var missingInPaperchase = shared.arrayIntegersDifferences(paperchasePmidList,pubMedPmidList);
						console.log(missingInPaperchase.length + ' = missingInPaperchase ');
						if(missingInPaperchase){
							ncbi.infoViaPmidList(missingInPaperchase,function(pubMedInfoError,pubMedList){
								if(pubMedInfoError){
									console.error('pubMedInfoError',pubMedInfoError);
								}else if(pubMedList){
									// console.log('pubMedList = ' + pubMedList.length);
									if(result.paperchaseWithoutPmid){
										// try to match articles in paperchase without PMID to new records from PubMed
										pubMedList.forEach(function(pubmedArticle, idx){
											if(pubmedArticle.ids.pii && paperchaseByPii[pubmedArticle.ids.pii]){
												pubmedArticle.ids.mongo_id = paperchaseByPii[pubmedArticle.ids.pii]._id;
												result.paperchaseUpdatePmid.push(pubmedArticle);
												pubMedList.splice(idx,1);
											}
										});
									}else{
										// console.log('no paperchase articles without pmid');
									}
									if(pubMedList.length > 0 ){
										result.missingInPaperchase = pubMedList;
									}
									res.send(result);
								}
							});
						}else{
							// None missing in Paperchase
							res.send(result);
						}
					}
				});
			}
		});
	// });
});
// Legacy fill in articles
app.get('/fill_in_articles_from_legacy/:journalname',function(req, res) {

	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Connection', 'keep-alive');
	var journalName = req.params.journalname;

	console.log('.. Fill in article for : ' + journalName);
	// get articles from legacy DB that are missing in Paperchase
	var addToPaperchase = [];
	var paperchaseByPii = {};
	var paperchasePmidList = [];
	var legacyArticleIdField = journalSettings[journalName].mysql.articlesTable.articleId;
	var legacyArticleTitleField = journalSettings[journalName].mysql.articlesTable.articleTitle;

	paperchase.allArticles(journalName, {}, {ids:true}, function(paperchaseArticlesError,paperchaseArticles){
		if(paperchaseArticlesError) {
			console.error('paperchaseArticlesError',paperchaseArticlesError);
		}else if(paperchaseArticles){
			console.log('Paperchase All Articles = ' + paperchaseArticles.length);
			// paperchaseByPii
			paperchaseArticles.forEach(function(paperchaseA){
				if(paperchaseA.ids.pii){
					paperchaseByPii[paperchaseA.ids.pii] = paperchaseA;
				}
			});
			legacy.getAllArticlesIdAndTitle(journalName, function(legacyArticles, mysqlErr ){
				if(mysqlErr){
					console.error('ERROR');
					console.error(mysqlErr);
				}else if(legacyArticles){
					console.log('Legacy All Articles = ' + legacyArticles.length);
					legacyArticles.forEach(function(legacyArticle){
						if(legacyArticle[legacyArticleIdField] && !paperchaseByPii[legacyArticle[legacyArticleIdField]]){
							var paperchaseObj = {
								'pii' : legacyArticle[legacyArticleIdField],
								'title' : legacyArticle[legacyArticleTitleField]
							}
							addToPaperchase.push(paperchaseObj);
						}
					});
					res.send(addToPaperchase);
				}
			});

		}
	});
});
app.get('/article_ids_via_pmid/:pmid', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	var pmid = req.params.pmid;
	console.log('.. get IDs for PMID ' + pmid);
	ncbi.getArticleTitleAndIdsFromPmid(pmid, function(ncbiError, ncbiRes) {
		if(ncbiError) {
			console.error('ncbiError',ncbiError);
			res.send(JSON.stringify(crawlXmlErr));
		} else {
			res.send(ncbiRes);
		}
	});
});
app.get('/article_info_via_pmid/:pmid', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	var pmid = req.params.pmid;
	console.log('.. get Info for PMID ' + pmid);
	ncbi.getArticleInfoFromPmid(pmid, function(ncbiError, ncbiRes) {
		if(ncbiError) {
			console.error('ncbiError',ncbiError);
			res.send(JSON.stringify(crawlXmlErr));
		} else {
			res.send(ncbiRes);
		}
	});
});



app.listen(4932, function(){

});
console.log("Server started");
