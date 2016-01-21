var config = require('../config');
var ncbi = require('../methods/ncbi');
var shared = require('../methods/shared');

var fs = require('fs');
var s3 = require('s3');
var async = require('async');
var MongoClient = require('mongodb').MongoClient;
var xml2js = require('xml2js');
var request = require('request');
var express = require('express');
var journalSettings = config.journalSettings;
var paperchase = require('../methods/paperchase');

var s3Client = s3.createClient({
	s3Options: {
		accessKeyId: config.s3.key,
		secretAccessKey: config.s3.secret
	}
});

function getXmlStringFromUrl(xmlUrl, cb) {
	request(xmlUrl, function(err, res, body) {
		cb(null, body);
	});
}

function getIdsJsonFromPubMedXml(xml_string, cb) {
	// console.log('... getIdsFromPubMedXml');
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

function upload_xml_string_as_file_to_s3(journal, xml_string, xml_filename, cb) {
	// console.log('... upload_xml_string_as_file_to_s3 :' + xml_filename);
	var tempdir = './temp';
	var bucket = config.s3.bucket + journal;
	if (!fs.existsSync(tempdir)){
		fs.mkdirSync(tempdir);
	}
	var xml_filepath = tempdir + '/' + xml_filename; // Temporary local path for XML
	// String to XML
	fs.writeFile(xml_filepath, xml_string, function(err){
		if(err) {
			cb(err);
		} else {
			// Upload XML to S3
			var uploader = s3Client.uploadFile({
				localFile: xml_filepath,
				s3Params: {
					Bucket: bucket,
					Key: 'xml/'+xml_filename
				}
			});
			uploader.on('error', function(err) {
				console.error('ERROR');
				console.error(err);
				cb(err)
			});
			uploader.on('progress', function() {
				// console.log('.....'+xml_filename+' progress:', uploader.progressTotal);
				// console.log('..... '+xml_filename+' progress:', Math.round(uploader.progressAmount / uploader.progressTotal * 100) + '% done');
			});
			uploader.on('end', function() {
				var s3url = s3.getPublicUrlHttp(bucket, xml_filename);
				// console.log('..... url : ' + s3url);
				cb(null, s3url);
				fs.unlink(xml_filepath);
			});
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
					// console.log('idsJsonRes',idsJsonRes);
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
	console.log('... getAndSavePmcXml :  PMC' + articleIds.pmc);
	// Query PMC to get Full Text XML
	// XML full text filename based on paperchase_id.
	var fullTextXmlFilename;
	if(articleIds.paperchase_id){
		fullTextXmlFilename = articleIds.paperchase_id + '.xml';
	}
	if(articleIds.pmc){
		var full_xml_url = 'http://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi/?db=pmc&report=xml&id=' + articleIds.pmc;
		// console.log('     Upload: ' + fullTextXmlFilename + '. PMID: ' + articleIds.pmid + '. PMC XML: ' + full_xml_url);
		getXmlStringFromUrl(full_xml_url, function(full_xml_err, full_xml_body){
			async.series([
				function(scb) {
					// Verify that it is full text XML. Because we will still get XML if <Code>AccessDenied</Code>
					// If no paperchase_id, then use DOI or PII in XML, if present, for filename. Otherwise do not upload.
					// Upload Full Text XML
					verifyFullTextXml(full_xml_body,function(xmlVerifiedError,xmlVerifiedRes){
						if(xmlVerifiedError){
							console.error('xmlVerifiedError',xmlVerifiedError);
						}else if(xmlVerifiedRes){
							if(!fullTextXmlFilename){
								// console.log('xmlVerifiedRes',xmlVerifiedRes);
								// not in Paperchase DB. If the xmlVerifiedRes has PII or DOI then use this to create the filename.
								if(xmlVerifiedRes.pii){
									fullTextXmlFilename = xmlVerifiedRes.pii.replace(/\//g,'_') + '.xml';
								}else if(xmlVerifiedRes.doi){
									fullTextXmlFilename = xmlVerifiedRes.doi.replace(/\//g,'_') + '.xml';
								}else{
									fullTextXmlFilename = 'PMC' + xmlVerifiedRes.pmc + '.xml';
									console.log('    Uploading XML as PMC ID filename: ' + fullTextXmlFilename);
								}
							}
							if(fullTextXmlFilename){
								// upload_xml_string_as_file_to_s3(journal, full_xml_body, fullTextXmlFilename, scb);
							}
						}
					});
				}
			],function(series_err, series_res){
				if(series_err) {
					console.error('series_err',series_err);
					cb(series_err);
				} else {
					articleIds.uploaded = true;
					articleIds.full_xml = series_res[0];
					console.log('     Upload success: ' + series_res[0]);
					cb(null, articleIds);
				}
			});
		});
	}else{
		// cannot get Full Text without a PMC ID
		cb(null,null);
	}
}

function getPaperchaseArticlesAndSaveXml(journal, pmid, cb) {
	console.log('... getPaperchaseArticlesAndSaveXml : PMID ' + pmid);
	var articleIds;
	paperchase.getArticlePaperchaseIdsViaPmid(pmid,journal,function(paperchaseIdError,paperchaseIdList){
		if(paperchaseIdError){
			console.error('paperchaseIdError',paperchaseIdError);
		}else if(paperchaseIdList){
			getAndSavePmcXml(paperchaseIdList, journal, function(uploadXmlError,uploadXmlRes){
						if(uploadXmlError){
							console.error('uploadXmlError',uploadXmlError);
							cb(true,uploadXmlError);
						}else if(uploadXmlRes){
							cb(null,uploadXmlRes);
						}
			});
		}else if(!paperchaseIdList){
			// article NOT found in Paperchase DB
			// Query PubMed for ID List
			// still go ahead and upload. but use DOI or PII from XML for filename.
			console.log('    MISSING In Paperchase : PMID = ' + pmid);
			getArticleIdsFromPubMedAbstract(pmid,function(abstractIdsError, abstractIdsRes){
				if(abstractIdsError){
					console.error('abstractIdsError',abstractIdsError);
					console.log('     Cannot get XML : PMID = ' + pmid); // No PMC ID to use
				}else if(abstractIdsRes){
					// console.log('     abstractIdsRes',abstractIdsRes);
					getAndSavePmcXml(abstractIdsRes, journal, function(uploadXmlError,uploadXmlRes){
						if(uploadXmlError){
							console.error('uploadXmlError',uploadXmlError);
							cb(true,uploadXmlError);
						}else if(uploadXmlRes){
							cb(null,uploadXmlRes);
						}
					});
				}
			});
		}
	});
}



module.exports = {
	batchByJournal: function(journal,cbBatch){
		// This will just batch save the XML to S3. It will NOT update the Paperchase DB.
		var journalDb = journalSettings[journal].dbUrl,
			journalIssn = journalSettings[journal].issn;
		MongoClient.connect(journalDb, function(err, db) {
			if(err) {
				console.error('Mongo DB connection Error');
				cb(err);
				return;
			}else{
				// First get all the PMID from PubMed via journal ISSN
				ncbi.get_pmid_list_for_issn(journalIssn, function(err, list){
					console.log('     Article Count: ' + list.length);
					// list = ['21779478']; //for local testing
					// List = All PMID retrieved from PubMed query using Journal ISSN (limit set to 80000 in API request to PubMed DB. updated get_pmid_list_for_issn if archive larger than 80k)
					async.mapSeries(list, function(pmid, map_cb){
						console.log('---- PMID: ' + pmid);
						// Now we have a list of PMID from PubMed. Now get IDs from Paperchase, paperchase_id will be used for filename. If not in DB, then the DOI or PII from the XML will be used for the filename, these are logged in console.
						getPaperchaseArticlesAndSaveXml(journal, pmid, function(articleXmlErr, articleXmlRes){
							if(articleXmlErr) {
								console.log('     ERROR');
								console.error(articleXmlErr);
								map_cb();
							}else{
								// console.log('articleXmlRes',articleXmlRes);
								map_cb(null, articleXmlRes);
							}
						});
					}, function(err, articlesXmlList){
						if(err) {
							console.log('     ERROR:');
							console.log(err);
							cbBatch(err);
						} else {
							// articlesXmlList = list of all XML uploaded to S3. Contains article IDs and XML URLs
							// All XML uploaded. Now return the array of articles to Paperchase to then update the DB
							articlesXmlList = shared.removeEmptyFromArray(articlesXmlList);
							console.log('articlesXmlList',articlesXmlList);
							cbBatch(null, articlesXmlList); // remove empty before returning to Paperchase
						}
					});
				});
			}
			db.close();
		});
	}
}