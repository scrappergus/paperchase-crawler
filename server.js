var fs = require('fs');
var async = require('async');
var request = require('request');
var express = require('express');
var MongoClient = require('mongodb').MongoClient;

var dbURL = 'mongodb://localhost:27017/paperchase';

var app = express();

app.use(express.static('public'));

function mongo_query(collection_name, query, cb) {
	MongoClient.connect(dbURL, function(db_err, db) {
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
	mongo_query(collection_name, {}, cb);
}

function get_xml_data_by_pii(journal_name, pii, cb) {
	var collection_name = journal_name+"_xml";
	var query = {"ids": {"type": "pii", "id": pii}};
	mongo_query(collection_name, query, cb);
}

function get_figures_by_pii(journal_name, pii, cb) {
	var collection_name = journal_name+"_figures";
	var query = {"ids": {"type": "pii", "id": pii}};
	mongo_query(collection_name, query, cb);
}

function get_pdf_by_pii(journal_name, pii, cb) {
	var collection_name = journal_name+"_pdfs";
	var query = {"ids": {"type": "pii", "id": pii}};
	mongo_query(collection_name, query, cb);
}

function get_xml_with_files_by_pii(journal_name, pii, cb) {
	async.waterfall([
		function(wcb) {
			get_xml_data_by_pii(journal_name, pii, wcb);
		},
		function(xml_data, wcb) {
			if(xml_data.length == 0) {wcb({"error": "No XML data found for this PII."}); return; };
			get_pdf_by_pii(journal_name, pii, function(err, pdf) {
				if(pdf.length != 0) xml_data[0].pdf_url = pdf[0].pdf_url;

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
	get_xml_with_files_by_pii(journal_name, pii, function(xml_err, xml_res) {
		if(xml_err) {
			res.send(JSON.stringify(xml_err));
		} else {
			res.send(JSON.stringify(xml_res));
		}
	});
});

app.listen(4932);
console.log("Server started");
