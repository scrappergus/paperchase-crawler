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

function get_xml_with_figures_by_pii(journal_name, pii, cb) {
	var query = {"ids": {"type": "pii", "id": pii}};
	async.waterfall([
		function(wcb) {
			var collection_name = journal_name+"_xml";
			mongo_query(collection_name, query, wcb);
		},
		function(xml_data, wcb) {
			var collection_name = journal_name+"_figures";
			mongo_query(collection_name, query, function(err, res) {
				if(err) { wcb(err); return; }
				if(res.length < 1) { wcb(null, xml_data); return; }
				xml_data.figures = res[0].figures;
				console.log(res);
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
	var journal_name = req.params.journalname;
	var pii = req.params.pii;
	get_xml_with_figures_by_pii(journal_name, pii, function(xml_err, xml_res) {
		if(xml_err) {
			res.status(500).send(JSON.stringify(xml_err));
		} else {
			res.send(JSON.stringify(xml_res));
		}
	});
});

app.listen(4932);
console.log("Server started");
