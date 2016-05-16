'use strict';

var config = require('../../config');
var aws = require('aws-sdk');
var Promise = require('bluebird');

aws.config.update({
	accessKeyId: config.s3.key,
	secretAccessKey: config.s3.secret
});

var s3 = new aws.S3();

exports.upload = function(journal, filename, pdf) {
	return new Promise(function(resolve, reject) {
        console.log(config.s3);
		s3.upload({
			Bucket: config.journalSettings[journal].bucket,
			Key: 'pdf/' + filename,
			Body: pdf
		}, function(err, data) {
            console.log(err, data);
			err ? reject(err) : resolve(data);
		});
	});
};
