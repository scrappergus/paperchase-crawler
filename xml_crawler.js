var config = require('./config');
var fs = require('fs');
var async = require('async');
var request = require('request');
var MongoClient = require('mongodb').MongoClient;
var xml2js = require('xml2js');
var JSFtp = require("jsftp");
var request = require('request');

var express = require('express');
var api = express();

var dbURL = 'mongodb://localhost:27017/paperchase';

var ISSN_list = ["1945-4589", "", "", ""];

function get_xml_string_with_added_doi(xml_info, cb) {
	request(xml_info.url, function(err, res, body) {
		if(!err) {
			xml2js.parseString(body, function(parse_err, parse_res) {
				var doi = "10.18632/oncotarget."+xml_info.pii;
				parse_res.PubmedArticleSet.PubmedArticle[0].PubmedData[0].ArticleIdList[0].ArticleId.push({"_":doi, "$":{"IdType": "doi"}});
				var builder = new xml2js.Builder();
				var xml = builder.buildObject(parse_res);
				cb(null, xml);
			});
		} else {
			cb(err);
		}
	});
}

function convert_article_title_to_uid(title_string, cb) {
	var journal_name = "oncotarget";
	var pmid_query_url = "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term="+encodeURIComponent(title_string)+"+"+journal_name+"&RetMax=1";
	var pmcid_query_url = "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term="+encodeURIComponent(title_string)+"+"+journal_name+"&RetMax=1";
	get_uid_from_esearch_url(pmid_query_url, function(err, res){
		if(err) {
			get_uid_from_esearch_url(pmcid_query_url, function(err_pmc, res_pmc) {
				if(err_pmc) cb(err_pmc);
				else cb(null, {"type": "pmcid", "uid": res_pmc});
			});
		} else {
			cb(null, {"type": "pmid", "uid": res});
		}
	});
}

function uid_list_from_pii_list(pii_list, cb) {
	var pii_list_string = pii_list.join(",");
	var article_json_url = config.doicontrol_url+"/doi-control/?journal=oncotarget&pii="+pii_list_string;
	request(article_json_url, function(err, res, body) {
		if(err){
			cb(err);
		} else if (res.statusCode != 200) {
			cb({"error": "There was an error getting the article JSON when converting PIIs to PMIDs", "body": body});
		} else {
			var articles = JSON.parse(body)["articles"];
			async.mapSeries(articles, function(article, map_cb){
				convert_article_title_to_uid(article.title, function(err,res) {
					res.pii = article.pii;
					map_cb(err, res);
			});
			}, cb);
		}
	});
}

function get_uid_from_esearch_url(url, cb) {
	request(url, function(err, res, body){
		if(err) {
			cb(err);
		} else {
			xml2js.parseString(body, function(parse_err, parse_res) {
				if(parse_err) {
					cb(parse_err);
				}
				else {
					var pmid_list = parse_res.eSearchResult.IdList[0].Id;
					if(pmid_list != void 0 && pmid_list.length > 0) cb(null, pmid_list[0]);
					else cb({"error": "There was no UID for url: "+url});
				}
			});
		}
	});
}

function uid_list_to_xml_url_list(uid_list, cb) {
	async.mapSeries(uid_list, function(uid, map_cb) {
		var url_bases = {
			"pmid": "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi/?db=pubmed&report=xml&id=",
			"pmcid": "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi/?db=pmc&report=xml&id=PMC"
		};
		map_cb(null, {"pii": uid.pii, "type": uid.type, "uid": uid.uid, "url": url_bases[uid.type]+uid.uid});
	}, cb);
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

function upload_xml_string_as_file_to_ftp(xml_string, xml_filename, cb) {
	var ftp = new JSFtp({
		host: config.ftp.host,
		user: config.ftp.user,
		pass: config.ftp.pass
	});
	var xml_buffer = new Buffer(xml_string);
	ftp.put(xml_buffer, xml_filename, function(err){
		if(err) cb(err)
		else cb(null, "success!");
	});
}

api.get('/add-doi/:piis', function(req, response) {
	var pii_list = req.params.piis.split(",");
	uid_list_from_pii_list(pii_list, function(err, res){
		if(err) {
			console.error(err);
		} else {
			uid_list_to_xml_url_list(res, function(url_err, url_res){
				async.eachSeries(url_res, function(cur_url, each_cb) {
					get_xml_string_with_added_doi(cur_url, function(xml_err, xml_res){
						upload_xml_string_as_file_to_ftp(xml_res, "oncotarget_"+cur_url.uid+".xml", each_cb);
					});
				}, function(each_err, each_res) {
					var data = {};
					if(each_err) data = {"error": each_err};
					else data = {"success": true};
					response.setHeader('Content-Type', 'application/json');
					response.send(JSON.stringify(data));
				});

			});
		}
	});
});

api.listen(4933);
console.log("Server started");
