var config = require('./config');
var fs = require('fs');
var s3 = require('s3');
var async = require('async');
var request = require('request');
var MongoClient = require('mongodb').MongoClient;
var xml2js = require('xml2js');
var request = require('request');

var dbURL = 'mongodb://localhost:27017/paperchase';

var ISSN_list = [{journal: "aging", issn:"1945-4589"},
				 {journal: "oncotarget", issn:"1949-2553"},
				 {journal: "oncoscience", issn:" 2331-4737"},
				 {journal: "genesandcancer", issn:"1947-6027"}];

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
	xml2js.parseString(xml_string, function(parse_err, parse_res) {
		var idlist = parse_res.PubmedArticleSet.PubmedArticle[0].PubmedData[0].ArticleIdList[0].ArticleId;
		massage_articleid_list(idlist, cb);
	});
}

function massage_articleid_list(idlist, cb) {
	async.map(idlist, function(id, map_cb){
		map_cb(null, {type: id.$.IdType, id: id._});
	}, function(err, res){
		cb(null, res);
	});
}

function get_pmid_list_for_issn(issn, cb) {
	var xml_pmid_list_url = "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term="+issn+"&RetMax=800";
	request(xml_pmid_list_url, function(err, res, body){
		if(err) {
			cb(err);
		} else {
			xml2js.parseString(body,function(parse_err, parse_res){
				if(parse_err) {
					cb(parse_err);
				}
				else {
					var pmid_list = parse_res.eSearchResult.IdList[0].Id;
					cb(null, pmid_list);
				}
			});
		}
	});
}

function upload_xml_string_as_file_to_s3(xml_string, xml_filename, cb) {
	var tempdir = "./temp";
	if (!fs.existsSync(tempdir)){
		fs.mkdirSync(tempdir);
	}
	var xml_filepath = tempdir + "/" + xml_filename;
	fs.writeFile(xml_filepath, xml_string, function(err){
		if(err) {
			cb(err);
		} else {
			var uploader = s3Client.uploadFile({localFile: xml_filepath, s3Params: {Bucket: config.s3.bucket, Key: xml_filename}});
			uploader.on("error", function(err) {cb(err)});
			uploader.on("progress", function() {console.log(xml_filename+" progress:", uploader.progressTotal)});
			uploader.on("end", function() {
				var s3url = s3.getPublicUrlHttp(config.s3.bucket, xml_filename);
				cb(null, s3url);
				fs.unlink(xml_filepath);
			});
		}
	});
}

function get_pmcid_from_idlist(idlist, cb) {
	async.filterSeries(idlist, function(id, filter_cb){
		console.log(id);
		filter_cb((id.type == "pmc"));
	}, function(res){
		if(res.length < 1) cb("no PMCID, skipping");
		else cb(null, res[0].id);
	});
}

function get_idlist_s3url_pair_from_pmid(pmid, cb) {
	var abstract_xml_filename = Date.now()+"_"+pmid+".xml";
	var abstract_xml_url = "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi/?db=pubmed&report=xml&id="+pmid;
	get_xml_string_from_url(abstract_xml_url, function(abstract_xml_err, abstract_xml_body){
		if(abstract_xml_err) {
			cb(abstract_xml_err);
		} else {
			get_idlist_from_abstract_xml(abstract_xml_body, function(idlist_err, idlist) {
				if(idlist_err) {
					cb(idlist_err);
				} else {
					get_pmcid_from_idlist(idlist, function(pmcid_err, pmcid){
						if(pmcid_err) {
							upload_xml_string_as_file_to_s3(abstract_xml_body, abstract_xml_filename, function(err, s3url){
								if(err) { cb(err); }
								else {
									var pair = {ids: idlist, abstract_xml_url: s3url};
									cb(null, pair);
								}
							});
						} else {
							var full_xml_filename = Date.now()+"_"+pmcid+".xml";
							var full_xml_url = "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi/?db=pmc&report=xml&id="+pmcid;
							get_xml_string_from_url(full_xml_url, function(full_xml_err, full_xml_body){
								async.series([
									function(scb) {
										upload_xml_string_as_file_to_s3(abstract_xml_body, abstract_xml_filename, scb);
									},
									function(scb) {
										upload_xml_string_as_file_to_s3(full_xml_body, full_xml_filename, scb);
									}
								],function(series_err, series_res){
									if(series_err) { cb(series_err); }
									else {
										var pair = {ids: idlist, abstract_xml_url: series_res[0], full_xml_url: series_res[1]};
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

MongoClient.connect(dbURL, function(err, db) {
	async.eachSeries(ISSN_list, function(current_issn_data, each_issn_cb){
		var current_issn = current_issn_data.issn;
		var current_journal = current_issn_data.journal;
		var current_db_collection = db.collection(current_journal+"_xml");
		get_pmid_list_for_issn(current_issn, function(err, list){
			async.mapSeries(list, function(pmid, map_cb){
				console.log("start processing: " + pmid);
				get_idlist_s3url_pair_from_pmid(pmid, function(pair_err, pair_res){
					if(pair_err) { console.error(pair_err); map_cb(); }
					else { map_cb(null, pair_res); }
				});
			}, function(err, journal_stored_xml_list){
				if(err) {
					console.error(err);
				} else {
					async.each(journal_stored_xml_list, function(o, each_xml_cb){
						if(!o) {
							each_xml_cb();
						} else {
							current_db_collection.update({ids: {"$in": o.ids}}, o, {upsert: true});
							console.log(o);
							console.log("stored!");
							each_xml_cb();
						}
					}, function() {
						each_issn_cb();
					});
				}
			});
		});
	}, function() {
		console.log("done!");
		db.close();
	});
});
