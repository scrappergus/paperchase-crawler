'use strict';

var cheerio = require('cheerio');
var Promise = require('bluebird');
var request = require('request');
var http = require('http');

var BASE_URL = 'http://www.ncbi.nlm.nih.gov';

exports.getPage = function(pmc) {
	return new Promise(function(resolve, reject) {
		var pmcId = pmc
			.replace('PMC', '');

		var url = BASE_URL + '/pmc/articles/PMC' + pmcId;
  		request.get(url, function(err, response, body) {
  			err ? reject(err) : resolve(cheerio.load(body));
  		});
	});
};

exports.getFile = function(path) {
	return new Promise(function(resolve) {
		http.get(BASE_URL + path, function(stream) {
			resolve(stream);
		});
	});
};
