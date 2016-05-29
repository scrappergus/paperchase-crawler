'use strict';

var config = require('../../config');
var aws = require('aws-sdk');
var Promise = require('bluebird');

aws.config.update({
	accessKeyId: config.s3.key,
	secretAccessKey: config.s3.secret
});

var s3 = new aws.S3();

exports.upload = function(journal, filename, stream) {
	return new Promise(function(resolve, reject) {
		s3.upload({
			Bucket: config.journalSettings[journal].bucket,
			Key: 'paper_figures/' + filename,
			Body: stream
		}, function(err, data) {
			err ? reject(err) : resolve(data);
		});
	});
};

exports.retrieve = function(journal) {
	return new Promise(function(resolve, reject) {
		s3.listObjects({Bucket: config.journalSettings[journal].bucket}, function(err, data) {
			err? reject(err): resolve(data.Contents);
		});
	});
};

//exports.delete = function(objects) {
//	return new Promise(function(resolve, reject) {
//		s3.deleteObjects({
//		  Bucket: config.journalSettings[journal].bucket,
//		  Delete: {
//		    Objects: objects,
//		    Quiet: false
//		  }
//		}, function(err, data) {
//			err? reject(err): resolve(data);
//		});
//	});
//};
