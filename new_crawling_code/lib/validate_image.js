'use strict';

const Promise = require('./promise');
const Magic = require('mmmagic').Magic;
module.exports = (path) => new Promise((resolve, reject) => {
    let magic = new Magic;
    magic.detectFile(path, (err, data) => {
        console.log('file:', data);
        err ? reject(err) : data.indexOf('image data') === -1 ? reject(new Error(data)) :
            resolve();
    });
});
