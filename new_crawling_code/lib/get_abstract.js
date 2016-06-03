'use strict';

module.exports = (page) => page('.abstract').children('p').text();
