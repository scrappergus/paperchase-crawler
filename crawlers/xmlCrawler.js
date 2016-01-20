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

function get_xml_string_from_url(xml_url, cb) {
	request(xml_url, function(err, res, body) {
		cb(null, body);
	});
}

function get_idlist_from_abstract_xml(xml_string, cb) {
	// console.log('... get_idlist_from_abstract_xml');
	xml2js.parseString(xml_string, function(parse_err, parse_res) {
		var idList = parse_res.PubmedArticleSet.PubmedArticle[0].PubmedData[0].ArticleIdList[0].ArticleId;
		formatIdList(idList,cb);
	});
}

function formatIdList(idList,cb){
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
	// console.log('... massage_articleid_list');
	async.map(idlist, function(id, map_cb){
		map_cb(null, {type: id.$.IdType, id: id._});
	}, function(err, res){
		cb(null, res);
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

function getAndSavePmcXml(paperchaseIdList, journal, cb){
	// PMC ID and PII exist, now query PMC to get Full Text XML
	// XML full text filename based on PII.
	// paperchaseId = paperchaseId.replace(/\//g,'_');
	var fullTextXmlFilename = paperchaseIdList.paperchase_id + '.xml';
	if(paperchaseIdList.pmc){
		var full_xml_url = 'http://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi/?db=pmc&report=xml&id=' + paperchaseIdList.pmc;
		console.log('     Upload: ' + fullTextXmlFilename + '. PMID: ' + paperchaseIdList.pmid + '. PMC XML: ' + full_xml_url);
		get_xml_string_from_url(full_xml_url, function(full_xml_err, full_xml_body){
			async.series([
				function(scb) {
					// Upload Full Text XML
					upload_xml_string_as_file_to_s3(journal, full_xml_body, fullTextXmlFilename, scb);
				}
			],function(series_err, series_res){
				if(series_err) {
					console.error(series_err);
					cb(series_err);
				} else {
					var pair = {
						paperchase_id: paperchaseIdList.paperchase_id,
						pmid: paperchaseIdList.pmid,
						full_xml_url: series_res[0]
					};
					console.log('     Upload success: ' + series_res[0]);
					// console.log(pair);
					cb(null, pair);
				}
			});
		});
	}else{
		cb(null,null);
	}
}

function get_and_save_article_xml(journal, pmid, cb) {
	// console.log('... get_and_save_article_xml : ' + pmid);
	paperchase.getArticlePaperchaseIdsViaPmid(pmid,journal,function(paperchaseIdError,paperchaseIdList){
		if(paperchaseIdError){
			console.error('paperchaseIdError',paperchaseIdError);
		}else if(paperchaseIdList){
			getAndSavePmcXml(paperchaseIdList, journal, function(uploadXmlError,uploadXmlRes){
				if(uploadXmlError){
					console.error('uploadXmlError',uploadXmlError);
				}else if(uploadXmlRes){
					cb(null,uploadXmlRes);
				}
			});
		}else{
			console.log('     MISSING Paperchase ID : PMID = ' + pmid);
			cb(null,null);
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
				// var dbCollection = db.collection('xml');
				ncbi.get_pmid_list_for_issn(journalIssn, function(err, list){
					console.log('     Article Count: ' + list.length);
					// list = ['21779478']; //for local testing
					// List = All PMID retrieved from PubMed query using Journal ISSN (limit set to 80000 in API request to PubMed DB. updated get_pmid_list_for_issn if archive larger than 80k)
					async.mapSeries(list, function(pmid, map_cb){
						console.log('---- PMID: ' + pmid);
						// Using PMID, retrieve abstract XML from PubMed and PMC ID, then if PMC ID retrieve full text XML
						get_and_save_article_xml(journal, pmid, function(articleXmlErr, articleXmlRes){
							if(articleXmlErr) {
								console.log('     ERROR');
								console.error(articleXmlErr);
								map_cb();
							}else{
								// console.log('articleXmlRes');console.log(articleXmlRes);
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