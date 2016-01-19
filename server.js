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
var ncbi = require('./methods/ncbi');
var production = require('./production');
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

function get_journal_xml_data(journal_name, cb) {
	var collection_name = journal_name+"_xml";
	mongo_query(journal_name, collection_name, {}, cb);
}

function get_xml_data_by_pii(journal_name, pii, cb) {
	var query = {
		'ids': {
			'type': 'pii',
			'id': pii
		}};
	mongo_query(journal_name, 'xml', query, cb);
}

function get_figures_by_pii(journal_name, pii, cb) {
	var query = {"ids": {"type": "pii", "id": pii}};
	mongo_query(journal_name, 'figures', query, cb);
}

function get_pdf_by_pii(journal_name, pii, cb) {
	var query = {"ids": {"type": "pii", "id": pii}};
	mongo_query(journal_name, 'pdfs', query, cb);
}

function get_xml_with_files_by_pii(journal_name, pii, cb) {
	console.log('get_xml_with_files_by_pii');
	console.log(journal_name + ' : pii = ' + pii);
	async.waterfall([
		function(wcb) {
			get_xml_data_by_pii(journal_name, pii, wcb);
		},
		function(xml_data, wcb) {
			if(xml_data.length == 0) {
				wcb({"error": "No XML data found for this PII."});
				return;
			};
			get_pdf_by_pii(journal_name, pii, function(err, pdf) {
				if(pdf.length != 0)xml_data[0].pdf_url = pdf[0].pdf_url;

				wcb(null, xml_data);
			});
		},
		function(xml_data, wcb) {
			get_figures_by_pii(journal_name, pii, function(err, figure_data) {
				if(err) { wcb(err); return; }
				if(figure_data.length < 1) { wcb(null, xml_data); return; }
				xml_data[0].figures = figure_data[0].figures;
				wcb(null, xml_data);
			});
		}
	], cb);
}

app.get('/fetchxml/:journalname', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	var journal_name = req.params.journalname;
	get_journal_xml_data(journal_name, function(xml_err, xml_res) {
		if(xml_err) {
			res.status(500).send(JSON.stringify(xml_err));
		} else {
			res.send(JSON.stringify(xml_res));
		}
	});
});

app.get('/fetchxml/:journalname/pii/:pii', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	var journal_name = req.params.journalname;
	var pii = req.params.pii;
	get_xml_data_by_pii(journal_name, pii, function(xml_err, xml_res) {
		if(xml_err) {
			res.status(500).send(JSON.stringify(xml_err));
		} else {
			res.send(JSON.stringify(xml_res));
		}
	});
});

app.get('/fetchfigures/:journalname/pii/:pii', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	var journal_name = req.params.journalname;
	var pii = req.params.pii;
	get_figures_by_pii(journal_name, pii, function(xml_err, xml_res) {
		if(xml_err) {
			res.status(500).send(JSON.stringify(xml_err));
		} else {
			res.send(JSON.stringify(xml_res));
		}
	});
});

app.get('/xmlfigures/:journalname/pii/:pii', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader("Access-Control-Allow-Origin", "*");
	var journal_name = req.params.journalname;
	var pii = req.params.pii;
	// console.log('.. xmlfigures : ' + pii);
	get_xml_with_files_by_pii(journal_name, pii, function(xml_err, xml_res) {
		if(xml_err) {
			res.send(JSON.stringify(xml_err));
		} else {
			res.send(JSON.stringify(xml_res));
		}
	});
});

// Batch crawler
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

// DOI Status - for ALL articles in journal
app.get('/doi_status/:journalname/', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader("Access-Control-Allow-Origin", "*");
	var journalName = req.params.journalname;
	console.log('...fetching status for : ' + journalName);
	var journalPiiList = paperchase.allArticlesIds(journalName, function(articlesError, articles) {
		if(articlesError){
			console.error(articlesError);
			res.send('ERROR : ' + JSON.stringify(articlesError));
		}
		if(articles){
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
				}
			});
		}
	});
});

// Article
// ------------------------
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


// Get PMID/Title pair bia PubMed
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


app.get('/article_count/:journalname', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader("Access-Control-Allow-Origin", "*");
	var journalName = req.params.journalname;
	console.log('.. article_count : ' + journalName);
	paperchase.articleCount(journalName, function(countErr, count) {
		if(countErr) {
			console.error('ERROR:');
			res.sendStatus(JSON.stringify(countErr));
		}
		if(count){
			res.sendStatus(count,200);
		}
	});
});


// for when PubMed XML does not contain PII, use the production DB to get PII/title and use PubMed to get PMID/title.
// Matched PII/PMID will be pushed to an array. Then this will be used to create the output pairs file.
// Unmatched PMID are logged in the console
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
			production.getAllArticlesIdAndTitle(journalName, function(productionArticles, mysqlErr ){
				if(mysqlErr){
					console.error('ERROR');
					console.error(mysqlErr);
				}
				if(productionArticles){
					// console.log('production articles count = ' + productionArticles.length);
					// console.log(productionArticles);
					// now we have PII/title via production AND PMID/title from PubMed. Now compare titles and create pairs file
					// loop throug PubMed array, because this will have less than production DB. Also, we are submitting to PubMed, so we can only submit pairs file for when PMID exists
					shared.matchPmidAndPii(pmidAndTitles,productionArticles,journalName,function(matchError,piiPmidPairs){
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

// for getting PMID, PII, title into MongoLab DB. Sends to Paperchase to insert so that _id has same type. Via shell _id is Object. Via Mongo default is strig.
// the rest of the data is process in Paperchase via articleMethods.processXML
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
			production.getAllArticlesIdAndTitle(journalName, function(productionArticles, mysqlErr ){
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
		}
	});
});




app.listen(4932, function(){

});
console.log("Server started");