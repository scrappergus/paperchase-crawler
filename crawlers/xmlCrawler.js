var config = require('../config');
var ncbi = require('../methods/ncbi');
var shared = require('../methods/shared');
var assets = require('../methods/assets');

var fs = require('fs');
var async = require('async');
var MongoClient = require('mongodb').MongoClient;
var xml2js = require('xml2js');
var request = require('request');
var express = require('express');
var journalSettings = config.journalSettings;
var paperchase = require('../methods/paperchase');

function getXmlStringFromUrl(xmlUrl, cb) {
	request(xmlUrl, function(err, res, body) {
		cb(null, body);
	});
}

function getIdsJsonFromPubMedXml(xml_string, cb) {
	console.log('... getIdsJsonFromPubMedXml');
	xml2js.parseString(xml_string, function(parse_err, parse_res) {
		var idList = parse_res.PubmedArticleSet.PubmedArticle[0].PubmedData[0].ArticleIdList[0].ArticleId;
		formatIdList(idList,cb);
	});
}

function getIdsJsonFromPmcXml(xmlString, cb) {
	// console.log('... getIdsJsonFromPmcXml');
	xml2js.parseString(xmlString, function(parseError, parseRes) {
		if(parseError){
			console.error('parseError',parseError);
		}else if(parseRes){
			var idList = parseRes['pmc-articleset']['article'][0]['front'][0]['article-meta'][0]['article-id'];
			// Get the JSON is the schema we want.
			idList = massagePmcIdList(idList,function(massageError,massageRes){
				if(massageError){
					console.error('massageError',massageError);
					cb(null);
				}else if(massageRes){
					cb(null,massageRes);
				}
			});
		}
	});
}

function formatIdList(idList,cb){
	// console.log('..formatIdList',idList);
	var idObject = {};
	for(var i=0; i<idList.length ; i++){
		var id,
			idType,
			idValue;
		id = idList[i];
		idType = id['$']['IdType'];
		idValue = id._;
		idObject[idType] = idValue;
	}
	// console.log(JSON.stringify(idObject));
	cb(null,idObject);
}

function massage_articleid_list(idlist, cb) {
	// console.log('... massage_articleid_list ');
	// console.log(idlist);
	async.map(idlist, function(id, map_cb){
		map_cb(null, {type: id.$.IdType, id: id._});
	}, function(err, res){
		// console.log(res);
		cb(null, res);
	});
}

function massagePmcIdList(idlist, cb) {
	// console.log('... massagePmcIdList ',idlist);
	async.map(idlist, function(id, map_cb){
		var typeObj = {};
		var type = id['$']['pub-id-type'];
		typeObj['type'] = type;
		typeObj['id'] = id._;
		map_cb(null, typeObj);
	}, function(err, idList){
		// console.log('idList',idList);
		if(err){
			console.error('Massage PMC ID list error',err);
		}else if(idList){
			var idObject = {};
			for(var i=0; i<idList.length ; i++){
				var id,
					idType,
					idValue;
				id = idList[i];
				idType = id['type'];
				idValue = id['id'];
				idObject[idType] = idValue;
			}
			cb(null,idObject);
		}
	});
}

function get_pmcid_from_idlist(idlist, cb) {
	// console.log('... get_pmcid_from_idlist');
	// This will loop though all IDs retrieved from PubMed abstract/citation XML to just get the PMC ID, which will then be used to get the full text XML
	async.filterSeries(idlist, function(id, filter_cb){
		// console.log('.... ' + JSON.stringify(id));
		filter_cb((id.type == "pmc"));
	}, function(res){
		if(res.length < 1) cb("no PMCID, skipping");
		else cb(null, res[0].id);
	});
}


function getPiiFromIdList(idlist, cb) {
	// console.log('... get_pmii_from_idlist');
	// This will loop though all IDs retrieved from PubMed abstract/citation XML to just get the PMC ID, which will then be used to get the full text XML
	async.filterSeries(idlist, function(id, filter_cb){
		// console.log('.... ' + JSON.stringify(id));
		filter_cb((id.type == 'pii'));
	}, function(res){
		if(res.length < 1) cb('no PII, skipping');
		else cb(null, res[0].id);
	});
}

function getPubMedAbstractXml(pmid,cb){
	console.log('... getPubMedAbstractXml : ' + pmid);
	var abstractUrl = 'http://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi/?db=pubmed&report=xml&id=' + pmid;
	getXmlStringFromUrl(abstractUrl, function(xmlAbstractError,xmlAbstractRes){
		if(xmlAbstractError){
			console.error('xmlAbstractError',xmlAbstractError);
			cb(xmlAbstractError);
		}else if(xmlAbstractRes){
			// console.log('xmlAbstractRes',xmlAbstractRes);
			cb(null,xmlAbstractRes);
		}
	})
}

function getArticleIdsFromPubMedAbstract(pmid,cb){
	console.log('... getArticleIdsFromPubMedAbstract : PMID ' + pmid );
	getPubMedAbstractXml(pmid,function(abstarctError,abstractRes){
		if(abstarctError){
			console.log('     Cannot get abstarct : PMID = ' + pmid);
			console.error('abstarctError',abstarctError);
		}else if(abstractRes){
			// now we have the abstract XML string. Get the IDs
			getIdsJsonFromPubMedXml(abstractRes,function(idsJsonError,idsJsonRes){
				if(idsJsonError){
					console.error('idsJsonError',idsJsonError);
				}else if(idsJsonRes){
					console.log('idsJsonRes',idsJsonRes);
					cb(null,idsJsonRes);
				}
			});
		}
	});
}

function verifyFullTextXml(xmlString, cb){
	// console.log('..verifyFullTextXml');
	getIdsJsonFromPmcXml(xmlString,function(error,res){
		if(error){
			console.error('IDS from PMC',error);
			cb(null);
		}else if(res){
			cb(null,res); //if there are IDs then it is valid XML. There will be at least PMC ID if this is real full text XML.
		}
	});
}

function getAndSavePmcXml(articleIds, journal, cb){
	// console.log('..getAndSavePmcXml', articleIds);
	if(articleIds.pmc){
		console.log('... getAndSavePmcXml :  PMC ' + articleIds.pmc);
		// Query PMC to get Full Text XML
		// XML full text filename based on paperchase Mongo ID.
		var fullTextXmlFilename = articleIds.mongo_id + '.xml';

		var fullXmlUrl = 'http://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi/?db=pmc&report=xml&id=' + articleIds.pmc;
		// console.log('     Upload: ' + fullTextXmlFilename + '. PMID: ' + articleIds.pmid + '. PMC XML: ' + fullXmlUrl);
		getXmlStringFromUrl(fullXmlUrl, function(fullXmlErr, fullXmlBody){
			async.series([
				function(scb) {
					if(fullXmlErr){
						console.error('fullXmlErr');
					}else if(fullXmlBody){
						// Verify that it is full text XML. Because we will still get XML if <Code>AccessDenied</Code>
						// Upload Full Text XML
						verifyFullTextXml(fullXmlBody,function(xmlVerifiedError,xmlVerifiedRes){
							if(xmlVerifiedError){
								console.error('xmlVerifiedError',xmlVerifiedError);
							}else if(xmlVerifiedRes){
								assets.saveLocallyAndUploadFile(journal, fullTextXmlFilename, fullXmlBody, 'xml',scb)
							}
						});
					}
				}
			],function(series_err, series_res){
				if(series_err) {
					console.error('series_err',series_err);
					cb(series_err);
				} else {
					var returnObj = {
						ids: articleIds,
						xml_url: 'http://s3-us-west-1.amazonaws.com/paperchase-' + journal + '/xml/' + series_res[0] // TODO: S3 assets method should return public URL
					}
					console.log('    Upload success: ' + series_res[0]);
					cb(null, returnObj);
				}
			});
		});
	}else{
		// cannot get Full Text without a PMC ID
		cb(null,null);
	}
}

function getArticlesAndSaveXml(journal, pmid, paperchaseArticles, cb) {
	//paperchaseArticles is used to match PMID to paperchase data
	if(paperchaseArticles[pmid]){
		getAndSavePmcXml(paperchaseArticles[pmid], journal, function(uploadXmlError,uploadXmlRes){
			if(uploadXmlError){
				console.error('uploadXmlError',uploadXmlError);
				cb(true,uploadXmlError);
			}else if(uploadXmlRes){
				cb(null,uploadXmlRes);
			}else{
				cb(null);
			}
		});
	}else{
		// console.log('    MISSING In Paperchase : PMID = ' + pmid);
		cb('Not in Paperchase: PMID ' + pmid);
	}
}



module.exports = {
	batchByJournal: function(journal,cbBatch){
		// This will just batch save the XML to S3. It will NOT update the Paperchase DB. It will send JSON to Paperchase to update the DB.
		var journalDb = journalSettings[journal].dbUrl,
			journalIssn = journalSettings[journal].issn;
		// First get all the PMID from PubMed via journal ISSN
		ncbi.getPmidListForIssn(journalIssn, function(pubMedError, pubMedArticles){
				// console.log('     Article Count: ' + pubMedArticles.length);
				if(pubMedArticles){
					// get {PMID: All_Article_IDs} from Paperchase DB
					paperchase.allPmidAndPaperchaseIdPairs(journal,function(paperchaseArticlesError,paperchaseArticles){
						if(paperchaseArticlesError){
							console.error('paperchaseArticlesError',paperchaseArticlesError);
						}else if(paperchaseArticles){
							// console.log('paperchaseArticles',paperchaseArticles);
							async.mapSeries(pubMedArticles, function(pmid, map_cb){
								console.log('-- PMID: ' + pmid);
								getArticlesAndSaveXml(journal, pmid, paperchaseArticles, function(articleXmlErr, articleXmlRes){
									if(articleXmlErr) {
										console.error('     ERROR',articleXmlErr);
										map_cb();
									}else{
										// console.log('articleXmlRes',articleXmlRes);
										map_cb(null, articleXmlRes);
									}
								});
							}, function(mapErr, articlesXmlList){
								if(mapErr) {
									console.error('     ERROR:', mapErr);
									cbBatch(mapErr);
								} else {
									// articlesXmlList = list of all XML uploaded to S3. Contains article IDs and XML URLs
									// All XML uploaded. Now return the array of articles to Paperchase to then update the DB
									articlesXmlList = shared.removeEmptyFromArray(articlesXmlList);
									console.log('articlesXmlList',articlesXmlList);
									cbBatch(null, articlesXmlList); // remove empty before returning to Paperchase
								}
							});
						}
					});
				}
		});
	},
	getByArticle: function(journal, articleMongoId, cb){
		// console.log('..getByArticle: ' + articleMongoId);
		paperchase.getArticle(journal, {_id : articleMongoId}, {ids : 1}, function(paperchaseError,paperchaseArticle){
			if(paperchaseError){
				console.error('paperchaseError',paperchaseError);
			}else if(paperchaseArticle){
				// console.log('paperchaseArticle',paperchaseArticle);
				paperchaseArticle.ids.mongo_id = paperchaseArticle._id;
				getAndSavePmcXml(paperchaseArticle.ids, journal, function(uploadXmlError,uploadXmlRes){
					if(uploadXmlError){
						console.error('uploadXmlError',uploadXmlError);
						cb(true,uploadXmlError);
					}else if(uploadXmlRes){
						cb(null,uploadXmlRes);
					}else{
						cb(null);
					}
				});
			}
		});
	}
}