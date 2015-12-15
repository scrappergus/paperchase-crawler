var config = require('../config');
var fs = require('fs');
var s3 = require('s3');
var async = require('async');
var request = require('request');
var MongoClient = require('mongodb').MongoClient;
var xml2js = require('xml2js');
var request = require('request');
var express = require('express');
var journalSettings = config.journalSettings;

var s3Client = s3.createClient({
	s3Options: {
		accessKeyId: config.s3.key,
		secretAccessKey: config.s3.secret
	}
});

function get_xml_string_from_url(xml_url, cb) {
	// console.log('... get_xml_string_from_url');
	request(xml_url, function(err, res, body) {
		cb(null, body);
	});
}

function get_idlist_from_abstract_xml(xml_string, cb) {
	// console.log('... get_idlist_from_abstract_xml');
	xml2js.parseString(xml_string, function(parse_err, parse_res) {
		var idlist = parse_res.PubmedArticleSet.PubmedArticle[0].PubmedData[0].ArticleIdList[0].ArticleId;
		// console.log(idlist);
		massage_articleid_list(idlist, cb);
	});
}

function massage_articleid_list(idlist, cb) {
	// console.log('... massage_articleid_list');
	async.map(idlist, function(id, map_cb){
		map_cb(null, {type: id.$.IdType, id: id._});
	}, function(err, res){
		cb(null, res);
	});
}

function get_pmid_list_for_issn(issn, cb) {
	// console.log('... get_pmid_list_for_issn : ' + issn);
	// var xml_pmid_list_url = "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term="+issn+"&RetMax=80000";
	var pmidListUrl = "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term="+issn+"&RetMax=8"; // for testing locally, smaller response
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
}

function upload_xml_string_as_file_to_s3(xml_string, xml_filename, cb) {
	// console.log('... upload_xml_string_as_file_to_s3 :' + xml_filename);
	var tempdir = './temp';
	if (!fs.existsSync(tempdir)){
		fs.mkdirSync(tempdir);
	}
	var xml_filepath = tempdir + "/" + xml_filename; // Temporary local path for XML
	// String to XML
	fs.writeFile(xml_filepath, xml_string, function(err){
		if(err) {
			cb(err);
		} else {
			// Upload XML to S3
			var uploader = s3Client.uploadFile({
				localFile: xml_filepath,
				s3Params: {
					Bucket: config.s3.bucket,
					Key: xml_filename
				}
			});
			uploader.on('error', function(err) {cb(err)});
			uploader.on('progress', function() {
				// console.log('.....'+xml_filename+' progress:', uploader.progressTotal);
				console.log('..... '+xml_filename+' progress:', Math.round(uploader.progressAmount / uploader.progressTotal * 100) + '% done');
			});
			uploader.on('end', function() {
				var s3url = s3.getPublicUrlHttp(config.s3.bucket, xml_filename);
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

function get_and_save_article_xml(pmid, cb) {
	// console.log('... get_and_save_article_xml : ' + pmid);
	var abstract_xml_filename = Date.now()+'_'+pmid+'.xml';
	var abstract_xml_url = "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi/?db=pubmed&report=xml&id="+pmid;
	// Use the PMID to then get the PMC ID, which will then be used below to get the Full Text XML from PMC
	// Get XML containing article IDs (and abstract)
	get_xml_string_from_url(abstract_xml_url, function(abstract_xml_err, abstract_xml_body){
		if(abstract_xml_err) {
			cb(abstract_xml_err);
		} else {
			// Parse XML to get aricle ID list
			get_idlist_from_abstract_xml(abstract_xml_body, function(idlist_err, idlist) {
				if(idlist_err) {
					cb(idlist_err);
				} else {
					// loop through ID list to retrieve PMC ID
					get_pmcid_from_idlist(idlist, function(pmcid_err, pmcid){
						if(pmcid_err) {
							// Upload abstract XML even if no PMC ID
							upload_xml_string_as_file_to_s3(abstract_xml_body, abstract_xml_filename, function(err, s3url){
								if(err) { cb(err); }
								else {
									var pair = {ids: idlist, abstract_xml_url: s3url};
									cb(null, pair);
								}
							});
						} else {
							// PMC ID exists, now query PMC to get Full Text XML
							var full_xml_filename = Date.now() + '_' + pmcid + '.xml';
							var full_xml_url = 'http://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi/?db=pmc&report=xml&id='+pmcid;
							get_xml_string_from_url(full_xml_url, function(full_xml_err, full_xml_body){
								async.series([
									function(scb) {
										// Upload Abstract XML
										upload_xml_string_as_file_to_s3(abstract_xml_body, abstract_xml_filename, scb);
									},
									function(scb) {
										// Upload Full Text XML
										upload_xml_string_as_file_to_s3(full_xml_body, full_xml_filename, scb);
									}
								],function(series_err, series_res){
									if(series_err) {
										cb(series_err);
									}
									else {
										var pair = {
											ids: idlist,
											abstract_xml_url: series_res[0],
											full_xml_url: series_res[1]
										};
										console.log('Upload success!');
										console.log(pair);
										cb(null, pair);
									}
								});
							});
						}
					});
				}
			});
		}
	});
}

module.exports = {
	batchByJournal: function(journal){
		var journalDb = journalSettings[journal].dbUrl,
			journalIssn = journalSettings[journal].issn;

		MongoClient.connect(journalDb, function(err, db) {
			console.log('--- Begin Crawler : ' + journal);
			var dbCollection = db.collection('xml');

			get_pmid_list_for_issn(journalIssn, function(err, list){
				// List = All PMID retrieved from PubMed query using Journal ISSN (limit set to 80000 in API request to PubMed DB. updated get_pmid_list_for_issn if archive larger than 80k)
				async.mapSeries(list, function(pmid, map_cb){
					console.log('---- PMID: ' + pmid);
					// Using PMID, retrieve abstract XML from PubMed and PMC ID, then if PMC ID retrieve full text XML
					get_and_save_article_xml(pmid, function(articleXmlErr, articleXmlRes){
						if(articleXmlErr) {
							console.error(articleXmlErr);
							map_cb();
						}else{
							// console.log('articleXmlRes');console.log(articleXmlRes);
							map_cb(null, articleXmlRes);
						}
					});
				}, function(err, articlesXmlList){
					if(err) {
						console.error('ERROR:');
						console.error(err);
					} else {
						// articlesXmlList = list of all XML uploaded to S3. Contains article IDs and XML URLs
						// All XML uploaded. Now update the DB with the XML URLs
						async.each(articlesXmlList, function(article, cbDb){
							if(!article) {
								cbDb();
							} else {
								// TODO: keep track of previous XML versions
								dbCollection.update({ids: {'$in': article.ids}}, article, {upsert: true}, function(upsertErr, upsertRes){
									if(upsertErr){
										console.error('ERROR:');
										console.err(upsertErr);
									}else{
										// console.error('UPDATED:');
										// console.log(upsertRes.result);
									}
									cbDb();
								});
							}
						}, function(upsertErr) {
							if (upsertErr) {
								return console.log(upsertErr);
							}
							console.log('--------- ' + journal + ': articles ---------');
							console.log('Article Count = ' + list.length); // just count of all PMID for journal
							console.log('Updated Count = ' + articlesXmlList.length); // count of articles that got updated
						});
					}
				});
			});
		});
	}
}