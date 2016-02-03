var fs = require('fs');
var async = require('async');
var request = require('request');
var express = require('express');
var MongoClient = require('mongodb').MongoClient;
// Custom
var config = require('./config');
var shared = require('./methods/shared');
var journalSettings = config.journalSettings;
var xmlCrawler = require('./crawlers/xmlCrawler');
var pdfCrawler = require('./crawlers/pdfCrawler');
var ncbi = require('./methods/ncbi');
var legacy = require('./methods/legacy');
var paperchase = require('./methods/paperchase');
var crossRef = require('./methods/crossRef');

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

// -- Begin Deprecated
// function get_journal_xml_data(journal_name, cb) {
// 	var collection_name = journal_name+"_xml";
// 	mongo_query(journal_name, collection_name, {}, cb);
// }

// function get_xml_data_by_pii(journal_name, pii, cb) {
// 	var query = {
// 		'ids': {
// 			'type': 'pii',
// 			'id': pii
// 		}};
// 	mongo_query(journal_name, 'xml', query, cb);
// }

// function get_figures_by_pii(journal_name, pii, cb) {
// 	var query = {"ids": {"type": "pii", "id": pii}};
// 	mongo_query(journal_name, 'figures', query, cb);
// }

// function get_pdf_by_pii(journal_name, pii, cb) {
// 	var query = {"ids": {"type": "pii", "id": pii}};
// 	mongo_query(journal_name, 'pdfs', query, cb);
// }

// function get_xml_with_files_by_pii(journal_name, pii, cb) {
// 	console.log('get_xml_with_files_by_pii');
// 	console.log(journal_name + ' : pii = ' + pii);
// 	async.waterfall([
// 		function(wcb) {
// 			get_xml_data_by_pii(journal_name, pii, wcb);
// 		},
// 		function(xml_data, wcb) {
// 			if(xml_data.length == 0) {
// 				wcb({"error": "No XML data found for this PII."});
// 				return;
// 			};
// 			get_pdf_by_pii(journal_name, pii, function(err, pdf) {
// 				if(pdf.length != 0)xml_data[0].pdf_url = pdf[0].pdf_url;

// 				wcb(null, xml_data);
// 			});
// 		},
// 		function(xml_data, wcb) {
// 			get_figures_by_pii(journal_name, pii, function(err, figure_data) {
// 				if(err) { wcb(err); return; }
// 				if(figure_data.length < 1) { wcb(null, xml_data); return; }
// 				xml_data[0].figures = figure_data[0].figures;
// 				wcb(null, xml_data);
// 			});
// 		}
// 	], cb);
// }

// app.get('/fetchxml/:journalname', function(req, res) {
// 	res.setHeader('Content-Type', 'application/json');
// 	var journal_name = req.params.journalname;
// 	get_journal_xml_data(journal_name, function(xml_err, xml_res) {
// 		if(xml_err) {
// 			res.status(500).send(JSON.stringify(xml_err));
// 		} else {
// 			res.send(JSON.stringify(xml_res));
// 		}
// 	});
// });

// app.get('/fetchxml/:journalname/pii/:pii', function(req, res) {
// 	res.setHeader('Content-Type', 'application/json');
// 	var journal_name = req.params.journalname;
// 	var pii = req.params.pii;
// 	get_xml_data_by_pii(journal_name, pii, function(xml_err, xml_res) {
// 		if(xml_err) {
// 			res.status(500).send(JSON.stringify(xml_err));
// 		} else {
// 			res.send(JSON.stringify(xml_res));
// 		}
// 	});
// });

// app.get('/fetchfigures/:journalname/pii/:pii', function(req, res) {
// 	res.setHeader('Content-Type', 'application/json');
// 	var journal_name = req.params.journalname;
// 	var pii = req.params.pii;
// 	get_figures_by_pii(journal_name, pii, function(xml_err, xml_res) {
// 		if(xml_err) {
// 			res.status(500).send(JSON.stringify(xml_err));
// 		} else {
// 			res.send(JSON.stringify(xml_res));
// 		}
// 	});
// });

// app.get('/xmlfigures/:journalname/pii/:pii', function(req, res) {
// 	res.setHeader('Content-Type', 'application/json');
// 	res.setHeader("Access-Control-Allow-Origin", "*");
// 	var journal_name = req.params.journalname;
// 	var pii = req.params.pii;
// 	// console.log('.. xmlfigures : ' + pii);
// 	get_xml_with_files_by_pii(journal_name, pii, function(xml_err, xml_res) {
// 		if(xml_err) {
// 			res.send(JSON.stringify(xml_err));
// 		} else {
// 			res.send(JSON.stringify(xml_res));
// 		}
// 	});
// });
// -- End Deprecated

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
	})
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
	// this takes too long to response for large journals
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
			res.send(pubMedRes)
		}
	});
});
app.get('/ncbi/:db/article_count/:journalname/', function(req, res) {
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
								pairsFile += piiPmidPairs[matched]['pmid'] + '            ' + piiPmidPairs[matched]['pii'] + '\n';
							}
							res.send(pairsFile);
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
app.get('/fill_in_articles_from_pubmed/:journalname',function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	var journalName = req.params.journalname;
	console.log('.. Fill in article dates for : ' + journalName);
	// get articles from PubMed and legacy DB that are missing in Paperchase

	var result = {};
	result.paperchaseWithoutPmid = []; // all Paperchase articles without PMID
	result.paperchaseWithoutPmidUpdate = []; // Paperchase articles without PMID but one found
	result.missingInPaperchase = []; // no record at all found via PII check


	paperchase.allArticles(journalName, {}, {ids:true}, function(paperchaseArticlesError,paperchaseArticles){
		if(paperchaseArticlesError) {
			console.error('paperchaseArticlesError',paperchaseArticlesError);
		}else if(paperchaseArticles){
			console.log('Paperchase All Articles = ' + paperchaseArticles.length);
			var journalIssn = journalSettings[journalName].issn
			ncbi.getPmidListForIssn(journalIssn, function(pmidListErr, pmidList) {
				if(pmidListErr) {
					console.error('ERROR',pmidListErr);
				}else if(pmidList){
					// console.log('paperchaseArticles',paperchaseArticles);
					// if(paperchaseArticles.length < pmidList.length){
						var paperchasePmidList = [];
						for(var article=0 ; article<paperchaseArticles.length ; article++){
							if(paperchaseArticles[article].ids.pmid){
								paperchasePmidList.push(paperchaseArticles[article].ids.pmid);
							}else{
								paperchaseArticles[article].ids._id = paperchaseArticles[article]._id;
								result.paperchaseWithoutPmid.push(paperchaseArticles[article].ids);
							}
						}
					// }
					// using this to compare articles in paperchase, legacy and pubmed. PubMed API was returning an article twice, so remove duplicates to avoid this function thinking the pmid is missing
					pmidList = shared.arrayRemoveDuplicate(pmidList);
					console.log('Paperchase Articles w/PMID = ' + paperchasePmidList.length + '. PMID = ' + pmidList.length);
					// console.log('Paperchase = ' + paperchasePmidList.length + '. PMID = ' + pmidList.length);
					var missingInPaperchase = shared.arrayIntegersDifferences(pmidList,paperchasePmidList);
					console.log('paperchaseWithoutPmid',result.paperchaseWithoutPmid);
					console.log('missingInPaperchase',missingInPaperchase);
					if(missingInPaperchase){
						ncbi.titleAndIdsViaPmidList(missingInPaperchase,function(pubMedInfoError,pubMedList){
							if(pubMedInfoError){
								console.error('pubMedInfoError',pubMedInfoError);
							}else if(pubMedList){
								console.log('pubMedList',pubMedList);
								if(result.paperchaseWithoutPmid){
									for(var pcArticle=0 ; pcArticle<result.paperchaseWithoutPmid.length ; pcArticle++){
										console.log(result.paperchaseWithoutPmid[pcArticle]);
										if(result.paperchaseWithoutPmid[pcArticle].pii){
											for(var pmArticle=0 ; pmArticle < pubMedList.length ; pmArticle++){
												// TODO: more checks than just PII when article in Paperchase without
												// PII Check
												if(pubMedList[pmArticle].ids.pii && pubMedList[pmArticle].ids.pii == result.paperchaseWithoutPmid[pcArticle].pii){
													// article in paperchase DB but no PMID saved
													result.paperchaseWithoutPmid[pcArticle].pmid = pubMedList[pmArticle].ids.pmid;
													result.paperchaseWithoutPmidUpdate.push(result.paperchaseWithoutPmid[pcArticle]);
													delete pubMedList[pmArticle];
												}
											}
										}
									}
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


app.listen(4932, function(){

});
console.log("Server started");