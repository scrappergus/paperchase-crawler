'use strict';

var cheerio = require('cheerio');
var Promise = require('bluebird');
var request = require('request');
var http = require('http');

var BASE_URL = 'http://www.ncbi.nlm.nih.gov';

exports.getPage = function(pmc) {
	// return augmented page in promise
	return new Promise(function(resolve, reject) {
		var url = BASE_URL + '/pmc/articles/PMC' + pmc.replace('PMC', '');
  		request.get(url, function(err, response, body) {
  			err ? reject(err) : resolve(cheerio.load(body));
  		});
	});
};

exports.getImage = function(path) {
	// return download stream in promise
	return new Promise(function(resolve) {
		http.get(BASE_URL + path, function(stream) {
			resolve(stream);
		});
	});
};
