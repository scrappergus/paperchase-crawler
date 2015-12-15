var fs = require('fs');
var async = require('async');
var request = require('request');
var express = require('express');
var MongoClient = require('mongodb').MongoClient;
// Custom
var config = require('./config');
var crawler = require('./crawlers/xmlCrawler');
var journalSettings = config.journalSettings;

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
	crawler.batchByJournal(journalName, function(crawl_xml_err, crawl_xml_res) {
		if(crawl_xml_err) {
			res.send(JSON.stringify(crawl_xml_err));
		} else {
			res.send(JSON.stringify(crawl_xml_res));
		}
	});
});

app.listen(4932, function(){

});
console.log("Server started");